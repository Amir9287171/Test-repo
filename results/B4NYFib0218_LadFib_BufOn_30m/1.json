/**
 * @filename B4NYFib0218_LadFib_BufOn.js
 * @description خرید در سطح فیبو 0.218 رنج سشن نیویورک (13:00-22:00 UTC) وقتی کلوز سشن بالای 0.5 بسته شده (بایاس صعودی). هر سشن حداکثر یک ورود (اولین لمس سطح، از 22:00 تا شروع سشن بعدی) | ورود: لیمیت در همان سطح (در گپ: open) | حد ضرر اولیه: بیرون کف سشن + 2% رنج | حد سود ممنوع، خروج فقط با حد ضرر پلکانی = فیبوناچی تعدیل‌شده | بافر فعال (enableSmartContinuation: true) | 1m هم اجرا می‌شود
 *   منبع منطق: اندیکاتور «New York Session Fibonacci» (0 = کف سشن، 1 = سقف سشن).
 *   روی تایم‌فریم بالاتر از 1h سیگنال نمی‌دهد (سشن 9 ساعته روی 4h/24h معنی ندارد).
 */

const ANALYSIS_CONFIG = {
  entryType: "nextCandle",        // اجباری طبق راهنما، ولی در این استراتژی مصرف نمی‌شود
  breakTolerance: 0.001,          // اجباری طبق راهنما، ولی در این استراتژی مصرف نمی‌شود
  enableSmartContinuation: true,  // سشن‌های مرز فایل‌ها با بافر کامل شوند
  includeTimeframe1m: true        // 1 دقیقه هم اجرا شود
};

const stopLossStages = [
  { movePercent: 0.4, stopLossPercent: 0.2 },
  { movePercent: 2.4, stopLossPercent: 1.9 },
  { movePercent: 4.2, stopLossPercent: 3.5 },
  { movePercent: 6.1, stopLossPercent: 5.0 },
  { movePercent: 8.0, stopLossPercent: 6.6 },
  { movePercent: 9.9, stopLossPercent: 8.2 },
  { movePercent: 11.8, stopLossPercent: 9.9 },
  { movePercent: 13.7, stopLossPercent: 11.6 },
  { movePercent: 15.6, stopLossPercent: 13.4 },
  { movePercent: 17.6, stopLossPercent: 15.3 },
  { movePercent: 19.6, stopLossPercent: 17.2 },
  { movePercent: 21.6, stopLossPercent: 19.1 },
  { movePercent: 23.7, stopLossPercent: 21.1 },
  { movePercent: 25.8, stopLossPercent: 23.1 },
  { movePercent: 27.9, stopLossPercent: 25.1 },
  { movePercent: 30.0, stopLossPercent: 27.2 },
  { movePercent: 32.2, stopLossPercent: 29.3 },
  { movePercent: 34.4, stopLossPercent: 31.4 },
  { movePercent: 36.6, stopLossPercent: 33.5 },
  { movePercent: 38.8, stopLossPercent: 35.6 },
  { movePercent: 41.0, stopLossPercent: 37.7 },
  { movePercent: 43.3, stopLossPercent: 39.8 },
  { movePercent: 45.6, stopLossPercent: 41.9 },
  { movePercent: 47.9, stopLossPercent: 44.1 },
  { movePercent: 50.2, stopLossPercent: 46.2 },
];

