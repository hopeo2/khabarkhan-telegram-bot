// Persian UI copy and inline keyboards.

import { escapeHtml, faDigits, relativeTimeFa } from './persian.js';
import { skipText } from './jobs.js';
import { CATEGORY_LABELS } from './sources.js';

const STATE_ON = '✅ روشن';
const STATE_OFF = '⛔️ خاموش';

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

function quietLabel(config) {
  if (!config.quiet) return 'غیرفعال';
  return `از ${faDigits(config.quiet.start)} تا ${faDigits(config.quiet.end)}`;
}

function groupLabel(config) {
  return config.groupId ? faDigits(config.groupId) : 'تنظیم نشده ⚠️';
}

export function startText(config, isAdmin) {
  const lines = [
    '👋 <b>سلام!</b>',
    '',
    'من اخبار و ورزش را از خبرگزاری‌های فارسی جمع می‌کنم و در گروه شما منتشر می‌کنم.',
  ];
  if (!config.adminIds.length) {
    lines.push('', '🔑 هنوز ادمینی تعیین نشده است. با /claim اولین ادمین شوید.');
  } else if (isAdmin) {
    lines.push('', 'شما ادمین هستید. برای مدیریت /panel را بزنید.');
  } else {
    lines.push('', 'برای مدیریت ربات با ادمین گروه تماس بگیرید.');
  }
  lines.push('', 'راهنمای دستورها: /help');
  return lines.join('\n');
}

export function helpText() {
  return [
    '🤖 <b>راهنمای ربات محتوا</b>',
    '',
    '<b>دستورهای عمومی</b>',
    '/start – شروع',
    '/id – نمایش شناسهٔ چت و کاربر',
    '/claim – تعیین اولین ادمین (فقط یک‌بار)',
    '/help – همین راهنما',
    '',
    '<b>دستورهای ادمین</b>',
    '/panel – پنل مدیریت',
    '/post [خبر|ورزش|هردو] – ارسال فوری',
    '/status – وضعیت و آخرین نتیجه',
    '/settings – تنظیمات فعلی',
    '/on و /off – روشن/خاموش کردن ارسال خودکار',
    '/setinterval 3 – فاصلهٔ ارسال خودکار (۱ تا ۴۸ ساعت)',
    '/setcounts 2 1 – تعداد خبر و ورزش در هر ارسال (۰ تا ۵)',
    '/quiet 2-7 – بازهٔ سکوت به وقت تهران، یا /quiet off',
    '/images on|off – نمایش تصویر خبر در پست‌ها',
    '/setgroup – ثبت گروه فعلی (در گروه) یا /setgroup -100...',
    '/addadmin 123456 – افزودن ادمین (یا ریپلای روی پیام او)',
    '/deladmin 123456 – حذف ادمین',
    '/feeds – بررسی سلامت منابع خبری',
  ].join('\n');
}

export function panelText(config, now = Date.now()) {
  const last = config.lastRunAt
    ? relativeTimeFa(now / 1000 - config.lastRunAt)
    : 'هنوز اجرا نشده';

  return [
    '⚙️ <b>پنل مدیریت محتوا</b>',
    '',
    `وضعیت خودکار: ${config.enabled ? STATE_ON : STATE_OFF}`,
    `فاصله: هر ${faDigits(config.intervalHours)} ساعت`,
    `هر ارسال: ${faDigits(config.newsCount)} خبر + ${faDigits(config.sportsCount)} ورزش`,
    `گروه مقصد: ${groupLabel(config)}`,
    `آخرین ارسال: ${last}`,
  ].join('\n');
}

export function panelKeyboard(config) {
  return {
    inline_keyboard: [
      [
        { text: '📰 ارسال خبر', callback_data: 'post:news' },
        { text: '🏆 ارسال ورزش', callback_data: 'post:sports' },
      ],
      [{ text: '🚀 ارسال هر دو', callback_data: 'post:all' }],
      [
        {
          text: config.enabled ? '⛔️ خاموش کردن خودکار' : '✅ روشن کردن خودکار',
          callback_data: 'toggle',
        },
      ],
      [
        {
          text: config.images ? '🖼 تصویر خبر: روشن' : '🖼 تصویر خبر: خاموش',
          callback_data: 'images',
        },
      ],
      [
        { text: '📊 وضعیت', callback_data: 'status' },
        { text: '🧪 منابع', callback_data: 'feeds' },
      ],
      [{ text: '🧾 تنظیمات', callback_data: 'settings' }],
    ],
  };
}

