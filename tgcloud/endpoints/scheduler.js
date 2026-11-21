import { runScheduledJob } from '../lib/jobs.js';

/**
 * Scheduler entry point.
 *
 * The platform has no cron, so an external tick calls this module:
 *
 *   npx tgcloud run endpoints/scheduler '{"force": false}'
 *
 * With `force: false` it only posts when the configured interval has elapsed
 * (and the quiet window is not active), so a 15-minute cron is safe. Admin
 * buttons use `force: true` through the same job runner.
 *
 * `categories` is optional: ["news"], ["sports"] or both.
 */
export default async function (input = {}) {
  const force = input?.force === true;
  const categories = Array.isArray(input?.categories)
    ? input.categories.filter((category) => category === 'news' || category === 'sports')
    : undefined;

  return runScheduledJob({
    force,
    categories: categories?.length ? categories : undefined,
    trigger: force ? 'endpoint-manual' : 'cron',
  });
}
