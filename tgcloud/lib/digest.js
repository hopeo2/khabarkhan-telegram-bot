// Builds the Persian story cards. With images on, every story is its own
// message (a photo with a caption, or plain text when the feed has no picture),
// so the title and summary are always visible to the reader.

import { escapeAttr, escapeHtml, formatTehranDateTime } from './persian.js';

const CATEGORY_META = {
  news: {
    emoji: '🗞',
    heading: 'گزیده اخبار',
    tags: '#خبر #اخبار_روز',
  },
  sports: {
    emoji: '🏆',
    heading: 'گزیده ورزش',
    tags: '#ورزش #ورزشی',
  },
};

const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/** Telegram caps photo captions at 1024 characters. */
export const CAPTION_LIMIT = 1024;

/** Safe limit for a text message (Telegram rejects over 4096). */
export const TEXT_LIMIT = 3900;

/** Limit for the single compact digest used when images are turned off. */
const MAX_LENGTH = TEXT_LIMIT;

export function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.news;
}

export function digestHeader(category, now = new Date()) {
  const meta = categoryMeta(category);
  return `${meta.emoji} <b>${meta.heading}</b>\n🕒 ${formatTehranDateTime(now)}`;
}

export function digestFooter(category) {
  return categoryMeta(category).tags;
}

/** Shorten plain text without breaking HTML (escaping happens afterwards). */
function clip(text, max) {
  const value = String(text ?? '').trim();
  if (value.length <= max) return value;
  if (max <= 1) return '';
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * One story as HTML. Shrinks the summary, then the title, until it fits `max`
 * characters of the final (escaped) markup.
 */
export function buildItemHtml(item, index, { max = CAPTION_LIMIT } = {}) {
  const number = NUMBERS[index] || '•';
  const source = `<a href="${escapeAttr(item.url)}">${escapeHtml(item.sourceName || 'منبع')}</a>`;

  const render = (title, summary) => {
    let out = `${number} <b>${escapeHtml(title)}</b>`;
    if (summary) out += `\n${escapeHtml(summary)}`;
    return `${out}\n🔗 ${source}`;
  };

  let title = String(item.title || '').trim();
  let summary = String(item.summary || '').trim();
  let out = render(title, summary);
  if (out.length <= max) return out;

  // 1) Trim the summary, then drop it entirely.
  while (summary && out.length > max) {
    const over = out.length - max;
    summary = clip(summary, Math.max(0, summary.length - over - 1));
    out = render(title, summary);
  }

  // 2) Last resort: trim the title too.
  while (out.length > max && title.length > 12) {
    const over = out.length - max;
    title = clip(title, Math.max(12, title.length - over - 1));
    out = render(title, summary);
  }

  return out.length <= max
    ? out
    : `${number} <b>${escapeHtml(clip(item.title, 60))}</b>\n🔗 ${source}`;
}

/**
 * One story, ready to send. The digest header goes on the first card and the
 * hashtags on the last, so the set still reads as one bulletin.
 */
export function buildItemContent(
  category,
  item,
  index,
  { first = false, last = false, limit = CAPTION_LIMIT } = {}
) {
  const prefix = first ? `${digestHeader(category)}\n\n` : '';
  const suffix = last ? `\n\n${digestFooter(category)}` : '';
  const room = Math.max(200, limit - prefix.length - suffix.length);
  return `${prefix}${buildItemHtml(item, index, { max: room })}${suffix}`;
}

/** Single compact message with every story — used when images are turned off. */
export function buildDigest(category, items, now = new Date()) {
  if (!Array.isArray(items) || !items.length) return '';

  const header = digestHeader(category, now);
  const footer = digestFooter(category);
  const parts = [];
  let used = header.length + footer.length + 4;

  items.forEach((item, index) => {
    const block = `\n${buildItemHtml(item, index, { max: MAX_LENGTH })}`;

    if (used + block.length > MAX_LENGTH) {
      // Try a shorter version without the summary before giving up on this item.
      const compact = `\n${buildItemHtml({ ...item, summary: '' }, index, { max: MAX_LENGTH })}`;
      if (used + compact.length <= MAX_LENGTH) {
        parts.push(compact);
        used += compact.length;
      }
      return;
    }

    parts.push(block);
    used += block.length;
  });

  if (!parts.length) return '';

  return [header, ...parts, '', footer].join('\n');
}
