// Minimal RSS/Atom reader. No external XML library exists in the runtime, so
// this uses targeted regexes against the well-formed feeds we consume.

import { fetch } from 'sdk';
import { cleanText, collapseWhitespace, decodeEntities, truncate } from './persian.js';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let match;
  while ((match = re.exec(xml)) !== null) out.push(match[1]);
  return out;
}

function cdata(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return match ? match[1] : text;
}

function tagText(block, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
    const match = block.match(re);
    if (match) {
      const value = collapseWhitespace(cdata(match[1]));
      if (value) return value;
    }
  }
  return '';
}

function absoluteUrl(link, base) {
  const value = String(link ?? '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  const origin = String(base ?? '').match(/^(https?:\/\/[^/]+)/i);
  if (!origin) return '';
  if (value.startsWith('/')) return `${origin[1]}${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return ''; // mailto:, urn:, ...
  return `${origin[1]}/${value.replace(/^\.?\//, '')}`;
}

function extractLink(block, feedUrl) {
  const href = block.match(/<link[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
  if (href) return absoluteUrl(decodeEntities(href[1]), feedUrl);

  const text = tagText(block, ['link', 'guid']);
  if (text && !/^urn:/i.test(text)) return absoluteUrl(decodeEntities(text), feedUrl);
  return '';
}

function extractSummary(block) {
  const raw = tagText(block, ['description', 'summary', 'content:encoded', 'content']);
  if (!raw) return '';
  let text = cleanText(raw, 320);

  // Drop agency datelines and boilerplate.
  const agencies =
    'ایرنا|ایسنا|خبرگزاری مهر|مهر|باشگاه خبرنگاران|بی‌بی‌سی فارسی|خبرآنلاین|یورونیوز فارسی|ورزش سه|طرفداری';
  text = text.replace(
    new RegExp(`^[\\u0600-\\u06FF\\s]{2,30}\\s*[-–—]\\s*(?:${agencies})\\s*[-–—]\\s*`, 'u'),
    ''
  );
  text = text.replace(new RegExp(`^(?:${agencies})\\s*[-–—:]\\s*`, 'u'), '');
  text = text.replace(new RegExp(`^به گزارش\\s+(?:${agencies})[،,]\\s*`, 'u'), '');

  // Datelines like "بوشهر_ اجتماع مردم…" or "تهران - سخنگو گفت…".
  const cities =
    'تهران|بوشهر|مشهد|اصفهان|شیراز|تبریز|اهواز|کرج|قم|رشت|کرمان|یزد|همدان|ارومیه|کرمانشاه|زاهدان|ساری|گرگان|بندرعباس|اردبیل|بجنورد|خرم‌آباد|سنندج|ایلام|شهرکرد|سمنان|قزوین|اراک|آبادان|خرمشهر|کیش|قشم|لندن|نیویورک|واشنگتن|پکن|مسکو';
  text = text.replace(new RegExp(`^(?:${cities})\\s*[_\\-–—]\\s*`, 'u'), '');
  text = text.replace(/^[\u0600-\u06FF]{2,20}_\s+/u, '');

  text = text.replace(/\s*(The post .*? appeared first on .*)$/i, '');
  text = text.replace(/\s*(ادامه مطلب|متن کامل خبر|بیشتر بخوانید).*$/u, '');

  return truncate(text.trim(), 280);
}

function extractDate(block) {
  const raw = tagText(block, ['pubDate', 'published', 'updated', 'dc:date', 'date']);
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(value);
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1]) : '';
}

function usableImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/\.(svg|gif)(?:[?#]|$)/i.test(url)) return false;
  if (/(pixel|tracker|tracking|feedburner|doubleclick|spacer|1x1)/i.test(url)) return false;
  return true;
}

/** Ask for a larger render when the feed only advertises a thumbnail. */
function normalizeImage(url) {
  const bbc = String(url).match(/^(https?:\/\/ichef\.bbci\.co\.uk\/ace\/[a-z]+\/)(\d{2,4})(\/.+)$/i);
  if (bbc && Number(bbc[2]) < 800) return `${bbc[1]}800${bbc[3]}`;
  return url;
}

/**
 * Best image URL for an item. Prefers media:content with a width, then
 * enclosures, thumbnails and finally the first <img> inside the content.
 */
function extractImage(block, feedUrl) {
  const candidates = [];
  const push = (url, width) => {
    const absolute = normalizeImage(absoluteUrl(url, feedUrl));
    if (usableImage(absolute)) {
      candidates.push({ url: absolute, width: Number(width) || 0 });
    }
  };

  for (const match of block.matchAll(/<media:content\b[^>]*>/gi)) {
    const tag = match[0];
    const type = attr(tag, 'type').toLowerCase();
    const medium = attr(tag, 'medium').toLowerCase();
    if (type && !type.startsWith('image/') && medium !== 'image') continue;
    push(attr(tag, 'url'), attr(tag, 'width'));
  }

  for (const match of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const tag = match[0];
    const type = attr(tag, 'type').toLowerCase();
    const url = attr(tag, 'url');
    if (type && !type.startsWith('image/')) continue;
    if (!type && !/\.(jpe?g|png|webp)(?:[?#]|$)/i.test(url)) continue;
    push(url, attr(tag, 'width'));
  }

  for (const match of block.matchAll(/<media:thumbnail\b[^>]*>/gi)) {
    const tag = match[0];
    push(attr(tag, 'url'), attr(tag, 'width'));
  }

  const imageBlock = block.match(/<image[^>]*>([\s\S]*?)<\/image>/i);
  if (imageBlock) push(tagText(imageBlock[1], ['url']), 0);

  const imgTag = block.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (imgTag) push(decodeEntities(imgTag[1]), 0);

  candidates.sort((a, b) => b.width - a.width);
  return candidates.length ? candidates[0].url : null;
}

export function parseFeed(xml, feed) {
  if (!xml || typeof xml !== 'string') return [];
  const source = String(xml).slice(0, 3_000_000);
  const rawItems = [...blocks(source, 'item'), ...blocks(source, 'entry')];
  const items = [];

  for (const raw of rawItems) {
    const title = cleanText(tagText(raw, ['title']), 220);
    if (!title || title.length < 6) continue;

    const url = extractLink(raw, feed.url);
    if (!looksLikeUrl(url)) continue;

    const summary = extractSummary(raw);
    const publishedAt = extractDate(raw);
    const image = extractImage(raw, feed.url);

    items.push({
      title,
      url,
      summary,
      image,
      publishedAt,
      sourceId: feed.id,
      sourceName: feed.name,
      category: feed.category,
      priority: Number(feed.priority) || 0,
    });
  }

  return items;
}

export async function fetchFeed(feed) {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  };

  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(12_000)
      : undefined;

  try {
    let res;
    try {
      res = await fetch(feed.url, { headers, ...(signal ? { signal } : {}) });
    } catch (err) {
      // Some fetch implementations may not understand `signal`; retry plainly,
      // but never retry a timeout/abort (that would hang for another 12s).
      const aborted = err?.name === 'AbortError' || err?.name === 'TimeoutError';
      if (!signal || aborted) throw err;
      res = await fetch(feed.url, { headers });
    }

    if (!res.ok) {
      return { feed, items: [], error: `HTTP ${res.status}` };
    }

    const xml = await res.text();
    const items = parseFeed(xml, feed);
    return { feed, items, error: items.length ? null : 'no items' };
  } catch (err) {
    return { feed, items: [], error: err?.message ? String(err.message) : 'fetch failed' };
  }
}


