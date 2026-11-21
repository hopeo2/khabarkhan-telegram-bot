// Persian text helpers: HTML cleanup, escaping, digits, Jalali date/time.
// Pure functions only — no SDK imports, so this module is easy to test.

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  zwnj: '\u200c',
  zwj: '\u200d',
  copy: '©',
  reg: '®',
  trade: '™',
  bull: '•',
  middot: '·',
  times: '×',
  divide: '÷',
  deg: '°',
  euro: '€',
  pound: '£',
  dollar: '$',
  comma: ',',
  period: '.',
  colon: ':',
  semicolon: ';',
  quest: '?',
  excl: '!',
  lpar: '(',
  rpar: ')',
  lsqb: '[',
  rsqb: ']',
  hyphen: '-',
  minus: '−',
  plus: '+',
  equals: '=',
  percnt: '%',
  num: '#',
  sol: '/',
  bsol: '\\',
  lowbar: '_',
  verbar: '|',
};

export function faDigits(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

export function stripHtml(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

export function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

export function truncate(value, max) {
  const text = String(value ?? '').trim();
  if (!max || text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const body = space >= Math.floor(max * 0.6) ? cut.slice(0, space) : cut;
  return `${body.replace(/[،,؛;:.\s]+$/u, '')}…`;
}

export function cleanText(value, max = 0) {
  let text = collapseWhitespace(stripHtml(value));
  text = text.replace(/\s*\|\s*/g, ' | ');
  if (max) text = truncate(text, max);
  return text;
}

export function normalizeForCompare(value) {
  return collapseWhitespace(
    String(value ?? '')
      .replace(/[\u064b-\u0652\u0640]/g, '') // harakat + tatweel
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  );
}

// Gregorian -> Jalali (no Intl/ICU dependency).
function toJalali(gy, gm, gd) {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  let year = gy <= 1600 ? gy - 621 : gy - 1600;
  const leapYear = gm > 2 ? year + 1 : year;
  let days =
    365 * year +
    Math.floor((leapYear + 3) / 4) -
    Math.floor((leapYear + 99) / 100) +
    Math.floor((leapYear + 399) / 400) -
    80 +
    gd +
    gDaysInMonth[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export function tehranDate(date = new Date()) {
  return new Date(date.getTime() + 210 * 60 * 1000);
}

export function tehranHour(date = new Date()) {
  return tehranDate(date).getUTCHours();
}

export function formatTehranDateTime(date = new Date()) {
  const local = tehranDate(date);
  const [jy, jm, jd] = toJalali(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)} – ${faDigits(hh)}:${faDigits(mm)}`;
}

export function relativeTimeFa(secondsAgo) {
  const sec = Math.max(0, Math.floor(Number(secondsAgo) || 0));
  if (sec < 90) return 'همین حالا';
  const minutes = Math.floor(sec / 60);
  if (minutes < 60) return `${faDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${faDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${faDigits(days)} روز پیش`;
}
