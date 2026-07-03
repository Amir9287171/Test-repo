/**
 * 
 * ---------------------------------------------------------
 * اسکریپت مستقل تشخیص سریع: بدون اجرای کل بکتست (که ۳-۴ دقیقه طول می‌کشه)،
 * فقط ماژول wickra رو لود می‌کنه، ساختارش رو چاپ می‌کنه، و اگر متد RSI
 * پیدا کرد روی چند داده نمونه تستش می‌کنه.
 *
 * اجرا:
 *   node check-wickra.js
 *
 * این فایل رو کنار backtest-core.js (همون پوشه‌ای که node_modules/wickra
 * توش هست) بذار و اجرا کن. کل خروجی رو برام بفرست.
 * ---------------------------------------------------------
 */

console.log('='.repeat(60));
console.log('🔍 تشخیص سریع ماژول wickra');
console.log('='.repeat(60));

// ---------- مرحله ۱: آیا اصلاً require می‌شه؟ ----------
let wickra;
try {
    wickra = require('wickra');
    console.log('✅ require("wickra") موفق بود.');
} catch (e) {
    console.log('❌ require("wickra") شکست خورد:');
    console.log('   ' + e.message);
    console.log('\n⚠️ اگه اینجا خطا گرفتی، مشکل نصب پکیجه، نه کد استراتژی.');
    console.log('   بررسی کن: npm ls wickra   یا   npm install wickra');
    process.exit(1);
}

// ---------- مرحله ۲: نوع و ساختار کلی ماژول ----------
console.log('\n📦 نوع خروجی require("wickra"):', typeof wickra);

if (typeof wickra !== 'object' && typeof wickra !== 'function') {
    console.log('⚠️ wickra نه object هست نه function — این خیلی غیرعادیه.');
    console.log('مقدار واقعی:', wickra);
    process.exit(1);
}

// ---------- مرحله ۳: لیست همهٔ کلیدها (سطح اول) ----------
const topKeys = Object.keys(wickra);
console.log('\n📋 کلیدهای سطح اول روی wickra (' + topKeys.length + ' مورد):');
console.log('   ' + (topKeys.length ? topKeys.join(', ') : '(هیچ کلیدی نیست!)'));

// ---------- مرحله ۴: جستجوی خودکار دنبال چیزی شبیه RSI ----------
console.log('\n🔎 جستجوی کلیدهایی که به RSI شبیه‌ان (case-insensitive):');
const rsiLikeKeys = topKeys.filter(k => k.toLowerCase().includes('rsi'));
if (rsiLikeKeys.length === 0) {
    console.log('   ❌ هیچ کلیدی شامل "rsi" تو سطح اول پیدا نشد.');
    console.log('   احتمالاً RSI زیر یک namespace تودرتوئه (مثلاً wickra.indicators.rsi).');
    console.log('   کلیدهایی که object/function هستن رو هم چک می‌کنیم:');
    topKeys.forEach(k => {
        const val = wickra[k];
        const t = typeof val;
        if (t === 'object' && val !== null) {
            const subKeys = Object.keys(val);
            const subRsi = subKeys.filter(sk => sk.toLowerCase().includes('rsi'));
            console.log(`   - wickra.${k} (object, ${subKeys.length} کلید): ${subKeys.join(', ')}`);
            if (subRsi.length) {
                console.log(`     🎯 پیدا شد: wickra.${k}.${subRsi[0]}`);
            }
        } else {
            console.log(`   - wickra.${k}: ${t}`);
        }
    });
} else {
    console.log('   ✅ پیدا شد: ' + rsiLikeKeys.join(', '));
}

// ---------- مرحله ۵: تست عملی با دادهٔ نمونه ----------
console.log('\n🧪 تست عملی فراخوانی RSI با ۳۰ کندل نمونه:');

// یک سری close نمونه با نوسان واقعی (نه صاف) که RSI روش قابل محاسبه باشه
const sampleCloses = [];
let price = 100;
for (let i = 0; i < 30; i++) {
    price += (Math.sin(i / 3) * 2) + (Math.random() - 0.5);
    sampleCloses.push(Number(price.toFixed(4)));
}

function tryCall(label, fn) {
    try {
        const result = fn();
        console.log(`   ✅ ${label} →`, Array.isArray(result) ? `Array(${result.length}), آخرین مقدار: ${result[result.length - 1]}` : result);
        return true;
    } catch (e) {
        console.log(`   ❌ ${label} → خطا: ${e.message}`);
        return false;
    }
}

let anySuccess = false;

if (typeof wickra.rsi === 'function') {
    anySuccess = tryCall('wickra.rsi(closesArray, 14)', () => wickra.rsi(sampleCloses, 14)) || anySuccess;
}
if (typeof wickra.RSI === 'function') {
    anySuccess = tryCall('wickra.RSI(closesArray, 14)', () => wickra.RSI(sampleCloses, 14)) || anySuccess;
}
if (wickra.indicators && typeof wickra.indicators.rsi === 'function') {
    anySuccess = tryCall('wickra.indicators.rsi(closesArray, 14)', () => wickra.indicators.rsi(sampleCloses, 14)) || anySuccess;
}
// امتحان با آبجکت کندل به‌جای فقط close (بعضی کتابخونه‌ها OHLC می‌خوان)
if (typeof wickra.rsi === 'function') {
    const sampleCandles = sampleCloses.map((c, i) => ({ open: c, high: c + 1, low: c - 1, close: c, timestamp: i }));
    anySuccess = tryCall('wickra.rsi(candlesArray, 14)  [با آبجکت OHLC]', () => wickra.rsi(sampleCandles, 14)) || anySuccess;
}

if (!anySuccess) {
    console.log('   ⚠️ هیچ‌کدوم از حالت‌های رایج جواب نداد.');
    console.log('   خروجی کامل require("wickra") رو هم چاپ می‌کنیم (ممکنه دستی راحت‌تر پیدا کنی):');
    console.log(wickra);
}

// ---------- مرحله ۶: تست global.__wickra (دقیقاً شبیه محیط new Function) ----------
console.log('\n🌐 تست دسترسی از طریق global (شبیه‌سازی محیط new Function استراتژی):');
global.__wickra = wickra;
try {
    const g = global.__wickra;
    console.log('   ✅ global.__wickra قابل‌دسترسیه، typeof:', typeof g);
    console.log('   کلیدهاش با wickra اصلی یکسانه:', Object.keys(g).join(', ') === topKeys.join(', ') ? 'بله' : 'نه (!)');
} catch (e) {
    console.log('   ❌ خطا در دسترسی به global.__wickra:', e.message);
}

console.log('\n' + '='.repeat(60));
console.log('✅ پایان تشخیص. کل خروجی بالا رو کپی کن و بفرست.');
console.log('='.repeat(60));
