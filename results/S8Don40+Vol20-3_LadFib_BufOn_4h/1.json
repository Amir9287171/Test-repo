/**
 * @filename S8Don40+Vol20-3_LadFib_BufOn.js
 * @description فروش: شکست دونچین 40: اولین کندل بسته‌شده زیر کف 40 کندل قبل، حجم کندل ≥ 3 برابر میانگین ۲۰ کندل.
 * فقط SELL — حد ضرر ثابت اولیه 0.8٪ + حد ضرر پلکانی فیبوناچی تعدیل‌شده (LadFib)، بدون حد سود.
 * همه‌ی شرط‌ها فقط از کندل‌های ≤ index-1 ساخته می‌شوند؛ از data[index] فقط open خوانده می‌شود.
 * فرضیه: دوره‌ی ۴۰ با حد ضرر ۰.۸٪
 */
const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,
  enableSmartContinuation: true
};

const STOP_LOSS_INITIAL = 0.8; // درصد حد ضرر ثابت اولیه
const DIR = -1;                 // +1 = BUY، -1 = SELL (منطق در فضای آینه‌ای؛ SELL قرینه‌ی BUY است)
const DON_N = 40;

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

function H(d, i) { return DIR > 0 ? d[i].high : -d[i].low; }    // «سقف» در فضای آینه‌ای
function L(d, i) { return DIR > 0 ? d[i].low : -d[i].high; }    // «کف» در فضای آینه‌ای
function C(d, i) { return DIR * d[i].close; }

function __newState(ref) {
  return { ref: ref, n: 0, e50: [], e200: [], atr: [], vsma: [], adx: [], sTR: 0, atrv: 0,
           sTRs: 0, sP: 0, sM: 0, dxSum: 0, adxv: NaN };
}
function __getState(data, index) {
  const key = '__strat_S8Don40_Vol20_3_LadFib_BufOn_state';
  let st = globalThis[key];
  // ریست state فقط وقتی دیتاست عوض شده (فایل/نماد جدید) — طبق بخش ۳.۳ راهنما
  if (!st || st.ref !== data || st.n > index) { st = globalThis[key] = __newState(data); }
  return st;
}
function __maxH(d, a, b) { let m = -Infinity; for (let j = a; j <= b; j++) { const h = H(d, j); if (h > m) m = h; } return m; }

// اندیکاتورها را برای کندل‌های 0..upto (کاملاً بسته‌شده) افزایشی می‌سازد؛ مقدار i فقط از کندل‌های ≤ i است
function __update(st, data, upto) {
  const d = data;
  for (let i = st.n; i <= upto; i++) {
    const c = data[i].close;
    if (i === 0) { st.e50[i] = c; st.e200[i] = c; st.atr[i] = NaN; st.vsma[i] = NaN; st.adx[i] = NaN; continue; }
    st.e50[i]  = st.e50[i - 1]  + (2 / 51)  * (c - st.e50[i - 1]);
    st.e200[i] = st.e200[i - 1] + (2 / 201) * (c - st.e200[i - 1]);
    const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (i <= 14) { st.sTR += tr; if (i === 14) st.atrv = st.sTR / 14; }
    else st.atrv = (st.atrv * 13 + tr) / 14;
    st.atr[i] = i >= 14 ? st.atrv : NaN;
    if (i >= 19) { let v = 0; for (let j = i - 19; j <= i; j++) v += data[j].volume; st.vsma[i] = v / 20; }
    else st.vsma[i] = NaN;
    // ADX14 (وایلدر)
    const upM = H(d, i) - H(d, i - 1), dnM = L(d, i - 1) - L(d, i);
    const pdm = (upM > dnM && upM > 0) ? upM : 0, mdm = (dnM > upM && dnM > 0) ? dnM : 0;
    if (i <= 14) { st.sTRs += tr; st.sP += pdm; st.sM += mdm; }
    else { st.sTRs = st.sTRs - st.sTRs / 14 + tr; st.sP = st.sP - st.sP / 14 + pdm; st.sM = st.sM - st.sM / 14 + mdm; }
    let dx = NaN;
    if (i >= 14 && st.sTRs > 0) {
      const pdi = 100 * st.sP / st.sTRs, mdi = 100 * st.sM / st.sTRs;
      dx = (pdi + mdi) > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    }
    if (i >= 14 && i <= 27) { st.dxSum += dx; if (i === 27) st.adxv = st.dxSum / 14; }
    else if (i > 27) st.adxv = (st.adxv * 13 + dx) / 14;
    st.adx[i] = i >= 27 ? st.adxv : NaN;
  }
  if (upto + 1 > st.n) st.n = upto + 1;
}

// شکست دونچین: اولین کندل بسته‌شده‌ی بالای سقف N کندل قبل + حجم + فیلترهای اختیاری
function __signal(data, st, p) {
  const d = data;
  if (p < DON_N + 3) return false;
  const hh = __maxH(d, p - DON_N, p - 1);
  const hhPrev = __maxH(d, p - 1 - DON_N, p - 2);
  if (!(C(d, p) > hh && C(d, p - 1) <= hhPrev)) return false;       // اولین کندل شکست
  if (!(data[p].volume >= 3 * st.vsma[p])) return false;       // حجم کندل شکست
  
  return true;
}

function customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPrice) {
  if (index < 260) return null;              // گرم‌شدن اندیکاتورها (EMA200)
  const st = __getState(data, index);
  const p = index - 1;                        // آخرین کندل کاملاً بسته‌شده
  __update(st, data, p);
  if (!__signal(data, st, p)) return null;

  const price = data[index].open;             // قیمت ورود فقط open کندل جاری
  if (!(price > 0)) return null;
  return {
    signal: 'SELL',
    price: price,
    stopLoss: price * (1 + STOP_LOSS_INITIAL / 100),
    useStagedStopLoss: true,
    stopLossStages: LADFIB
  };
}
