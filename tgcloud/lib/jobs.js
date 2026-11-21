import { db } from 'sdk';
import { collectCategory, loadSeen, markSeen } from './content.js';
import { publishCategory } from './publish.js';
import { inQuietHours, loadConfig, setSetting } from './settings.js';
import { tehranHour } from './persian.js';

const LOCK_SECONDS = 300;

const SKIP_TEXT = {
  no_group: 'گروه مقصد تنظیم نشده است.',
  disabled: 'ارسال خودکار خاموش است.',
  quiet: 'در بازهٔ سکوت هستیم.',
  not_due: 'هنوز زمان ارسال نرسیده است.',
  busy: 'یک ارسال دیگر در حال اجراست.',
  no_categories: 'هیچ دستهٔ فعالی برای ارسال وجود ندارد.',
};

export function skipText(reason) {
  return SKIP_TEXT[reason] || reason;
}

async function acquireLock(nowSeconds) {
  const res = await db.run(
    `UPDATE settings
        SET value = :until, updated_at = unixepoch()
      WHERE key = 'lock_until'
        AND CAST(COALESCE(value, '0') AS INTEGER) <= :now`,
    { ':until': String(nowSeconds + LOCK_SECONDS), ':now': nowSeconds }
  );
  return res?.rowsAffected === 1;
}

async function releaseLock() {
  await db.run(`UPDATE settings SET value = '0' WHERE key = 'lock_until'`);
}

async function saveResult(result) {
  await setSetting('last_result', JSON.stringify(result));
}

function wantedCategories(config, requested, force) {
  const available = [
    ['news', config.newsCount],
    ['sports', config.sportsCount],
  ];

  if (!Array.isArray(requested) || !requested.length) {
    return available.filter(([, count]) => count > 0);
  }

  return available
    .filter(([category]) => requested.includes(category))
    .map(([category, count]) => [category, count > 0 ? count : force ? 2 : 0])
    .filter(([, count]) => count > 0);
}

/**
 * One scheduler tick.
 *
 * `force` skips the interval/quiet/enabled checks and is used by admin
 * commands and manual workflow runs. The database lock still applies, so a
 * cron tick and a button press can never post the same digest twice.
 */
export async function runScheduledJob({
  force = false,
  categories,
  trigger = 'cron',
  actorId = null,
} = {}) {
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const result = {
    ok: false,
    skipped: null,
    posted: [],
    errors: [],
    details: [],
    trigger,
    at: now.toISOString(),
  };

  const config = await loadConfig();

  if (!config.groupId) {
    result.skipped = 'no_group';
    return result;
  }

  if (!force && !config.enabled) {
    result.skipped = 'disabled';
    return result;
  }

  if (!force && inQuietHours(tehranHour(now), config.quiet)) {
    result.skipped = 'quiet';
    return result;
  }

  if (!force && nowSeconds - config.lastRunAt < config.intervalHours * 3600) {
    result.skipped = 'not_due';
    return result;
  }

  if (!(await acquireLock(nowSeconds))) {
    result.skipped = 'busy';
    return result;
  }

  try {
    // Re-read after taking the lock: another invocation may have just posted.
    const fresh = await loadConfig();
    if (!force && nowSeconds - fresh.lastRunAt < fresh.intervalHours * 3600) {
      result.skipped = 'not_due';
      return result;
    }

    const plan = wantedCategories(fresh, categories, force);
    if (!plan.length) {
      result.skipped = 'no_categories';
      return result;
    }

    const seen = await loadSeen();

    for (const [category, count] of plan) {
      try {
        const collected = await collectCategory(category, {
          count,
          maxAgeHours: fresh.maxAgeHours,
          seen,
        });

        result.details.push({
          category,
          raw: collected.rawCount,
          ranked: collected.rankedCount,
          picked: collected.items.length,
        });

        for (const failure of collected.failures.slice(0, 3)) {
          result.errors.push(`${failure.source}: ${failure.error}`);
        }

        if (!collected.items.length) {
          result.errors.push(
            category === 'sports'
              ? 'محتوای ورزشی تازه‌ای پیدا نشد.'
              : 'خبر تازه‌ای پیدا نشد.'
          );
          continue;
        }

        const published = await publishCategory({
          category,
          items: collected.items,
          chatId: fresh.groupId,
          trigger,
          actorId,
          useImages: fresh.images,
        });

        if (published) {
          for (const error of published.errors || []) result.errors.push(error);

          // Nothing reached the group (every send failed); do not count it as a run.
          if (published.count > 0) {
            result.posted.push(published);
            markSeen(seen, collected.items);
          }
        }
      } catch (err) {
        const reason = err?.description || err?.message || String(err);
        result.errors.push(`${category}: ${reason}`);
      }
    }

    result.ok = result.posted.length > 0;

    if (result.ok) {
      await setSetting('last_run_at', nowSeconds);
    }

    await saveResult(result);
    return result;
  } finally {
    try {
      await releaseLock();
    } catch {
      // A failed unlock only delays the next run; the TTL releases it.
    }
  }
}