export function backKeyboard() {
  return { inline_keyboard: [[{ text: '⬅️ بازگشت به پنل', callback_data: 'panel' }]] };
}

export function statusText(config, stats = {}, now = Date.now()) {
  const last = config.lastRunAt
    ? `${relativeTimeFa(now / 1000 - config.lastRunAt)}`
    : 'هنوز اجرا نشده';

  const lines = [
    '📊 <b>وضعیت ربات</b>',
    '',
    `• ارسال خودکار: ${config.enabled ? STATE_ON : STATE_OFF}`,
    `• فاصله: هر ${faDigits(config.intervalHours)} ساعت`,
    `• تعداد هر ارسال: ${faDigits(config.newsCount)} خبر + ${faDigits(config.sportsCount)} ورزش`,
    `• بازهٔ سکوت: ${quietLabel(config)}`,
    `• گروه مقصد: ${groupLabel(config)}`,
    `• آخرین اجرا: ${last}`,
    `• کل آیتم‌های منتشرشده: ${faDigits(stats.totalPosted ?? 0)}`,
    `• ادمین‌ها: ${faDigits(config.adminIds.length)} نفر`,
  ];

  if (config.lastResult) {
    lines.push('', '<b>آخرین نتیجه</b>', formatResult(config.lastResult, false));
  }

  return lines.join('\n');
}

export function settingsText(config) {
  return [
    '🧾 <b>تنظیمات فعلی</b>',
    '',
    `• ارسال خودکار: ${config.enabled ? STATE_ON : STATE_OFF}`,
    `• فاصله: هر ${faDigits(config.intervalHours)} ساعت`,
    `• تعداد خبر: ${faDigits(config.newsCount)}`,
    `• تعداد ورزش: ${faDigits(config.sportsCount)}`,
    `• حداکثر عمر خبر: ${faDigits(config.maxAgeHours)} ساعت`,
    `• تصویر خبر: ${config.images ? STATE_ON : STATE_OFF}`,
    `• بازهٔ سکوت: ${quietLabel(config)}`,
    `• گروه مقصد: ${groupLabel(config)}`,
    `• ادمین‌ها: ${config.adminIds.map((id) => faDigits(id)).join('، ') || 'ندارد'}`,
    '',
    'برای تغییر: /setinterval، /setcounts، /quiet، /images، /setgroup، /addadmin',
  ].join('\n');
}

export function formatResult(result, withTitle = true) {
  if (!result) return 'نتیجه‌ای ثبت نشده است.';

  if (result.skipped) {
    return `⏸ ${escapeHtml(skipText(result.skipped))}`;
  }

  const lines = [];
  if (withTitle) {
    lines.push(result.ok ? '✅ <b>ارسال انجام شد</b>' : '⚠️ <b>ارسالی انجام نشد</b>');
  }

  for (const post of result.posted || []) {
    const images = Number(post.withImages) || 0;
    const suffix = images ? ` (${faDigits(images)} با تصویر)` : '';
    lines.push(`• ${categoryLabel(post.category)}: ${faDigits(post.count)} مورد${suffix}`);
  }

  if (result.errors?.length) {
    lines.push('', '<b>خطاها</b>');
    for (const error of result.errors.slice(0, 6)) {
      lines.push(`• ${escapeHtml(error)}`);
    }
  }

  return lines.join('\n') || 'نتیجه‌ای ثبت نشده است.';
}

export function feedsText(rows) {
  const lines = ['🧪 <b>سلامت منابع</b>', ''];
  for (const row of rows) {
    const label = `${row.feed.name} (${categoryLabel(row.feed.category)})`;
    if (row.error && !row.count) {
      lines.push(`❌ ${escapeHtml(label)}: ${escapeHtml(row.error)}`);
    } else {
      lines.push(`✅ ${escapeHtml(label)}: ${faDigits(row.count)} آیتم`);
    }
  }
  return lines.join('\n');
}
