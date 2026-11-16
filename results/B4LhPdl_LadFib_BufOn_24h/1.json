/**
 * @filename B4LhPdl_LadFib_BufOn.js
 * @description خرید بعد از شکار کف روز قبل (UTC): اولین کندل امروز که زیر کف دیروز می‌زند و بالای آن بسته می‌شود.
 * فقط BUY — حد ضرر ثابت اولیه ۰.۴٪ + حد ضرر پلکانی فیبوناچی تعدیل‌شده (LadFib)، بدون حد سود.
 * همه‌ی شرط‌ها فقط از کندل‌های ≤ index-1 ساخته می‌شوند؛ از data[index] فقط open خوانده می‌شود.
 * فرضیه: کف/سقف روز قبل نقدینگی شاخص است؛ اسوئیپ ناموفق یعنی برگشت.
 */
const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,
  enableSmartContinuation: true
};

const STOP_LOSS_INITIAL = 0.4; // درصد حد ضرر ثابت اولیه
const DIR = 1;                 // +1 = BUY، -1 = SELL (منطق در فضای آینه‌ای نوشته شده؛ SELL قرینه‌ی BUY است)
const PW = 3;                  // نیم‌پهنای پیوت
const REQ_SW = false;
const EV_PVT = false;
const PERIOD = 'day';

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
function O(d, i) { return DIR * d[i].open; }
function __ts(c) { const t = c.timestamp; return t instanceof Date ? t.getTime() : new Date(t).getTime(); }

function __newState(ref) {
  return { ref: ref, n: 0, e50: [], e200: [], atr: [], vsma: [], sTR: 0, atrv: 0,
           ph: [], pl: [], z: [], bz: [], sw: null, leg: null, ev: -1,
           pk: undefined, curMin: undefined, prevMin: undefined, pSwept: false };
}
function __getState(data, index) {
  const key = '__strat_B4LhPdl_LadFib_BufOn_state';
  let st = globalThis[key];
  // ریست state فقط وقتی دیتاست عوض شده (فایل/نماد جدید) — طبق بخش ۳.۳ راهنما
  if (!st || st.ref !== data || st.n > index) { st = globalThis[key] = __newState(data); }
  return st;
}
function __maxH(d, a, b) { let m = -Infinity; for (let j = a; j <= b; j++) { const h = H(d, j); if (h > m) m = h; } return m; }
function __minL(d, a, b) { let m = Infinity; for (let j = a; j <= b; j++) { const l = L(d, j); if (l < m) m = l; } return m; }
// اسوئیپ اخیر (کف پیوت شکسته‌شده) + بسته‌شدن کندل i بالای همه‌ی سقف‌های بعد از اسوئیپ تا i-need (شکست ساختار)
function __swOK(st, d, i, need, maxAge) {
  const s = st.sw;
  if (!s) return false;
  const age = i - s.i;
  if (age > maxAge || age < need) return false;
  return C(d, i) > __maxH(d, s.i, i - need);
}

function __update(st, data, upto) {
  const d = data;
  for (let i = st.n; i <= upto; i++) {
    const c = data[i].close;
    if (i === 0) { st.e50[i] = c; st.e200[i] = c; st.atr[i] = NaN; st.vsma[i] = NaN; continue; }
    st.e50[i]  = st.e50[i - 1]  + (2 / 51)  * (c - st.e50[i - 1]);
    st.e200[i] = st.e200[i - 1] + (2 / 201) * (c - st.e200[i - 1]);
    const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (i <= 14) { st.sTR += tr; if (i === 14) st.atrv = st.sTR / 14; }
    else st.atrv = (st.atrv * 13 + tr) / 14;
    st.atr[i] = i >= 14 ? st.atrv : NaN;
    if (i >= 19) { let v = 0; for (let j = i - 19; j <= i; j++) v += data[j].volume; st.vsma[i] = v / 20; }
    else st.vsma[i] = NaN;
    if (i < 5) continue;
    const atrP = st.atr[i - 1], atrI = st.atr[i];
    if (!(atrP > 0)) continue;

    // --- پیوت‌ها: کندل k=i-PW با PW کندل بعد از آن تأیید می‌شود (همه ≤ i) ---
    {
      const k = i - PW;
      if (k >= PW) {
        let isH = true, isL = true;
        for (let j = k - PW; j <= k + PW; j++) {
          if (j === k) continue;
          if (j < k) { if (!(H(d, j) < H(d, k))) isH = false; if (!(L(d, j) > L(d, k))) isL = false; }
          else { if (!(H(d, j) <= H(d, k))) isH = false; if (!(L(d, j) >= L(d, k))) isL = false; }
        }
        if (isH) { st.ph.push({ i: k, v: H(d, k) }); if (st.ph.length > 30) st.ph.shift(); }
        if (isL) { st.pl.push({ i: k, v: L(d, k), s: false }); if (st.pl.length > 30) st.pl.shift(); }
      }
    }

    // --- دوره‌ی قبلی (روز/هفته‌ی UTC): کف دوره‌ی قبل فقط از کندل‌های بسته‌شده‌ی دوره‌ی قبل ---
    {
      const ts = __ts(data[i]);
      const dayN = Math.floor(ts / 86400000);
      const pk = PERIOD === 'week' ? Math.floor((dayN + 3) / 7) : dayN;
      if (st.pk === undefined || pk !== st.pk) {
        if (st.pk !== undefined) st.prevMin = st.curMin;
        st.pk = pk; st.curMin = L(d, i); st.pSwept = false;
      } else if (L(d, i) < st.curMin) st.curMin = L(d, i);
      if (st.prevMin !== undefined && !st.pSwept && L(d, i) < st.prevMin) {
        st.pSwept = true;                                   // اولین اسوئیپ این دوره (مصرف می‌شود)
        if (C(d, i) > st.prevMin) st.ev = i;                // و بسته‌شدن برگشتی بالای کف دوره‌ی قبل
      }
    }

  }
  if (upto + 1 > st.n) st.n = upto + 1;
}

function __signal(data, st, p) {
  if (st.ev !== p) return false;
  
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
    signal: 'BUY',
    price: price,
    stopLoss: price * (1 - STOP_LOSS_INITIAL / 100),
    useStagedStopLoss: true,
    stopLossStages: LADFIB
  };
}
