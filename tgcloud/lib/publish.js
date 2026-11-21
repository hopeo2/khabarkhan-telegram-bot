import { api, db } from 'sdk';
import { postedItems, postLog } from '../schema.js';
import {
  buildDigest,
  buildItemContent,
  CAPTION_LIMIT,
  TEXT_LIMIT,
} from './digest.js';
import { collapseWhitespace, decodeEntities } from './persian.js';

function plainText(html) {
  return collapseWhitespace(decodeEntities(html.replace(/<[^>]+>/g, ' ')));
}

async function sendText(chatId, html) {
  const options = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  };

  try {
    return await api.sendMessage(options);
  } catch (err) {
    // If an entity slipped through, retry as plain text rather than losing the post.
    if (err?.code === 400) {
      return api.sendMessage({
        chat_id: chatId,
        text: plainText(html),
        link_preview_options: { is_disabled: true },
      });
    }
    throw err;
  }
}

/**
 * Send one story. A photo carries the whole story in its caption, so the title
 * and summary are always visible; if the picture cannot be fetched it degrades
 * to a text message with the same content.
 */
async function sendItem(chatId, category, item, index, { first, last }) {
  if (item.image) {
    const caption = buildItemContent(category, item, index, {
      first,
      last,
      limit: CAPTION_LIMIT,
    });

    try {
      const message = await api.sendPhoto({
        chat_id: chatId,
        photo: item.image,
        caption,
        parse_mode: 'HTML',
      });
      return { message, viaPhoto: true };
    } catch (err) {
      console.error('photo failed, sending as text', err?.description || err?.message);
    }
  }

  const text = buildItemContent(category, item, index, {
    first,
    last,
    limit: TEXT_LIMIT,
  });
  return { message: await sendText(chatId, text), viaPhoto: false };
}

async function remember(category, items, { chatId, messageId, trigger, actorId }) {
  for (const item of items) {
    await db.run(
      `INSERT OR IGNORE INTO posted_items (url, title, source, category, posted_at)
       VALUES (:url, :title, :source, :category, unixepoch())`,
      {
        ':url': item.url,
        ':title': item.title,
        ':source': item.sourceName || null,
        ':category': category,
      }
    );
  }

  await db
    .insert(postLog)
    .values({
      category,
      chatId,
      messageId,
      itemCount: items.length,
      trigger,
      actorId: actorId ?? null,
    })
    .run();
}

/**
 * Format and send one category, then remember every item so it is never
 * repeated.
 *
 * - `useImages: true`  → one message per story (photo + caption, or text).
 * - `useImages: false` → one compact text digest for the whole category.
 */
export async function publishCategory({
  category,
  items,
  chatId,
  trigger = 'cron',
  actorId = null,
  useImages = true,
}) {
  if (!items?.length) return null;

  if (!useImages) {
    const text = buildDigest(category, items);
    if (!text) return null;
    const message = await sendText(chatId, text);
    await remember(category, items, {
      chatId,
      messageId: message?.message_id ?? null,
      trigger,
      actorId,
    });
    return {
      category,
      count: items.length,
      messageId: message?.message_id ?? null,
      withImages: 0,
      errors: [],
    };
  }

  const sent = [];
  const errors = [];
  let withImages = 0;
  let messageId = null;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const first = sent.length === 0;
    const last = index === items.length - 1;

    try {
      const result = await sendItem(chatId, category, item, index, { first, last });
      messageId = messageId ?? result.message?.message_id ?? null;
      if (result.viaPhoto) withImages += 1;
      sent.push(item);
    } catch (err) {
      errors.push(`${item.sourceName || 'منبع'}: ${err?.description || err?.message || err}`);
    }
  }

  if (!sent.length) {
    return { category, count: 0, messageId: null, withImages: 0, errors };
  }

  await remember(category, sent, { chatId, messageId, trigger, actorId });

  return { category, count: sent.length, messageId, withImages, errors };
}
