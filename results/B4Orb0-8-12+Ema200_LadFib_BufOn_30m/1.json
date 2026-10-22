/**
 * @filename B4Orb0-8-12+Ema200_LadFib_BufOn.js
 * @description خرید روی شکست سقف رنج سشن آسیا (۰۰ تا ۰۸ UTC) در ساعت‌های ۰۹ تا ۱۲ UTC، فقط اولین شکست هر روز و فقط وقتی قیمت بالای EMA200 است
 * فقط BUY — حد ضرر ثابت اولیه ۰.۴٪ + حد ضرر پلکانی فیبوناچی تعدیل‌شده (LadFib)، بدون حد سود.
 * همه‌ی شرط‌ها فقط از کندل‌های ≤ index-1 ساخته می‌شوند؛ از data[index] فقط open و timestamp خوانده می‌شود.
 * فرضیه: با بازشدن لندن نقدینگی وارد می‌شود و رنج آرام آسیا اغلب با یک حرکت جهت‌دار شکسته می‌شود.
 */
const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,
  enableSmartContinuation: true
};

const STOP_LOSS_INITIAL = 0.4; // درصد حد ضرر ثابت اولیه (فقط BUY)

// مجموعه‌ی پلکانی «فیبوناچی تعدیل‌شده» (LadFib) — طبق بخش ۶.۲.۰ راهنما
const LADFIB = [
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
  { movePercent: 50.2, stopLossPercent: 46.2 }
];

// ───────── ابزارهای مشترک (همه علّی‌اند: مقدار اندیس i فقط از کندل‌های ≤ i ساخته می‌شود) ─────────
function __ts(c) { const t = c.timestamp; return t instanceof Date ? t.getTime() : new Date(t).getTime(); }

function __newState(ref) {
  return {
    ref: ref, n: 0,
    e9: [], e21: [], e50: [], e200: [],
    rsi: [], atr: [], adx: [], sma20: [], bbu: [], bbl: [], vsma: [],
    sTR: 0, sP: 0, sM: 0, gSum: 0, lSum: 0, ag: 0, al: 0, atrv: 0, dxSum: 0, adxv: 0,
    curDay: -1, curDayHigh: -Infinity, prevDayHigh: NaN, pdhBroke: false, pdhBrokeBefore: false,
    asiaHigh: -Infinity, asiaBroke: false, asiaBrokeBefore: false
  };
}

function __getState(data, index) {
  const key = '__strat_B4Orb0_8_12_Ema200_state';
  let st = globalThis[key];
  // ریست state فقط وقتی دیتاست عوض شده (فایل/نماد جدید) — طبق بخش ۳.۳ راهنما
  if (!st || st.ref !== data || st.n > index) { st = globalThis[key] = __newState(data); }
  return st;
}

