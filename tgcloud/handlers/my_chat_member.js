import { api } from 'sdk';
import { loadConfig, setSetting } from '../lib/settings.js';
import { notifyAdmins } from '../lib/notify.js';

function groupTitle(chat) {
  return chat.title || chat.username || String(chat.id);
}

/**
 * Fires when the bot itself is added to / removed from a chat, so the
 * destination group is configured automatically.
 */
export default async function (update) {
  const chat = update.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;

  const next = update.new_chat_member?.status;
  const previous = update.old_chat_member?.status;
  const joined =
    (next === 'member' || next === 'administrator') &&
    (previous === 'left' || previous === 'kicked' || previous === undefined);

  if (joined) {
    await setSetting('group_chat_id', String(chat.id));
    try {
      await api.sendMessage({
        chat_id: chat.id,
        text: [
          '✅ <b>ربات محتوا فعال شد</b>',
          '',
          'از این پس اخبار و ورزش را به‌صورت خودکار در این گروه منتشر می‌کنم.',
          'ادمین‌ها می‌توانند در پیوی ربات /panel را بزنند و ارسال را دستی هم شروع کنند.',
        ].join('\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // The group may not allow messages yet; the id is already saved.
    }
    await notifyAdmins(
      `✅ ربات به گروه «${groupTitle(chat)}» اضافه شد و به‌عنوان گروه مقصد ثبت شد.`
    );
    return;
  }

  if (next === 'left' || next === 'kicked') {
    const config = await loadConfig();
    if (config.groupId === chat.id) {
      await setSetting('group_chat_id', '');
      await notifyAdmins(
        `⚠️ ربات از گروه «${groupTitle(chat)}» حذف شد. گروه مقصد پاک شد؛ برای تنظیم دوباره ربات را اضافه کنید یا /setgroup بزنید.`
      );
    }
  }
}
