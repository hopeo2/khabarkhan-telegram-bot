import { db } from 'sdk';
import { desc } from 'sdk/db';
import { postedItems } from '../schema.js';
import { FEEDS } from './sources.js';
import { fetchFeed } from './rss.js';
import { dedupeAndRank, normalizeUrl, pickDiverse } from './rank.js';

/**
 * URLs/titles published recently. Loaded once per run and reused for both
 * categories, so a story cannot appear as both news and sports.
 */
export async function loadSeen(limit = 400) {
  const rows = await db
    .select({ url: postedItems.url, title: postedItems.title })
    .from(postedItems)
    .orderBy(desc(postedItems.id))
    .limit(limit)
    .all();

  return {
    urls: new Set(rows.map((row) => normalizeUrl(row.url))),
    titles: rows.map((row) => row.title),
  };
}

export function markSeen(seen, items) {
  for (const item of items) {
    seen.urls.add(normalizeUrl(item.url));
    seen.titles.push(item.title);
  }
}

/**
 * Fetch every feed in a category, drop stale/duplicate stories, rank what is
 * left and pick at most `count` items with source diversity.
 */
export async function collectCategory(category, { count, maxAgeHours = 24, seen } = {}) {
  const feeds = FEEDS.filter((feed) => feed.category === category);
  if (!feeds.length || !count) {
    return { items: [], rawCount: 0, rankedCount: 0, failures: [] };
  }

  const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed)));
  const raw = [];
  const failures = [];

  results.forEach((result, index) => {
    const feed = feeds[index];
    if (result.status === 'fulfilled') {
      raw.push(...result.value.items);
      if (result.value.error) {
        failures.push({ source: feed.name, error: result.value.error });
      }
    } else {
      failures.push({
        source: feed.name,
        error: String(result.reason?.message || result.reason || 'unknown error'),
      });
    }
  });

  const ranked = dedupeAndRank(raw, {
    seenUrls: seen?.urls,
    seenTitles: seen?.titles,
    maxAgeHours,
    now: Date.now(),
  });

  return {
    items: pickDiverse(ranked, count),
    rawCount: raw.length,
    rankedCount: ranked.length,
    failures,
  };
}

/** Fetch every configured feed and report per-source health (for /feeds). */
export async function checkFeeds() {
  const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));
  return FEEDS.map((feed, index) => {
    const result = results[index];
    if (result.status !== 'fulfilled') {
      return { feed, count: 0, error: String(result.reason?.message || result.reason) };
    }
    return {
      feed,
      count: result.value.items.length,
      error: result.value.error,
    };
  });
}
