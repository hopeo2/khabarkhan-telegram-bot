// Persian news/sports RSS sources.
//
// Add or remove feeds freely. `priority` is used when ranking (higher = shown
// sooner). `category` must be "news" or "sports".
//
// All URLs are fetched from Telegram's infrastructure, so a feed that fails
// from your own network may still work in production (and vice versa). Use the
// /feeds command in Telegram to check health.

export const FEEDS = [
  // ---- News ---------------------------------------------------------------
  { id: 'irna', name: 'ایرنا', category: 'news', priority: 3, url: 'https://www.irna.ir/rss' },
  { id: 'isna', name: 'ایسنا', category: 'news', priority: 3, url: 'https://www.isna.ir/rss' },
  { id: 'mehr', name: 'خبرگزاری مهر', category: 'news', priority: 2, url: 'https://www.mehrnews.com/rss' },
  { id: 'yjc', name: 'باشگاه خبرنگاران', category: 'news', priority: 2, url: 'https://www.yjc.ir/fa/rss/allnews' },
  { id: 'bbc', name: 'بی‌بی‌سی فارسی', category: 'news', priority: 2, url: 'https://feeds.bbci.co.uk/persian/rss.xml' },
  { id: 'khabaronline', name: 'خبرآنلاین', category: 'news', priority: 1, url: 'https://www.khabaronline.ir/rss' },
  { id: 'euronews', name: 'یورونیوز فارسی', category: 'news', priority: 1, url: 'https://parsi.euronews.com/rss' },

  // ---- Sports -------------------------------------------------------------
  { id: 'varzesh3', name: 'ورزش سه', category: 'sports', priority: 3, url: 'https://www.varzesh3.com/rss/all' },
  { id: 'tarafdari', name: 'طرفداری', category: 'sports', priority: 3, url: 'https://www.tarafdari.com/rss.xml' },
  { id: 'mehrsport', name: 'مهر ورزشی', category: 'sports', priority: 2, url: 'https://www.mehrnews.com/rss/tp/9' },
];

export const CATEGORY_LABELS = {
  news: 'خبر',
  sports: 'ورزش',
};
