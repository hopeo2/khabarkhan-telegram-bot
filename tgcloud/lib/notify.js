import { api } from 'sdk';
import { loadConfig } from './settings.js';

/** Best-effort DM to every admin. Never throws. */
export async function notifyAdmins(text) {
  const config = await loadConfig();
  for (const adminId of config.adminIds) {
    try {
      await api.sendMessage({
        chat_id: adminId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // The admin may not have started the bot yet.
    }
  }
}
