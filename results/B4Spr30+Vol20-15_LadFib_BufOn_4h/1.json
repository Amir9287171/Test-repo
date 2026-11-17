/**
 * @filename B4Spr30+Vol20-15_LadFib_BufOn.js
 * @description خرید روی اسپرینگ: بعد از فشردگی ۳۰ کندلی (بازه ≤ ۴ ATR)، کندل کف بازه را کمی (≤ ۰.۷۵ ATR) می‌شکند، در ۴۰٪ بالایی خودش و بالای کف بازه می‌بندد و حجم ≥ ۱.۵ برابر میانگین است.
 * فقط BUY — حد ضرر ثابت اولیه ۰.۴٪ + حد ضرر پلکانی فیبوناچی تعدیل‌شده (LadFib)، بدون حد سود.
 * همه‌ی شرط‌ها فقط از کندل‌های ≤ index-1 ساخته می‌شوند؛ از data[index] فقط open خوانده می‌شود.
 * فرضیه: شکست کاذبِ انتهای یک فشردگی با حجم بالا، پایان جمع‌آوری یا توزیع است.
 */
const ANALYSIS_CONFIG = {
  entryType: "nextCandle",
  breakTolerance: 0.001,
  enableSmartContinuation: true
};

const STOP_LOSS_INITIAL = 0.4; // درصد حد ضرر ثابت اولیه
const DIR = 1;                 // +1 = BUY، -1 = SELL (منطق در فضای آینه‌ای نوشته شده؛ SELL قرینه‌ی BUY است)
const PW = 5;                  // نیم‌پهنای پیوت
const REQ_SW = false;
const EV_PVT = false;

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
  const key = '__strat_B4Spr30_Vol20_15_LadFib_BufOn_state';
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
  if (!st.x) st.x = { e12: [], e26: [], e20: [], macd: [], sig: [], adx: [], sTRs: 0, sP: 0, sM: 0, dxSum: 0, adxv: NaN,
                      fub: NaN, flb: NaN, stDir: 1, flipNow: 0, rb: null, gpKey: -1, gpDone: true };
  const x = st.x;
  for (let i = st.n; i <= upto; i++) {
    const c = data[i].close;
    if (i === 0) { st.e50[i] = c; st.e200[i] = c; st.atr[i] = NaN; st.vsma[i] = NaN; x.e12[0] = c; x.e26[0] = c; x.e20[0] = c; x.macd[0] = 0; x.sig[0] = 0; x.adx[0] = NaN; continue; }
    st.e50[i]  = st.e50[i - 1]  + (2 / 51)  * (c - st.e50[i - 1]);
    st.e200[i] = st.e200[i - 1] + (2 / 201) * (c - st.e200[i - 1]);
    const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (i <= 14) { st.sTR += tr; if (i === 14) st.atrv = st.sTR / 14; }
    else st.atrv = (st.atrv * 13 + tr) / 14;
    st.atr[i] = i >= 14 ? st.atrv : NaN;
    if (i >= 19) { let v = 0; for (let j = i - 19; j <= i; j++) v += data[j].volume; st.vsma[i] = v / 20; }
    else st.vsma[i] = NaN;

    // --- اندیکاتورهای کمکی (همه فقط از کندل‌های ≤ i) ---
    x.e12[i] = x.e12[i - 1] + (2 / 13) * (c - x.e12[i - 1]);
    x.e26[i] = x.e26[i - 1] + (2 / 27) * (c - x.e26[i - 1]);
    x.e20[i] = x.e20[i - 1] + (2 / 21) * (c - x.e20[i - 1]);
    x.macd[i] = x.e12[i] - x.e26[i];
    x.sig[i] = x.sig[i - 1] + (2 / 10) * (x.macd[i] - x.sig[i - 1]);
    {
      const upM = H(d, i) - H(d, i - 1), dnM = L(d, i - 1) - L(d, i);
      const pdm = (upM > dnM && upM > 0) ? upM : 0, mdm = (dnM > upM && dnM > 0) ? dnM : 0;
      if (i <= 14) { x.sTRs += tr; x.sP += pdm; x.sM += mdm; }
      else { x.sTRs = x.sTRs - x.sTRs / 14 + tr; x.sP = x.sP - x.sP / 14 + pdm; x.sM = x.sM - x.sM / 14 + mdm; }
      let dx = NaN;
      if (i >= 14 && x.sTRs > 0) {
        const pdi = 100 * x.sP / x.sTRs, mdi = 100 * x.sM / x.sTRs;
        dx = (pdi + mdi) > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
      }
      if (i >= 14 && i <= 27) { x.dxSum += dx; if (i === 27) x.adxv = x.dxSum / 14; }
      else if (i > 27) x.adxv = (x.adxv * 13 + dx) / 14;
      x.adx[i] = i >= 27 ? x.adxv : NaN;
    }
    x.flipNow = 0;
    if (i >= 14) {                                          // سوپرترند (ATR14 × ۳) در فضای آینه‌ای
      const hl2 = (H(d, i) + L(d, i)) / 2, ub = hl2 + 3 * st.atr[i], lb = hl2 - 3 * st.atr[i];
      if (i === 14) { x.fub = ub; x.flb = lb; x.stDir = 1; }
      else {
        let dir = x.stDir;
        if (dir === -1 && C(d, i) > x.fub) dir = 1; else if (dir === 1 && C(d, i) < x.flb) dir = -1;
        const pc2 = C(d, i - 1);
        x.fub = (ub < x.fub || pc2 > x.fub) ? ub : x.fub;
        x.flb = (lb > x.flb || pc2 < x.flb) ? lb : x.flb;
        if (dir !== x.stDir) x.flipNow = dir;
        x.stDir = dir;
      }
    }
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

    // --- اسپرینگ: بعد از فشردگی ۳۰ کندلی، پایین زدنِ کوتاه و برگشت با حجم بالا ---
    if (i >= 32) {
      const hiR = __maxH(d, i - 30, i - 1), loR = __minL(d, i - 30, i - 1), rg = H(d, i) - L(d, i);
      if (hiR - loR <= 4 * atrP && L(d, i) < loR && L(d, i) >= loR - 0.75 * atrP && C(d, i) > loR &&
          rg > 0 && (C(d, i) - L(d, i)) / rg >= 0.6 && data[i].volume >= 1.5 * st.vsma[i]) st.ev = i;
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
