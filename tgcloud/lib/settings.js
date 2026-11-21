import { db } from 'sdk';
import { settings } from '../schema.js';
import { BOOTSTRAP_ADMIN_IDS, DEFAULT_GROUP_CHAT_ID, DEFAULTS } from './config.js';

const SEED = {
  enabled: DEFAULTS.enabled ? '1' : '0',
  interval_hours: String(DEFAULTS.intervalHours),
  news_count: String(DEFAULTS.newsCount),
  sports_count: String(DEFAULTS.sportsCount),
  max_age_hours: String(DEFAULTS.maxAgeHours),
  quiet_hours: DEFAULTS.quietHours,
  images: DEFAULTS.images ? '1' : '0',
  group_chat_id: DEFAULT_GROUP_CHAT_ID == null ? '' : String(DEFAULT_GROUP_CHAT_ID),
  admin_ids: BOOTSTRAP_ADMIN_IDS.join(','),
  last_run_at: '0',
  last_result: '',
  lock_until: '0',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function intOr(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function ensureSettings() {
  const entries = Object.entries(SEED);
  const params = {};
  const values = entries
    .map(([key, value], index) => {
      params[`:k${index}`] = key;
      params[`:v${index}`] = String(value);
      return `(:k${index}, :v${index}, unixepoch())`;
    })
    .join(', ');

  await db.run(
    `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ${values}`,
    params
  );
}

export async function getSettingsMap() {
  const rows = await db.select().from(settings).all();
  const map = {};
  for (const row of rows) map[row.key] = row.value ?? '';
  return map;
}

export async function setSetting(key, value) {
  await db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (:key, :value, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    { ':key': key, ':value': String(value ?? '') }
  );
}

function parseQuiet(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'off' || value === '0') return null;
  const match = value.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) return null;
  const start = clamp(Number(match[1]), 0, 23);
  const end = clamp(Number(match[2]), 0, 23);
  if (start === end) return null;
  return { start, end };
}

export function inQuietHours(hour, quiet) {
  if (!quiet) return false;
  const { start, end } = quiet;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function parseLastResult(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadConfig() {
  await ensureSettings();
  const map = await getSettingsMap();

  const admins = String(map.admin_ids || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  const groupId = intOr(map.group_chat_id, 0);

  return {
    enabled: map.enabled !== '0',
    intervalHours: clamp(intOr(map.interval_hours, DEFAULTS.intervalHours), 1, 48),
    newsCount: clamp(intOr(map.news_count, DEFAULTS.newsCount), 0, 5),
    sportsCount: clamp(intOr(map.sports_count, DEFAULTS.sportsCount), 0, 5),
    maxAgeHours: clamp(intOr(map.max_age_hours, DEFAULTS.maxAgeHours), 1, 168),
    quiet: parseQuiet(map.quiet_hours),
    images: map.images !== '0',
    groupId: groupId || null,
    adminIds: admins,
    lastRunAt: intOr(map.last_run_at, 0),
    lastResult: parseLastResult(map.last_result),
  };
}

export function isAdmin(config, userId) {
  return config.adminIds.includes(Number(userId));
}

export async function addAdmin(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const config = await loadConfig();
  if (config.adminIds.includes(id)) return true;
  await setSetting('admin_ids', [...config.adminIds, id].join(','));
  return true;
}

export async function removeAdmin(userId) {
  const id = Number(userId);
  const config = await loadConfig();
  const next = config.adminIds.filter((value) => value !== id);
  if (next.length === config.adminIds.length) return false;
  await setSetting('admin_ids', next.join(','));
  return true;
}

/** Makes `userId` the first admin only when no admin exists yet. */
export async function claimFirstAdmin(userId) {
  const config = await loadConfig();
  if (config.adminIds.length) return 'taken';
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return 'invalid';
  await setSetting('admin_ids', String(id));
  return 'claimed';
}
