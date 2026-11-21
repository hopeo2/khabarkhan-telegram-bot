import { api, db } from 'sdk';
import { postedItems } from '../schema.js';
import { checkFeeds } from '../lib/content.js';
import { runScheduledJob } from '../lib/jobs.js';
import {
  addAdmin,
  claimFirstAdmin,
  isAdmin,
  loadConfig,
  removeAdmin,
  setSetting,
} from '../lib/settings.js';
import { faDigits } from '../lib/persian.js';
import {
  feedsText,
  formatResult,
  helpText,
  panelKeyboard,
  panelText,
  settingsText,
  startText,
  statusText,
} from '../lib/ui.js';

const ALIASES = {
  شروع: 'start',
  راهنما: 'help',
  پنل: 'panel',
  وضعیت: 'status',
  تنظیمات: 'settings',
  ارسال: 'post',
  تصویر: 'images',
};

const ADMIN_COMMANDS = new Set([
  'panel',
  'post',
  'status',
  'settings',
  'setinterval',
  'setcounts',
  'quiet',
  'images',
  'setgroup',
  'addadmin',
  'deladmin',
  'feeds',
  'on',
  'off',
]);

let cachedBot = null;

async function bot() {
  if (!cachedBot) cachedBot = await api.getMe();
  return cachedBot;
}

async function send(chatId, text, extra = {}) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

