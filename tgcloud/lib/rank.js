// Deduplication and ranking. Pure functions only.

import { normalizeForCompare } from './persian.js';

const STOPWORDS = new Set([
  'و', 'در', 'به', 'از', 'که', 'این', 'را', 'با', 'برای', 'است', 'شد', 'شده',
  'می', 'ها', 'های', 'یک', 'تا', 'بر', 'هم', 'یا', 'اما', 'نیز', 'بود', 'کرد',
  'کند', 'خود', 'آن', 'دو', 'وی', 'او', 'چه', 'چی', 'همه', 'بین', 'پس', 'دیگر',
]);

function tokenSet(value) {
  const words = normalizeForCompare(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return new Set(words);
}

export function similarTitles(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return false;
  if (normalizeForCompare(a) === normalizeForCompare(b)) return true;

  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  const smaller = Math.min(left.size, right.size);
  return shared >= 2 && shared / smaller >= 0.6;
}

export function normalizeUrl(value) {
  let url = String(value ?? '').trim();
  const hash = url.indexOf('#');
  if (hash !== -1) url = url.slice(0, hash);

  const query = url.indexOf('?');
  const base = (query === -1 ? url : url.slice(0, query)).replace(/\/+$/, '');
  if (query === -1) return base;

  const params = url
    .slice(query + 1)
    .split('&')
    .filter(
      (param) =>
        param &&
        !/^(utm_|at_|fbclid=|gclid=|mc_cid=|mc_eid=|igshid=|ref=|source=|si=|pk_)/i.test(param)
    );

  return params.length ? `${base}?${params.join('&')}` : base;
}

/**
 * Filter out old/duplicate items and sort the rest by a freshness+priority score.
 * `seenUrls` is a Set of normalized URLs, `seenTitles` an array of raw titles.
 */
export function dedupeAndRank(items, { seenUrls, seenTitles, maxAgeHours = 24, now = Date.now() } = {}) {
  const urls = seenUrls instanceof Set ? seenUrls : new Set();
  const titles = Array.isArray(seenTitles) ? seenTitles.slice() : [];
  const kept = [];

  for (const item of items) {
    if (!item || !item.title || !item.url) continue;

    const url = normalizeUrl(item.url);
    if (urls.has(url)) continue;

    const ageHours = item.publishedAt
      ? Math.max(0, (now - item.publishedAt) / 3_600_000)
      : 12;
    if (maxAgeHours > 0 && ageHours > maxAgeHours) continue;

    if (titles.some((title) => similarTitles(title, item.title))) continue;

    const score =
      (Number(item.priority) || 0) * 3 -
      ageHours * 0.25 +
      (item.summary ? 0.5 : 0);

    urls.add(url);
    titles.push(item.title);
    kept.push({ ...item, url, ageHours, score });
  }

  kept.sort((a, b) => b.score - a.score);
  return kept;
}

/** Prefer one item per source, then fill the remaining slots from the rest. */
export function pickDiverse(items, count, maxPerSource = 1) {
  const limit = Math.max(0, Math.floor(count) || 0);
  if (!limit) return [];

  const picked = [];
  const perSource = new Map();

  for (const item of items) {
    if (picked.length >= limit) break;
    const used = perSource.get(item.sourceId) || 0;
    if (used >= maxPerSource) continue;
    picked.push(item);
    perSource.set(item.sourceId, used + 1);
  }

  if (picked.length < limit) {
    const chosen = new Set(picked);
    for (const item of items) {
      if (picked.length >= limit) break;
      if (chosen.has(item)) continue;
      picked.push(item);
      chosen.add(item);
    }
  }

  return picked;
}
