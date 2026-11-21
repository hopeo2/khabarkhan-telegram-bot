// Project-level constants.
//
// You can leave these empty and configure everything from inside Telegram:
//   /claim            -> the first person to run it becomes the admin
//   /setgroup         -> run it in your group to set the destination
//
// Fill them in if you prefer to bootstrap from code.

// Telegram numeric user ids that are always admins (e.g. [123456789]).
export const BOOTSTRAP_ADMIN_IDS = [];

// Default destination group/channel id (e.g. -1001234567890). null = unset.
export const DEFAULT_GROUP_CHAT_ID = null;

export const APP = {
  title: 'محتواآور',
  // Fixed Iran offset: +03:30 (Iran no longer observes DST).
  timezoneOffsetMinutes: 210,
};

export const DEFAULTS = {
  enabled: true,
  intervalHours: 3,
  newsCount: 2,
  sportsCount: 2,
  maxAgeHours: 24,
  // Quiet window in Tehran local time, e.g. "2-7". Empty string = disabled.
  quietHours: '',
  // Post stories as photo cards when the feed provides an image.
  images: true,
};