function parseCommand(text) {
  const match = text.match(/^\/([^\s@]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return {
    name: match[1].toLowerCase(),
    bot: match[2] || null,
    args: (match[3] || '').trim(),
  };
}

function parseCategories(arg) {
  const value = String(arg || '').trim().toLowerCase();
  if (!value) return undefined;
  if (['خبر', 'اخبار', 'news'].includes(value)) return ['news'];
  if (['ورزش', 'ورزشی', 'sport', 'sports'].includes(value)) return ['sports'];
  if (['هردو', 'هر دو', 'all', 'both'].includes(value)) return ['news', 'sports'];
  return undefined;
}

async function postNow(message, categories) {
  const chatId = message.chat.id;
  const progress = await send(chatId, '⏳ در حال جمع‌آوری و ارسال محتوا…');

  const result = await runScheduledJob({
    force: true,
    categories,
    trigger: 'manual',
    actorId: message.from?.id ?? null,
  });

  const text = formatResult(result);
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: progress.message_id,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch {
    await send(chatId, text);
  }
}

async function handleAdminCommand(command, message, args, config) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  switch (command) {
    case 'panel': {
      await send(chatId, panelText(config), { reply_markup: panelKeyboard(config) });
      return;
    }

    case 'post': {
      await postNow(message, parseCategories(args));
      return;
    }

    case 'status': {
      const totalPosted = await db.$count(postedItems);
      await send(chatId, statusText(config, { totalPosted }));
      return;
    }

    case 'settings': {
      await send(chatId, settingsText(config));
      return;
    }

    case 'on': {
      await setSetting('enabled', '1');
      await send(chatId, '✅ ارسال خودکار روشن شد.');
      return;
    }

    case 'off': {
      await setSetting('enabled', '0');
      await send(chatId, '⛔️ ارسال خودکار خاموش شد. ارسال دستی همچنان کار می‌کند.');
      return;
    }

    case 'setinterval': {
      const hours = Number(args);
      if (!Number.isInteger(hours) || hours < 1 || hours > 48) {
        await send(chatId, '⚠️ فاصله باید عددی صحیح بین ۱ تا ۴۸ ساعت باشد. مثال: <code>/setinterval 3</code>');
        return;
      }
      await setSetting('interval_hours', String(hours));
      await send(chatId, `✅ فاصلهٔ ارسال خودکار روی هر ${faDigits(hours)} ساعت تنظیم شد.`);
      return;
    }

    case 'setcounts': {
      const numbers = args.split(/[\s,،]+/).filter(Boolean).map(Number);
      const [news, sports] = numbers;
      if (
        numbers.length !== 2 ||
        !Number.isInteger(news) ||
        !Number.isInteger(sports) ||
        news < 0 ||
        sports < 0 ||
        news > 5 ||
        sports > 5 ||
        news + sports === 0
      ) {
        await send(
          chatId,
          '⚠️ دو عدد بین ۰ تا ۵ بفرستید که مجموعشان صفر نباشد. مثال: <code>/setcounts 2 1</code>'
        );
        return;
      }
      await setSetting('news_count', String(news));
      await setSetting('sports_count', String(sports));
      await send(
        chatId,
        `✅ هر ارسال شامل ${faDigits(news)} خبر و ${faDigits(sports)} ورزش شد.`
      );
      return;
    }

    case 'quiet': {
      const value = args.toLowerCase();
      if (!value) {
        await send(
          chatId,
          '⚠️ شکل درست: <code>/quiet 2-7</code> برای بازهٔ سکوت، یا <code>/quiet off</code> برای غیرفعال کردن.'
        );
        return;
      }
      if (value === 'off' || value === '0') {
        await setSetting('quiet_hours', '');
        await send(chatId, '✅ بازهٔ سکوت غیرفعال شد.');
        return;
      }
      const match = value.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
      if (!match) {
        await send(chatId, '⚠️ شکل درست: <code>/quiet 2-7</code> یا <code>/quiet off</code>');
        return;
      }
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (start < 0 || start > 23 || end < 0 || end > 23 || start === end) {
        await send(chatId, '⚠️ ساعت‌ها باید بین ۰ تا ۲۳ و متفاوت باشند.');
        return;
      }
      await setSetting('quiet_hours', `${start}-${end}`);
      await send(
        chatId,
        `✅ از ساعت ${faDigits(start)} تا ${faDigits(end)} به وقت تهران ارسال خودکار متوقف می‌شود.`
      );
      return;
    }

    case 'images': {
      const value = args.toLowerCase();
      if (!['on', 'off', '1', '0', 'روشن', 'خاموش'].includes(value)) {
        await send(
          chatId,
          [
            '⚠️ شکل درست: <code>/images on</code> یا <code>/images off</code>',
            '',
            'با «روشن»، هر خبر همراه با تصویر خودش (اگر خبرگزاری تصویر داده باشد) در یک آلبوم ارسال می‌شود.',
          ].join('\n')
        );
        return;
      }
      const enabled = ['on', '1', 'روشن'].includes(value);
      await setSetting('images', enabled ? '1' : '0');
      await send(
        chatId,
        enabled
          ? '✅ تصویر خبر روشن شد. از این پس خبرها با عکس منتشر می‌شوند.'
          : '✅ تصویر خبر خاموش شد. از این پس فقط متن منتشر می‌شود.'
      );
      return;
    }

    case 'setgroup': {
      let groupId = null;
      if (message.chat.type === 'group' || message.chat.type === 'supergroup') {
        groupId = message.chat.id;
      } else if (/^-?\d+$/.test(args)) {
        groupId = Number(args);
      }

      if (!groupId) {
        await send(
          chatId,
          '⚠️ این دستور را داخل گروه بزنید، یا شناسهٔ گروه را بفرستید: <code>/setgroup -1001234567890</code>'
        );
        return;
      }

      await setSetting('group_chat_id', String(groupId));
      await send(chatId, `✅ گروه مقصد ثبت شد: <code>${faDigits(groupId)}</code>`);
      return;
    }

    case 'addadmin': {
      const target = Number(args) || message.reply_to_message?.from?.id;
      if (!Number.isFinite(target) || target <= 0) {
        await send(chatId, '⚠️ آیدی عددی کاربر را بفرستید یا روی پیام او ریپلای کنید.');
        return;
      }
      await addAdmin(target);
      await send(chatId, `✅ کاربر <code>${faDigits(target)}</code> ادمین شد.`);
      return;
    }

    case 'deladmin': {
      const target = Number(args) || message.reply_to_message?.from?.id;
      if (!Number.isFinite(target) || target <= 0) {
        await send(chatId, '⚠️ آیدی عددی کاربر را بفرستید یا روی پیام او ریپلای کنید.');
        return;
      }
      if (target === userId && config.adminIds.length === 1) {
        await send(chatId, '⚠️ شما تنها ادمین هستید؛ نمی‌توانید خودتان را حذف کنید.');
        return;
      }
      const removed = await removeAdmin(target);
      await send(
        chatId,
        removed
          ? `✅ کاربر <code>${faDigits(target)}</code> از ادمین‌ها حذف شد.`
          : 'ℹ️ این کاربر ادمین نبود.'
      );
      return;
    }

    case 'feeds': {
      const progress = await send(chatId, '⏳ در حال بررسی منابع…');
      const rows = await checkFeeds();
      const text = feedsText(rows);
      try {
        await api.editMessageText({
          chat_id: chatId,
          message_id: progress.message_id,
          text,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      } catch {
        await send(chatId, text);
      }
      return;
    }

    default:
      return;
  }
}

export default async function (message) {
  const text = message.text;
  if (!text || message.from?.is_bot) return;

  const chat = message.chat;
  const isPrivate = chat.type === 'private';

  if (!text.startsWith('/')) {
    if (isPrivate) await send(chat.id, helpText());
    return;
  }

  const parsed = parseCommand(text);
  if (!parsed) return;

  if (parsed.bot) {
    const me = await bot();
    if (parsed.bot.toLowerCase() !== String(me.username || '').toLowerCase()) return;
  }

  const command = ALIASES[parsed.name] || parsed.name;
  const config = await loadConfig();
  const admin = isAdmin(config, message.from.id);

  if (command === 'start') {
    if (isPrivate) {
      await send(chat.id, startText(config, admin));
    } else {
      await send(chat.id, '👋 ربات محتوا فعال است. ادمین‌ها برای مدیریت در پیوی ربات /panel را بزنند.');
    }
    return;
  }

  if (command === 'help') {
    await send(chat.id, helpText());
    return;
  }

  if (command === 'id') {
    await send(
      chat.id,
      [
        '🆔 <b>شناسه‌ها</b>',
        `چت: <code>${faDigits(chat.id)}</code>`,
        `کاربر: <code>${faDigits(message.from.id)}</code>`,
        `نوع چت: <code>${chat.type}</code>`,
        chat.title ? `عنوان: ${chat.title}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
    return;
  }

  if (command === 'claim') {
    if (!isPrivate) {
      await send(chat.id, '🔒 دستور /claim فقط در پیوی ربات کار می‌کند.');
      return;
    }
    const outcome = await claimFirstAdmin(message.from.id);
    if (outcome === 'claimed') {
      await send(chat.id, '✅ شما اولین ادمین ربات شدید. /panel را بزنید.');
    } else if (outcome === 'taken') {
      await send(chat.id, 'ℹ️ ادمین قبلاً تعیین شده است. از ادمین فعلی بخواهید شما را اضافه کند.');
    } else {
      await send(chat.id, '⚠️ شناسهٔ کاربری معتبر نیست.');
    }
    return;
  }

  if (!ADMIN_COMMANDS.has(command)) {
    await send(chat.id, '🤔 دستور ناشناخته است. /help را ببینید.');
    return;
  }

  if (!admin) {
    if (isPrivate) {
      await send(chat.id, '⛔️ این دستور فقط برای ادمین‌هاست.');
    }
    return;
  }

  try {
    await handleAdminCommand(command, message, parsed.args, config);
  } catch (err) {
    console.error('admin command failed', command, err);
    await send(chat.id, '⚠️ خطای غیرمنتظره‌ای رخ داد. کمی بعد دوباره تلاش کنید.');
  }
}