// اندیکاتورها را برای کندل‌های 0..upto (که همگی کامل بسته شده‌اند) به‌صورت افزایشی محاسبه می‌کند
function __update(st, data, upto) {
  for (let i = st.n; i <= upto; i++) {
    const c = data[i].close;
    // ── حالت روزانه (UTC): سقف روز قبل، رنج آسیا و «اولین شکست» — به‌صورت افزایشی ──
    const day = __utcDay(data[i]), hr = __utcHour(data[i]);
    if (day !== st.curDay) {
      st.prevDayHigh = (st.curDay === day - 1) ? st.curDayHigh : NaN;
      st.curDay = day; st.curDayHigh = -Infinity; st.pdhBroke = false;
      st.asiaHigh = -Infinity; st.asiaBroke = false;
    }
    st.pdhBrokeBefore = st.pdhBroke; st.asiaBrokeBefore = st.asiaBroke;
    if (isFinite(st.prevDayHigh) && c > st.prevDayHigh) st.pdhBroke = true;
    if (hr < 8) { if (data[i].high > st.asiaHigh) st.asiaHigh = data[i].high; }
    else if (isFinite(st.asiaHigh) && c > st.asiaHigh) st.asiaBroke = true;
    if (data[i].high > st.curDayHigh) st.curDayHigh = data[i].high;
    if (i === 0) {
      st.e9[i] = c; st.e21[i] = c; st.e50[i] = c; st.e200[i] = c;
      st.rsi[i] = NaN; st.atr[i] = NaN; st.adx[i] = NaN; st.sma20[i] = NaN; st.bbu[i] = NaN; st.bbl[i] = NaN; st.vsma[i] = NaN;
      continue;
    }
    st.e9[i]   = st.e9[i - 1]   + (2 / 10)  * (c - st.e9[i - 1]);
    st.e21[i]  = st.e21[i - 1]  + (2 / 22)  * (c - st.e21[i - 1]);
    st.e50[i]  = st.e50[i - 1]  + (2 / 51)  * (c - st.e50[i - 1]);
    st.e200[i] = st.e200[i - 1] + (2 / 201) * (c - st.e200[i - 1]);

    const h = data[i].high, l = data[i].low, pc = data[i - 1].close, ph = data[i - 1].high, pl = data[i - 1].low;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - ph, dn = pl - l;
    const pdm = (up > dn && up > 0) ? up : 0;
    const mdm = (dn > up && dn > 0) ? dn : 0;
    const ch = c - pc, gain = ch > 0 ? ch : 0, loss = ch < 0 ? -ch : 0;

    if (i <= 14) {
      st.sTR += tr; st.sP += pdm; st.sM += mdm; st.gSum += gain; st.lSum += loss;
      if (i === 14) { st.ag = st.gSum / 14; st.al = st.lSum / 14; st.atrv = st.sTR / 14; }
    } else {
      st.sTR = st.sTR - st.sTR / 14 + tr;
      st.sP = st.sP - st.sP / 14 + pdm;
      st.sM = st.sM - st.sM / 14 + mdm;
      st.ag = (st.ag * 13 + gain) / 14;
      st.al = (st.al * 13 + loss) / 14;
      st.atrv = (st.atrv * 13 + tr) / 14;
    }
    st.rsi[i] = i >= 14 ? (st.al === 0 ? 100 : 100 - 100 / (1 + st.ag / st.al)) : NaN;
    st.atr[i] = i >= 14 ? st.atrv : NaN;

    let adxv = NaN;
    if (i >= 14) {
      const pdi = st.sTR === 0 ? 0 : 100 * st.sP / st.sTR;
      const mdi = st.sTR === 0 ? 0 : 100 * st.sM / st.sTR;
      const den = pdi + mdi;
      const dx = den === 0 ? 0 : 100 * Math.abs(pdi - mdi) / den;
      if (i < 27) { st.dxSum += dx; }
      else if (i === 27) { st.dxSum += dx; st.adxv = st.dxSum / 14; adxv = st.adxv; }
      else { st.adxv = (st.adxv * 13 + dx) / 14; adxv = st.adxv; }
    }
    st.adx[i] = adxv;

    if (i >= 19) {
      let s = 0, v = 0;
      for (let j = i - 19; j <= i; j++) { s += data[j].close; v += data[j].volume; }
      const m = s / 20;
      let q = 0;
      for (let j = i - 19; j <= i; j++) { const d = data[j].close - m; q += d * d; }
      const sd = Math.sqrt(q / 20);
      st.sma20[i] = m; st.bbu[i] = m + 2 * sd; st.bbl[i] = m - 2 * sd; st.vsma[i] = v / 20;
    } else { st.sma20[i] = NaN; st.bbu[i] = NaN; st.bbl[i] = NaN; st.vsma[i] = NaN; }
  }
  if (upto + 1 > st.n) st.n = upto + 1;
}

function __utcDay(c) { return Math.floor(__ts(c) / 86400000); }
function __utcHour(c) { return new Date(__ts(c)).getUTCHours(); }

function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 260) return null;              // گرم‌شدن اندیکاتورها (EMA200 و ADX)
  const st = __getState(data, index);
  const p = index - 1;                        // آخرین کندل کاملاً بسته‌شده
  __update(st, data, p);
  if (!__signal(data, st, p, index)) return null;

  const price = data[index].open;             // قیمت ورود فقط open کندل جاری
  if (!(price > 0)) return null;
  return {
    signal: 'BUY',
    price: price,
    stopLoss: price * (1 - STOP_LOSS_INITIAL / 100),
    useStagedStopLoss: true,
    stopLossStages: LADFIB
  };
}


function __signal(data, st, p, index) {
  const D = __utcDay(data[index]);
  const hIdx = __utcHour(data[index]);
  if (hIdx < 9 || hIdx >= 12) return false;                              // کندل جاری باید در ۰۹ تا ۱۲ UTC شروع شود
  if (st.curDay !== D || __utcHour(data[p]) < 8) return false;           // کندل بسته‌شده باید همان روز و پس از پایان آسیا باشد
  if (!isFinite(st.asiaHigh)) return false;
  // فقط اولین کندلی که بالای رنج آسیا بسته شده (st.asiaBrokeBefore = شکستی قبل از کندل p)
  if (!(data[p].close > st.asiaHigh) || st.asiaBrokeBefore) return false;
  return data[p].close > st.e200[p];
}