function customStrategy(data, index) {
  // ---------------- تنظیمات (قبل از تست ثابت کنید) ----------------
  const SESSION_START_MIN = 13 * 60;   // 13:00 UTC
  const SESSION_END_MIN   = 22 * 60;   // 22:00 UTC
  const LEVEL_BUY  = 0.218;
  const LEVEL_SELL = 0.618;
  const LEVEL_MID  = 0.5;
  const SL_BUFFER  = 0.02;             // فاصله‌ی اضافه‌ی حد ضرر بیرون سقف/کف سشن (کسری از رنج)
  const MIN_RANGE_PCT = 0.0005;        // رنج کوچک‌تر از این (نسبت به قیمت) نادیده گرفته می‌شود
  const MAX_INTERVAL_MIN = 60;         // روی تایم‌فریم بالاتر از 1h اجرا نمی‌شود
  const WANT_BULLISH = true;          // B: فقط بایاس صعودی
  const DAY = 86400000, MIN = 60000;

  if (!data || index < 2) return null;
  const ts = (c) => (c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp).getTime());

  // ---------------- کش مبتنی بر آرایه‌ی داده (یک بار برای هر آرایه) ----------------
  const g = globalThis;
  if (!g.__NY_FIB_CACHE_B) g.__NY_FIB_CACHE_B = new WeakMap();
  let cache = g.__NY_FIB_CACHE_B.get(data);

  if (!cache) {
    cache = { ok: false, touchAt: new Map() };
    g.__NY_FIB_CACHE_B.set(data, cache);

    const n = data.length;
    const intervalMs = n > 1 ? ts(data[1]) - ts(data[0]) : 0;
    if (intervalMs > 0 && intervalMs <= MAX_INTERVAL_MIN * MIN) {
      cache.ok = true;
      const sessions = new Map(); // dayStart -> {first,last,hi,lo,cl}
      for (let k = 0; k < n; k++) {
        const t = ts(data[k]);
        const dayStart = Math.floor(t / DAY) * DAY;
        const m = (t - dayStart) / MIN;
        if (m >= SESSION_START_MIN && m < SESSION_END_MIN) {
          let s = sessions.get(dayStart);
          if (!s) { s = { first: k, last: k, hi: data[k].high, lo: data[k].low, cl: data[k].close }; sessions.set(dayStart, s); }
          else {
            s.last = k;
            if (data[k].high > s.hi) s.hi = data[k].high;
            if (data[k].low < s.lo) s.lo = data[k].low;
            s.cl = data[k].close;
          }
        }
      }
      // برای هر سشن کامل، اولین کندل لمسِ سطح فعال. فقط «آیا کندل index اولین لمس است؟»
      // استفاده می‌شود، یعنی تصمیم هر کندل فقط به داده‌ی تا همان کندل وابسته است.
      for (const [dayStart, s] of sessions) {
        const firstT = ts(data[s.first]), lastT = ts(data[s.last]);
        if (firstT - (dayStart + SESSION_START_MIN * MIN) > intervalMs) continue;      // سشن ناقص
        if ((dayStart + SESSION_END_MIN * MIN) - lastT > intervalMs * 1.5) continue;   // سشن ناقص
        if (s.last + 1 >= n) continue;

        const range = s.hi - s.lo;
        if (!(range > 0) || range / s.cl < MIN_RANGE_PCT) continue;

        const L218 = s.lo + range * LEVEL_BUY;
        const L500 = s.lo + range * LEVEL_MID;
        const L618 = s.lo + range * LEVEL_SELL;
        const bullish = s.cl > L500;
        if (bullish !== WANT_BULLISH) continue;
        const winEnd = dayStart + DAY + SESSION_START_MIN * MIN; // شروع سشن بعدی

        for (let k = s.last + 1; k < n; k++) {
          const t = ts(data[k]);
          if (t >= winEnd) break;
          if (t < dayStart + SESSION_END_MIN * MIN) continue;
          const c = data[k];
          if (bullish && c.low <= L218) { cache.touchAt.set(k, { level: L218, lo: s.lo, hi: s.hi, range }); break; }
          if (!bullish && c.high >= L618) { cache.touchAt.set(k, { level: L618, lo: s.lo, hi: s.hi, range }); break; }
        }
      }
    }
  }

  if (!cache.ok) return null;

  const info = cache.touchAt.get(index);
  if (!info) return null;
  const c = data[index];
  const buf = info.range * SL_BUFFER;

  const entryPrice = c.open < info.level ? c.open : info.level;
  const stopLoss = info.lo - buf;
  if (!(stopLoss < entryPrice)) return null;

  return {
    signal: 'BUY',
    price: entryPrice,
    stopLoss: stopLoss,
    useStagedStopLoss: true,
    stopLossStages: stopLossStages
  };
}
