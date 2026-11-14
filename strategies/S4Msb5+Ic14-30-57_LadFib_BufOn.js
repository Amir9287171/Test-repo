/**
 * @filename S4Msb5+Ic14-30-57_LadFib_BufOn.js
 * @description فروش روی شکست ساختار: سقف پایین‌تر (پیوت ۵ کندلی تأییدشده) و سپس اولین بسته‌شدن زیر کف پیوتی که بین دو سقف قرار دارد؛ با فیلتر ایچیموکو (کندل زیر ابر و Tenkan < Kijun).
 * فقط SELL — حد ضرر ثابت اولیه ۰.۴٪ + حد ضرر پلکانی فیبوناچی تعدیل‌شده (LadFib)، بدون حد سود.
 * همه‌ی شرط‌ها فقط از کندل‌های ≤ index-1 ساخته می‌شوند؛ از data[index] فقط open و timestamp خوانده می‌شود.
 * فرضیه: شکست ساختار بعد از کف بالاتر/سقف پایین‌تر آغاز حرکت جهت‌دار است و ایچیموکو همسویی را تأیید می‌کند.
 */
const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,
  enableSmartContinuation: true
};

const STOP_LOSS_INITIAL = 0.4; // درصد حد ضرر ثابت اولیه
const PW = 5;            // نیم‌پهنای پیوت (کندل‌های چپ/راست)

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

function __ts(c) { const t = c.timestamp; return t instanceof Date ? t.getTime() : new Date(t).getTime(); }

function __newState(ref) {
  return {
    ref: ref, n: 0,
    e50: [], e200: [], rsi: [], atr: [], vsma: [], tenk: [], kij: [], midB: [],
    sTR: 0, gSum: 0, lSum: 0, ag: 0, al: 0, atrv: 0,
    ph: [], pl: []
  };
}

function __getState(data, index) {
  const key = '__strat_S4Msb5_Ic14_30_57_LadFib_BufOn_state';
  let st = globalThis[key];
  // ریست state فقط وقتی دیتاست عوض شده (فایل/نماد جدید) — طبق بخش ۳.۳ راهنما
  if (!st || st.ref !== data || st.n > index) { st = globalThis[key] = __newState(data); }
  return st;
}

function __mid(data, i, len) {
  let hi = -Infinity, lo = Infinity;
  for (let j = i - len + 1; j <= i; j++) { if (data[j].high > hi) hi = data[j].high; if (data[j].low < lo) lo = data[j].low; }
  return (hi + lo) / 2;
}

// اندیکاتورها را برای کندل‌های 0..upto (کاملاً بسته‌شده) افزایشی می‌سازد؛ مقدار i فقط از کندل‌های ≤ i است
function __update(st, data, upto) {
  for (let i = st.n; i <= upto; i++) {
    const c = data[i].close;
    st.tenk[i] = i >= 13 ? __mid(data, i, 14) : NaN;
    st.kij[i] = i >= 29 ? __mid(data, i, 30) : NaN;
    st.midB[i] = i >= 56 ? __mid(data, i, 57) : NaN;
    if (i === 0) {
      st.e50[i] = c; st.e200[i] = c; st.rsi[i] = NaN; st.atr[i] = NaN; st.vsma[i] = NaN;
      continue;
    }
    st.e50[i]  = st.e50[i - 1]  + (2 / 51)  * (c - st.e50[i - 1]);
    st.e200[i] = st.e200[i - 1] + (2 / 201) * (c - st.e200[i - 1]);
    const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const ch = c - pc, gain = ch > 0 ? ch : 0, loss = ch < 0 ? -ch : 0;
    if (i <= 14) {
      st.sTR += tr; st.gSum += gain; st.lSum += loss;
      if (i === 14) { st.ag = st.gSum / 14; st.al = st.lSum / 14; st.atrv = st.sTR / 14; }
    } else {
      st.ag = (st.ag * 13 + gain) / 14;
      st.al = (st.al * 13 + loss) / 14;
      st.atrv = (st.atrv * 13 + tr) / 14;
    }
    st.rsi[i] = i >= 14 ? (st.al === 0 ? 100 : 100 - 100 / (1 + st.ag / st.al)) : NaN;
    st.atr[i] = i >= 14 ? st.atrv : NaN;
    if (i >= 19) { let v = 0; for (let j = i - 19; j <= i; j++) v += data[j].volume; st.vsma[i] = v / 20; }
    else st.vsma[i] = NaN;
    // پیوت‌ها: کندل k = i - PW فقط وقتی تأیید می‌شود که PW کندل بعد از آن بسته شده باشد (همه ≤ i)
    const k = i - PW;
    if (k >= PW) {
      let isH = true, isL = true;
      for (let j = k - PW; j <= k + PW; j++) {
        if (j === k) continue;
        if (j < k) { if (!(data[j].high < data[k].high)) isH = false; if (!(data[j].low > data[k].low)) isL = false; }
        else { if (!(data[j].high <= data[k].high)) isH = false; if (!(data[j].low >= data[k].low)) isL = false; }
      }
      if (isH) { st.ph.push({ i: k, v: data[k].high }); if (st.ph.length > 30) st.ph.shift(); }
      if (isL) { st.pl.push({ i: k, v: data[k].low });  if (st.pl.length > 30) st.pl.shift(); }
    }
  }
  if (upto + 1 > st.n) st.n = upto + 1;
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

// ابر ایچیموکو (14-30-57، جابه‌جایی ۳۰) در کندل p: فقط از مقادیر کندل p-30 و قبل‌تر
function __cloud(st, p) {
  const q = p - 30;
  if (q < 0) return null;
  const a = (st.tenk[q] + st.kij[q]) / 2, b = st.midB[q];
  if (!isFinite(a) || !isFinite(b)) return null;
  return { top: Math.max(a, b), bot: Math.min(a, b) };
}

function __signal(data, st, p) {
  const pl = st.pl, ph = st.ph;
  if (ph.length < 2 || pl.length < 1) return false;
  const H2 = ph[ph.length - 1], H1 = ph[ph.length - 2];
  if (!(H2.v < H1.v) || p - H2.i > 60) return false;
  let L = null;
  for (let k = pl.length - 1; k >= 0; k--) { if (pl[k].i > H1.i && pl[k].i < H2.i) { L = pl[k]; break; } }
  if (!L) return false;
  if (!(data[p].close < L.v && data[p - 1].close >= L.v)) return false;
  const cl = __cloud(st, p);
  if (!cl) return false;
  return data[p].close < cl.bot && st.tenk[p] < st.kij[p];
}
