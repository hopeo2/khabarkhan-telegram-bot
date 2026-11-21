import { api, db } from 'sdk';
import { postedItems } from '../schema.js';
import { checkFeeds } from '../lib/content.js';
import { runScheduledJob } from '../lib/jobs.js';
import { isAdmin, loadConfig, setSetting } from '../lib/settings.js';
import {
  backKeyboard,
  feedsText,
  formatResult,
  panelKeyboard,
  panelText,
  settingsText,
  statusText,
} from '../lib/ui.js';

async function editOrSend(query, text, keyboard) {
  const message = query.message;
  const extra = {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  };

  if (message?.chat?.id && message?.message_id) {
    try {
      await api.editMessageText({
        chat_id: message.chat.id,
        message_id: message.message_id,
        text,
        ...extra,
      });
      return;
    } catch (err) {
      if (err?.code === 400 && /not modified/i.test(String(err?.description || ''))) {
        return;
      }
      // Fall through to a fresh message.
    }
  }

  if (message?.chat?.id) {
    await api.sendMessage({ chat_id: message.chat.id, text, ...extra });
  }
}

async function answer(query, text, alert = false) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text,
      show_alert: alert,
    });
  } catch {
    // The query may already have expired.
  }
}

export default async function (query) {
  const data = String(query.data || '');
  const config = await loadConfig();

  if (!isAdmin(config, query.from?.id)) {
    await answer(query, '⛔️ دسترسی ندارید.', true);
    return;
  }

  const [action, argument] = data.split(':');

  try {
    await handleAction(query, action, argument, config);
  } catch (err) {
    console.error('callback failed', action, err);
    await answer(query, '⚠️ خطای غیرمنتظره‌ای رخ داد.', true);
    await editOrSend(query, '⚠️ خطای غیرمنتظره‌ای رخ داد. کمی بعد دوباره تلاش کنید.', backKeyboard());
  }
}

async function handleAction(query, action, argument, config) {
  switch (action) {
    case 'panel': {
      await answer(query);
      await editOrSend(query, panelText(config), panelKeyboard(config));
      return;
    }

    case 'status': {
      await answer(query);
      const totalPosted = await db.$count(postedItems);
      await editOrSend(query, statusText(config, { totalPosted }), panelKeyboard(config));
      return;
    }

    case 'settings': {
      await answer(query);
      await editOrSend(query, settingsText(config), backKeyboard());
      return;
    }

    case 'toggle': {
      const enabled = !config.enabled;
      await setSetting('enabled', enabled ? '1' : '0');
      const fresh = await loadConfig();
      await answer(query, enabled ? 'ارسال خودکار روشن شد.' : 'ارسال خودکار خاموش شد.');
      await editOrSend(query, panelText(fresh), panelKeyboard(fresh));
      return;
    }

    case 'images': {
      const images = !config.images;
      await setSetting('images', images ? '1' : '0');
      const fresh = await loadConfig();
      await answer(query, images ? 'تصویر خبر روشن شد.' : 'تصویر خبر خاموش شد.');
      await editOrSend(query, panelText(fresh), panelKeyboard(fresh));
      return;
    }

    case 'feeds': {
      await answer(query, 'در حال بررسی منابع…');
      const rows = await checkFeeds();
      await editOrSend(query, feedsText(rows), backKeyboard());
      return;
    }

    case 'post': {
      const categories =
        argument === 'news' ? ['news'] : argument === 'sports' ? ['sports'] : undefined;
      await answer(query, 'در حال آماده‌سازی و ارسال…');
      const result = await runScheduledJob({
        force: true,
        categories,
        trigger: 'manual',
        actorId: query.from?.id ?? null,
      });
      await editOrSend(query, formatResult(result), backKeyboard());
      return;
    }

    default: {
      await answer(query, 'گزینهٔ ناشناخته.');
    }
  }
}
