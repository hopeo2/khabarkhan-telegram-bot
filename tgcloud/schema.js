import { table, integer, text, index, sql } from 'sdk/db';

// Key/value configuration for the bot (group id, admins, schedule, ...).
export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Every item that has already been published, used to avoid repeating stories.
export const postedItems = table(
  'posted_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    source: text('source'),
    category: text('category').notNull(),
    postedAt: integer('posted_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    categoryIdx: index('idx_posted_category').on(t.category),
    postedAtIdx: index('idx_posted_posted_at').on(t.postedAt),
  })
);

// One row per published digest (news or sports), for status/history.
export const postLog = table(
  'post_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull(),
    chatId: integer('chat_id'),
    messageId: integer('message_id'),
    itemCount: integer('item_count').default(0),
    trigger: text('trigger'),
    actorId: integer('actor_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    createdAtIdx: index('idx_post_log_created_at').on(t.createdAt),
  })
);
