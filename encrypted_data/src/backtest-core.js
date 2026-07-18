const wickra = require('wickra');
global.__wickra = wickra;

// ==================== ایچیموکو بدون آینده‌نگری ====================

function calculateIchimokuHistorical(data, currentIndex, options = {}) {
    const tenkanPeriod = options.tenkanPeriod || 9;
    const kijunPeriod = options.kijunPeriod || 26;
    const senkouBPeriod = options.senkouBPeriod || 52;

    // فقط از داده‌های تاریخی تا currentIndex استفاده کن
    const historicalData = data.slice(0, currentIndex + 1);

    if (historicalData.length < Math.max(tenkanPeriod, kijunPeriod, senkouBPeriod)) {
        return null;
    }

    const result = {
        tenkan: 0,
        kijun: 0,
        senkouA: 0,
        senkouB: 0,
        chikou: 0,
        kumoTop: 0,
        kumoBottom: 0,
        isPriceAboveCloud: false,
        isPriceBelowCloud: false,
        isTenkanAboveKijun: false,
        isChikouBullish: false,
        kumoThickness: 0
    };

    // محاسبه تنکان‌سن (میانگین بالاترین و پایین‌ترین ۹ دوره)
    if (currentIndex >= tenkanPeriod - 1) {
        let high9 = -Infinity;
        let low9 = Infinity;
        for (let i = currentIndex - tenkanPeriod + 1; i <= currentIndex; i++) {
            if (data[i].high > high9) high9 = data[i].high;
            if (data[i].low < low9) low9 = data[i].low;
        }
        result.tenkan = (high9 + low9) / 2;
    }

    // محاسبه کیجون‌سن (میانگین بالاترین و پایین‌ترین ۲۶ دوره)
    if (currentIndex >= kijunPeriod - 1) {
        let high26 = -Infinity;
        let low26 = Infinity;
        for (let i = currentIndex - kijunPeriod + 1; i <= currentIndex; i++) {
            if (data[i].high > high26) high26 = data[i].high;
            if (data[i].low < low26) low26 = data[i].low;
        }
        result.kijun = (high26 + low26) / 2;
    }

    // محاسبه سنکو اسپن B (میانگین بالاترین و پایین‌ترین ۵۲ دوره)
    if (currentIndex >= senkouBPeriod - 1) {
        let high52 = -Infinity;
        let low52 = Infinity;
        for (let i = currentIndex - senkouBPeriod + 1; i <= currentIndex; i++) {
            if (data[i].high > high52) high52 = data[i].high;
            if (data[i].low < low52) low52 = data[i].low;
        }
        result.senkouB = (high52 + low52) / 2;
    }

    // محاسبه سنکو اسپن A (میانگین تنکان‌سن و کیجون‌سن)
    if (result.tenkan && result.kijun) {
        result.senkouA = (result.tenkan + result.kijun) / 2;
    }

    // محاسبه چیکو اسپن: قیمت بسته فعلی (که روی چارت ۲۶ کندل به عقب shift می‌شود)
    // تعریف استاندارد: chikou = close فعلی، مقایسه با close ۲۶ کندل قبل
    result.chikou = data[currentIndex].close;

    // محاسبه ابر کومو (بدون شیفت به جلو! - شیفت در حلقه اصلی انجام می‌شود)
    if (result.senkouA && result.senkouB) {
        result.kumoTop = Math.max(result.senkouA, result.senkouB);
        result.kumoBottom = Math.min(result.senkouA, result.senkouB);
        result.kumoThickness = result.kumoTop - result.kumoBottom;
    }

    // وضعیت فعلی قیمت نسبت به ابر (با توجه به شیفت، در حلقه اصلی محاسبه می‌شود)
    const currentPrice = data[currentIndex].close;
    result.isPriceAboveCloud = currentPrice > result.kumoTop;
    result.isPriceBelowCloud = currentPrice < result.kumoBottom;

    // رابطه تنکان‌سن و کیجون‌سن
    if (result.tenkan && result.kijun) {
        result.isTenkanAboveKijun = result.tenkan > result.kijun;
    }

    // وضعیت چیکو اسپن: چیکو (= close فعلی) باید با close 26 کندل قبل مقایسه شود
    // اگر close فعلی بالاتر از close 26 کندل قبل باشد → bullish
    if (currentIndex >= 26) {
        result.isChikouBullish = result.chikou > data[currentIndex - 26].close;
    }

    return result;
}

// ==================== توابع اصلی ====================

// State management برای پردازش افزایشی
let trendDetectionState = {
    processedData: [],
    pivots: [],
    pendingTrendLines: [],
    trendLines: {
        primaryUp: [],
        primaryDown: [],
        majorExternalUp: [],
        majorExternalDown: [],
        majorInternalUp: [],
        majorInternalDown: [],
        manualUp: [],
        manualDown: []
    }
};

// تابع پیشرفته برای شناسایی نقاط پیوت - اصلاح شده برای عدم آینده‌نگری
function findPivotPoints(data, pivotPeriod = 5, maxIndex = null) {
    if (!data || data.length < pivotPeriod * 2 + 1) {
        return [];
    }

    const endIndex = (maxIndex !== null && maxIndex < data.length) ? maxIndex : data.length - 1;
    const pivots = [];

    for (let i = pivotPeriod; i <= endIndex - pivotPeriod; i++) {
        const currentHigh = data[i].high;
        const currentLow = data[i].low;

        let isHighPivot = true;
        let isLowPivot = true;

        // بررسی برای پیوت سقف
        for (let j = 1; j <= pivotPeriod; j++) {
            if (currentHigh < data[i - j].high || currentHigh < data[i + j].high) {
                isHighPivot = false;
                break;
            }
        }

        // بررسی برای پیوت کف
        for (let j = 1; j <= pivotPeriod; j++) {
            if (currentLow > data[i - j].low || currentLow > data[i + j].low) {
                isLowPivot = false;
                break;
            }
        }

        if (isHighPivot) {
            pivots.push({
                index: i,
                price: currentHigh,
                type: 'high',
                timestamp: data[i].timestamp
            });
        }

        if (isLowPivot) {
            pivots.push({
                index: i,
                price: currentLow,
                type: 'low',
                timestamp: data[i].timestamp
            });
        }
    }

    return pivots;
}

// تابع اعتبارسنجی محدوده زمانی
function isValidDuration(line, minMinutes, maxMinutes) {
    const startTime = new Date(line.startTime * 1000);
    const endTime = new Date(line.endTime * 1000);
    const durationMinutes = (endTime - startTime) / (1000 * 60);

    return durationMinutes >= minMinutes && durationMinutes <= maxMinutes;
}

// تابع ایجاد خط روند - اصلاح شده برای عدم آینده‌نگری
function createTrendLine(p1, p2, marketData, options, currentCandleIndex) {
    // 1. بررسی عدم استفاده از داده‌های آینده
    if (p2.index > currentCandleIndex) {
        return null;
    }

    // 2. تعریف تابع convertTimestamp
    function convertTimestamp(timestamp) {
        if (timestamp instanceof Date) {
            return Math.floor(timestamp.getTime() / 1000);
        } else if (typeof timestamp === 'number') {
            return timestamp > 1000000000000
                ? Math.floor(timestamp / 1000)
                : timestamp;
        } else if (typeof timestamp === 'string') {
            const date = new Date(timestamp);
            return Math.floor(date.getTime() / 1000);
        } else {
            const baseTime = marketData.length > 0 ?
                Math.floor(new Date(marketData[0].timestamp).getTime() / 1000) :
                Math.floor(Date.now() / 1000);
            return baseTime + (p1.index * 3600);
        }
    }

    // 3. پیدا کردن تمام نقاط پیوت (با محدودیت به currentCandleIndex)
    const allPivots = findPivotPoints(marketData, options.pivotPeriod || 5, currentCandleIndex);

    // 4. فیلتر کردن پیوت‌های هم‌نوع بین p1 و p2
    const linePivots = allPivots.filter(pivot =>
        pivot.index >= p1.index &&
        pivot.index <= p2.index &&
        pivot.type === p1.type
    ).sort((a, b) => a.index - b.index);

    // 5. شرط حداقل 3 پیوت
    if (linePivots.length < 3) {
        return null;
    }

    // 6. شرط فاصله بین پیوت‌های متوالی حداقل 3 کندل
    const minCandleDistance = options.minCandleDistance || 3;
    for (let i = 1; i < linePivots.length; i++) {
        const distance = linePivots[i].index - linePivots[i - 1].index;
        if (distance < minCandleDistance) {
            return null;
        }
    }

    // 7. محاسبه شیب و عرض از مبدا
    const slope = (p2.price - p1.price) / (p2.index - p1.index);
    const intercept = p1.price - slope * p1.index;

    // 8. تعیین نوع خط
    const lineType = options.isManual ?
        (p1.type === 'low' && p2.type === 'low' ? 'manualUp' :
            p1.type === 'high' && p2.type === 'high' ? 'manualDown' : 'unknown') :
        (p1.type === 'low' && p2.type === 'low' ? 'primaryUp' :
            p1.type === 'high' && p2.type === 'high' ? 'primaryDown' : 'unknown');

    // 9. ساخت شیء خط
    const line = {
        startIndex: p1.index,
        startPrice: p1.price,
        endIndex: p2.index,
        endPrice: p2.price,
        startTime: convertTimestamp(p1.timestamp),
        endTime: convertTimestamp(p2.timestamp),
        slope: slope,
        intercept: intercept,
        pivot1: p1,
        pivot2: p2,
        pivots: linePivots,
        type: lineType,
        isManual: options.isManual || false,
        touchDetails: []
    };

    return line;
}

function isValidTrendLine(line, marketData, options, currentCandleIndex) {
    const maxDeviation = options.precision || 0.000001;
    const minTouchPoints = options.minTouchPoints || 3;
    const minCandleDistance = options.minCandleDistance || 3;

    // شرط ۱: بررسی حداقل ۳ پیوت و فاصله بین پیوت‌های متوالی
    if (line.pivots && Array.isArray(line.pivots)) {
        if (line.pivots.length < 3) {
            return false;
        }

        const sortedPivots = [...line.pivots].sort((a, b) => a.index - b.index);
        for (let i = 1; i < sortedPivots.length; i++) {
            const distance = sortedPivots[i].index - sortedPivots[i - 1].index;
            if (distance < minCandleDistance) {
                return false;
            }
        }
    } else if (line.pivot1 && line.pivot2) {
        return false;
    } else {
        return false;
    }

    // شرط ۲: بررسی استفاده از داده‌های آینده
    if (line.endIndex > currentCandleIndex) {
        return false;
    }

    // شرط ۳: بررسی شیب برای خطوط صعودی/نزولی
    if (line.pivots && line.pivots.length >= 2) {
        const firstPivot = line.pivots[0];
        const lastPivot = line.pivots[line.pivots.length - 1];

        if (firstPivot.type === 'low' && lastPivot.type === 'low') {
            if (lastPivot.price <= firstPivot.price) {
                return false;
            }
        } else if (firstPivot.type === 'high' && lastPivot.type === 'high') {
            if (lastPivot.price >= firstPivot.price) {
                return false;
            }
        }
    }

    // شرط ۴: بررسی محدوده زمانی برای خطوط دستی
    if (options.isManual && options.manualMinDuration && options.manualMaxDuration) {
        if (!isValidDuration(line, options.manualMinDuration, options.manualMaxDuration)) {
            return false;
        }
    }

    // شرط ۵: بررسی حداقل ۳ نقطه برخورد با فاصله کندلی
    let touchPoints = 0;
    const touchPointIndices = [];
    let lastTouchIndex = null;

    for (let i = line.startIndex; i <= line.endIndex; i++) {
        if (i >= marketData.length) break;

        const expectedPrice = line.slope * i + line.intercept;
        const candle = marketData[i];

        let hasTouch = false;

        if (line.type.includes('Up') || line.type.includes('manualUp')) {
            if (Math.abs(candle.low - expectedPrice) / expectedPrice <= maxDeviation) {
                hasTouch = true;
            }
        } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
            if (Math.abs(candle.high - expectedPrice) / expectedPrice <= maxDeviation) {
                hasTouch = true;
            }
        }

        if (hasTouch) {
            if (lastTouchIndex === null) {
                touchPoints++;
                touchPointIndices.push(i);
                lastTouchIndex = i;
            } else {
                const distance = i - lastTouchIndex;
                if (distance >= minCandleDistance) {
                    touchPoints++;
                    touchPointIndices.push(i);
                    lastTouchIndex = i;
                }
            }
        }
    }

    if (touchPoints < minTouchPoints) {
        return false;
    }

    // شرط ۶: بررسی عدم شکست خط بین نقاط برخورد
    if (touchPointIndices.length >= 2) {
        const firstTouchIndex = touchPointIndices[0];
        const lastTouchIndex = touchPointIndices[touchPointIndices.length - 1];

        for (let i = firstTouchIndex + 1; i < lastTouchIndex; i++) {
            if (i >= marketData.length) break;

            const expectedPrice = line.slope * i + line.intercept;
            const candle = marketData[i];

            const candleSize = (candle.high - candle.low) / candle.low * 100;
            if (candleSize < 0.10) {
                continue;
            }

            if (line.type.includes('Up') || line.type.includes('manualUp')) {
                if (candle.low < expectedPrice) {
                    return false;
                }
            } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
                if (candle.high > expectedPrice) {
                    return false;
                }
            }
        }
    }

    // شرط ۷: بررسی اینکه نقاط برخورد حداقل ۳ نقطه متمایز باشند
    const uniqueTouchPoints = [...new Set(touchPointIndices)];
    if (uniqueTouchPoints.length < minTouchPoints) {
        return false;
    }

    return true;
}

function processTrendLineDataForMain(trendLines, marketData = [], options = {}) {
    const result = {};
    let totalValidLines = 0;

    for (const [type, lines] of Object.entries(trendLines)) {
        if (!Array.isArray(lines)) {
            result[type] = [];
            continue;
        }

        const validLines = lines.map(line => {
            if (marketData && marketData.length > 0 && !line.touchDetails) {
                const currentCandleIndex = marketData.length - 1;
                const touchInfo = countTouchPoints(line, marketData, currentCandleIndex, options);
                line.touchDetails = touchInfo.details;
            }

            return line;
        }).filter(line => {
            const isValid = line &&
                line.startTime && !isNaN(line.startTime) &&
                line.endTime && !isNaN(line.endTime) &&
                line.startPrice && !isNaN(line.startPrice) &&
                line.endPrice && !isNaN(line.endPrice) &&
                line.startTime < line.endTime;

            return isValid;
        });

        result[type] = validLines;
        totalValidLines += validLines.length;
    }

    return result;
}

function detectTrendLinesFromPivots(pivots, marketData, options, currentCandleIndex) {
    if (!pivots || pivots.length < 2) {
        return {
            primaryUp: [],
            primaryDown: [],
            majorExternalUp: [],
            majorExternalDown: [],
            majorInternalUp: [],
            majorInternalDown: [],
            manualUp: [],
            manualDown: []
        };
    }

    const primaryUp = [];
    const primaryDown = [];
    const manualUp = [];
    const manualDown = [];

    const validPivots = pivots.filter(p => p.index <= currentCandleIndex);

    // شناسایی خطوط صعودی (کف به کف)
    const lowPivots = validPivots.filter(p => p.type === 'low').sort((a, b) => a.index - b.index);

    for (let i = 0; i < lowPivots.length - 1; i++) {
        for (let j = i + 1; j < lowPivots.length; j++) {
            const p1 = lowPivots[i];
            const p2 = lowPivots[j];

            const line = createTrendLine(p1, p2, marketData, options, currentCandleIndex);
            if (!line) continue;

            if (isValidTrendLine(line, marketData, options, currentCandleIndex)) {
                const targetArray = options.isManual ? manualUp : primaryUp;
                const isDuplicate = targetArray.some(existingLine =>
                    existingLine.startIndex === line.startIndex &&
                    existingLine.endIndex === line.endIndex
                );

                if (!isDuplicate) {
                    const touchInfo = countTouchPoints(line, marketData, currentCandleIndex, options);
                    line.touchDetails = touchInfo.details;
                    targetArray.push(line);
                }
            }
        }
    }

    // شناسایی خطوط نزولی (سقف به سقف)
    const highPivots = validPivots.filter(p => p.type === 'high').sort((a, b) => a.index - b.index);

    for (let i = 0; i < highPivots.length - 1; i++) {
        for (let j = i + 1; j < highPivots.length; j++) {
            const p1 = highPivots[i];
            const p2 = highPivots[j];

            const line = createTrendLine(p1, p2, marketData, options, currentCandleIndex);
            if (!line) continue;

            if (isValidTrendLine(line, marketData, options, currentCandleIndex)) {
                const targetArray = options.isManual ? manualDown : primaryDown;
                const isDuplicate = targetArray.some(existingLine =>
                    existingLine.startIndex === line.startIndex &&
                    existingLine.endIndex === line.endIndex
                );

                if (!isDuplicate) {
                    const touchInfo = countTouchPoints(line, marketData, currentCandleIndex, options);
                    line.touchDetails = touchInfo.details;
                    targetArray.push(line);
                }
            }
        }
    }

    return {
        primaryUp: primaryUp,
        primaryDown: primaryDown,
        manualUp: manualUp,
        manualDown: manualDown,
        majorExternalUp: [],
        majorExternalDown: [],
        majorInternalUp: [],
        majorInternalDown: []
    };
}

function detectTrendLinesAdvanced(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {

            options.precision = 0.001

            const currentCandleIndex = marketData.length - 1;
            const pivotPeriod = options.pivotPeriod || 5;
            // اصلاح: فقط داده‌های تا کندل فعلی را به findPivotPoints بدهیم
            const dataUpToNow = marketData.slice(0, currentCandleIndex + 1);
            const allPivots = findPivotPoints(dataUpToNow, pivotPeriod, currentCandleIndex);

            if (allPivots.length < 2) {
                resolve({
                    trendLines: {
                        primaryUp: [],
                        primaryDown: [],
                        majorExternalUp: [],
                        majorExternalDown: [],
                        majorInternalUp: [],
                        majorInternalDown: [],
                        manualUp: [],
                        manualDown: []
                    },
                    statistics: {
                        totalLines: 0,
                        primaryUp: 0,
                        primaryDown: 0,
                        manualUp: 0,
                        manualDown: 0
                    }
                });
                return;
            }

            const trendLines = detectTrendLinesFromPivots(allPivots, marketData, options, currentCandleIndex);
            const processedTrendLines = processTrendLineDataForMain(trendLines, marketData, options);

            const result = {
                trendLines: processedTrendLines,
                statistics: {
                    totalLines: processedTrendLines.primaryUp.length + processedTrendLines.primaryDown.length +
                        processedTrendLines.manualUp.length + processedTrendLines.manualDown.length,
                    primaryUp: processedTrendLines.primaryUp.length,
                    primaryDown: processedTrendLines.primaryDown.length,
                    manualUp: processedTrendLines.manualUp.length,
                    manualDown: processedTrendLines.manualDown.length,
                    majorExternalUp: 0,
                    majorExternalDown: 0,
                    majorInternalUp: 0,
                    majorInternalDown: 0
                }
            };

            resolve(result);

        } catch (error) {
            console.error('❌ [ADVANCED_ERROR] خطا:', error);
            reject(error);
        }
    });
}

function detectTrendLinesIncremental(data, state, options) {
    if (!state || !state.processedData) {
        state = {
            processedData: [],
            pivots: [],
            pendingTrendLines: [],
            trendLines: {
                primaryUp: [],
                primaryDown: [],
                majorExternalUp: [],
                majorExternalDown: [],
                majorInternalUp: [],
                majorInternalDown: [],
                manualUp: [],
                manualDown: []
            }
        };
    }

    if (!Array.isArray(state.pendingTrendLines)) {
        state.pendingTrendLines = [];
    }

    const currentCandleIndex = data.length - 1;
    state.processedData = data;

    const allPivots = findPivotPoints(data, options.pivotPeriod || 5, currentCandleIndex);
    state.pivots = allPivots;

    const newTrendLines = detectTrendLinesFromPivots(state.pivots, data, options, currentCandleIndex);
    addNewLinesToPending(state, newTrendLines, currentCandleIndex, options);
    validatePendingLines(state, data, options, currentCandleIndex);

    const processedTrendLines = processTrendLineDataForMain(state.trendLines, data, options);

    return {
        trendLines: processedTrendLines,
        state: state
    };
}

function addNewLinesToPending(state, newTrendLines, currentCandleIndex, options = {}) {
    if (newTrendLines.primaryUp && Array.isArray(newTrendLines.primaryUp)) {
        newTrendLines.primaryUp.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.primaryUp && state.trendLines.primaryUp.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'primaryUp',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex, options).count,
                    createdAt: currentCandleIndex
                });
            }
        });
    }

    if (newTrendLines.primaryDown && Array.isArray(newTrendLines.primaryDown)) {
        newTrendLines.primaryDown.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.primaryDown && state.trendLines.primaryDown.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'primaryDown',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex, options).count,
                    createdAt: currentCandleIndex
                });
            }
        });
    }

    if (newTrendLines.manualUp && Array.isArray(newTrendLines.manualUp)) {
        newTrendLines.manualUp.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.manualUp && state.trendLines.manualUp.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'manualUp',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex, options).count,
                    createdAt: currentCandleIndex
                });
            }
        });
    }

    if (newTrendLines.manualDown && Array.isArray(newTrendLines.manualDown)) {
        newTrendLines.manualDown.forEach(line => {
            const isDuplicate = state.pendingTrendLines.some(pendingLine =>
                pendingLine.startIndex === line.startIndex &&
                pendingLine.endIndex === line.endIndex
            ) || (state.trendLines.manualDown && state.trendLines.manualDown.some(validLine =>
                validLine.startIndex === line.startIndex &&
                validLine.endIndex === line.endIndex
            ));

            if (!isDuplicate) {
                state.pendingTrendLines.push({
                    ...line,
                    type: 'manualDown',
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex, options).count,
                    createdAt: currentCandleIndex
                });
            }
        });
    }
}

function validatePendingLines(state, marketData, options, currentCandleIndex) {
    const minTouchPoints = 3;
    const stillPending = [];

    if (!state.trendLines.primaryUp) state.trendLines.primaryUp = [];
    if (!state.trendLines.primaryDown) state.trendLines.primaryDown = [];
    if (!state.trendLines.manualUp) state.trendLines.manualUp = [];
    if (!state.trendLines.manualDown) state.trendLines.manualDown = [];

    state.pendingTrendLines.forEach(pendingLine => {
        // اصلاح باگ: countTouchPoints یک آبجکت {count, details} برمی‌گرداند، نه عدد خام
        // قبلاً این مقایسه همیشه نادرست بود چون آبجکت با عدد مقایسه می‌شد
        const touchInfo = countTouchPoints(pendingLine, marketData, currentCandleIndex, options);
        const currentTouchPoints = touchInfo.count;

        if (currentTouchPoints >= minTouchPoints) {
            if (pendingLine.type === 'primaryUp') {
                state.trendLines.primaryUp.push(pendingLine);
            } else if (pendingLine.type === 'primaryDown') {
                state.trendLines.primaryDown.push(pendingLine);
            } else if (pendingLine.type === 'manualUp') {
                state.trendLines.manualUp.push(pendingLine);
            } else if (pendingLine.type === 'manualDown') {
                state.trendLines.manualDown.push(pendingLine);
            }
        } else {
            stillPending.push({
                ...pendingLine,
                touchPoints: currentTouchPoints
            });
        }
    });

    state.pendingTrendLines = stillPending;
}

function countTouchPoints(line, marketData, currentCandleIndex, options = {}) {
    // اصلاح: استفاده از همان precision که در isValidTrendLine استفاده می‌شود
    // تا بین این دو تابع ناهماهنگی در شمارش touch points وجود نداشته باشد
    const maxDeviation = options.precision || 0.001;
    const minCandleDistance = 3;
    let touchPoints = 0;
    let touchDetails = [];
    let lastTouchIndex = null;

    const validationEndIndex = currentCandleIndex;

    for (let i = line.startIndex; i <= validationEndIndex; i++) {
        if (i >= marketData.length) break;

        const expectedPrice = line.slope * i + line.intercept;
        const candle = marketData[i];

        let priceToCheck;
        if (line.type.includes('Up')) {
            priceToCheck = candle.low;
        } else if (line.type.includes('Down')) {
            priceToCheck = candle.high;
        } else {
            priceToCheck = candle.close;
        }

        const deviation = Math.abs(priceToCheck - expectedPrice) / expectedPrice;

        if (deviation <= maxDeviation) {
            if (lastTouchIndex === null) {
                touchPoints++;

                let direction;
                if (line.type.includes('Up')) {
                    direction = candle.low <= expectedPrice ? 'fromBelow' : 'fromAbove';
                } else if (line.type.includes('Down')) {
                    direction = candle.high >= expectedPrice ? 'fromAbove' : 'fromBelow';
                } else {
                    direction = 'unknown';
                }

                touchDetails.push({
                    index: i,
                    price: priceToCheck,
                    time: candle.timestamp,
                    direction: direction,
                    expectedPrice: expectedPrice,
                    deviation: deviation
                });

                lastTouchIndex = i;

            } else {
                const distance = i - lastTouchIndex;

                if (distance >= minCandleDistance) {
                    touchPoints++;

                    let direction;
                    if (line.type.includes('Up')) {
                        direction = candle.low <= expectedPrice ? 'fromBelow' : 'fromAbove';
                    } else if (line.type.includes('Down')) {
                        direction = candle.high >= expectedPrice ? 'fromAbove' : 'fromBelow';
                    } else {
                        direction = 'unknown';
                    }

                    touchDetails.push({
                        index: i,
                        price: priceToCheck,
                        time: candle.timestamp,
                        direction: direction,
                        expectedPrice: expectedPrice,
                        deviation: deviation
                    });

                    lastTouchIndex = i;
                }
            }

            if (touchDetails.length >= 15) {
                break;
            }
        }
    }

    line.touchDetails = touchDetails;

    return {
        count: touchPoints,
        details: touchDetails
    };
}

// ==================== BATCH + فرمول برای خطوط روند (جایگزین سریع افزایشی) ====================
//
// ⚠️ نکته‌ی حیاتی درباره‌ی options.precision:
// عمداً از detectTrendLinesAdvanced استفاده نمی‌کنیم، چون آن تابع خط
// `options.precision = 0.001` را روی همان آبجکتِ ورودی (به‌صورت side-effect) ست
// می‌کند — یعنی هر جا caller همان options را دوباره پاس بدهد (مثلاً برای اجرای
// موازیِ incremental در حالت VERIFY_BATCH_EQUIVALENCE)، precision واقعی‌ای که
// کاربر تنظیم کرده (یا نکرده، که یعنی پیش‌فرض isValidTrendLine یعنی 0.000001)
// را بی‌سروصدا به 0.001 تغییر می‌دهد. اگر از همان مسیر استفاده می‌کردیم، دقیقاً
// همین mutation باعث می‌شد در تست هم‌ارزی، هر دو روش با یک precision (0.001)
// اجرا بشن و یک ناهماهنگی واقعی (که در تولید/لایو با precision واقعی رخ می‌داد)
// را مخفی کند. برای همین مستقیماً از detectTrendLinesFromPivots — دقیقاً همان
// تابعی که detectTrendLinesIncremental هر کندل صدا می‌زند — با یک کپیِ ایزوله از
// options استفاده می‌کنیم تا رفتار batch با رفتار لایو/افزایشی از هر نظر یکسان
// بماند.
function precomputeTrendLinesBatch(marketData, options) {
    const pivotPeriod = options.pivotPeriod || 5;
    const currentCandleIndex = marketData.length - 1;

    // کپی ایزوله تا هیچ mutation‌ای روی آبجکت ورودی کاربر اثر نگذارد
    const isolatedOptions = { ...options };

    const allPivots = findPivotPoints(marketData, pivotPeriod, currentCandleIndex);
    const trendLinesByType = detectTrendLinesFromPivots(allPivots, marketData, isolatedOptions, currentCandleIndex);

    const flat = [];
    ['primaryUp', 'primaryDown', 'manualUp', 'manualDown'].forEach(type => {
        const lines = trendLinesByType[type] || [];
        lines.forEach(line => {
            // کندلی که این خط اولین‌بار در حالت افزایشی/لایو در دسترس استراتژی
            // قرار می‌گرفت: همان کندلی که pivot پایانی خط (endIndex) برای اولین‌بار
            // توسط findPivotPoints قابل‌تشخیص می‌شود، یعنی endIndex + pivotPeriod
            // (چون findPivotPoints برای تایید یک پیوت به pivotPeriod کندلِ بعدی
            // نیاز دارد).
            line.activationCandle = line.endIndex + pivotPeriod;
            flat.push(line);
        });
    });

    // مرتب‌سازی بر اساس activationCandle برای جست‌وجوی سریع افزایشی بعدی.
    // برای خطوطی با activationCandle برابر، ترتیب پایدار بر اساس startIndex/endIndex
    // حفظ می‌شود تا شناسه‌ها (id) هر بار به‌طور یکسان تولید شوند.
    flat.sort((a, b) => {
        if (a.activationCandle !== b.activationCandle) return a.activationCandle - b.activationCandle;
        if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
        return a.endIndex - b.endIndex;
    });

    // تخصیص یک‌بارِ id پایدار به هر خط (چون این خطوط دیگر هیچ‌وقت از نو ساخته
    // نمی‌شوند، برخلاف incremental که id را هر بار در prepareTrendLines طبق موقعیتِ
    // آن لحظه در آرایه تولید می‌کرد — این‌جا همان کار را یک‌بار برای همیشه انجام
    // می‌دهیم تا id هر خط در تمام کندل‌های بعدی ثابت بماند).
    const perTypeCounter = {};
    flat.forEach(line => {
        const t = line.type;
        const idx = perTypeCounter[t] || 0;
        line.id = `${t}_${line.startIndex}_${line.endIndex}_${idx}`;
        perTypeCounter[t] = idx + 1;
    });

    return flat;
}

// برمی‌گرداند فقط خطوطی که activationCandle <= candleIndex باشد.
// چون allBatchLines از قبل بر اساس activationCandle مرتب شده و candleIndex در
// حلقه‌ی اصلی بکتست همیشه صعودی صدا زده می‌شود، به‌جای فیلترِ کامل هر بار، از یک
// pointer فزاینده استفاده می‌کنیم که فقط جلو می‌رود (هیچ‌وقت عقب نمی‌رود) و
// خطوط تازه‌فعال‌شده را به آرایه‌ی خروجیِ تجمعی اضافه می‌کند (دقیقاً مثل رفتار
// append-only آرایه‌های state.trendLines در نسخه‌ی افزایشی).
// cursorState باید یک‌بار قبل از حلقه به‌صورت { pos: 0, activeLines: [] } مقداردهی شود.
function getActiveTrendLinesAtCandle(allBatchLines, candleIndex, cursorState) {
    while (
        cursorState.pos < allBatchLines.length &&
        allBatchLines[cursorState.pos].activationCandle <= candleIndex
    ) {
        cursorState.activeLines.push(allBatchLines[cursorState.pos]);
        cursorState.pos++;
    }
    return cursorState.activeLines;
}

// ==================== تابع اصلی بکتست با همه اصلاحات ====================

async function runBacktest(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            const code = options.code;
            if (!code) {
                throw new Error('کد استراتژی تعریف نشده است');
            }

            // ==================== پارامترهای اجباری حالت ورود (بدون مقدار پیش‌فرض) ====================
            const entryType = options.entryType;
            const breakTolerance = options.breakTolerance;

            if (entryType !== 'nextCandle' && entryType !== 'openBreak') {
                throw new Error(
                    `پارامتر entryType نامعتبر یا تعریف‌نشده است: ${JSON.stringify(entryType)}. مقادیر مجاز: "nextCandle" یا "openBreak".`
                );
            }
            if (typeof breakTolerance !== 'number' || !isFinite(breakTolerance) || breakTolerance <= 0) {
                throw new Error(
                    `پارامتر breakTolerance نامعتبر یا تعریف‌نشده است: ${JSON.stringify(breakTolerance)}. باید یک عدد اعشاری مثبت باشد (مثلاً 0.001).`
                );
            }

            const openBreakEntry = entryType === 'openBreak';

            // ==================== واگرایی (Divergence) ====================
            // اصلاح باگ: قبلاً options.divergenceDetector/divergenceSettings که از
            // run-backtest.js پاس داده می‌شدند، اصلاً اینجا خوانده نمی‌شدند و
            // getDivergenceSignals() هیچ‌وقت به scope تابع استراتژی (new Function در
            // پایین فایل) تزریق نمی‌شد. نتیجه: هر استراتژی‌ای که از getDivergenceSignals()
            // استفاده می‌کرد، روی هر کندل ReferenceError می‌گرفت (که در try/catch اطراف
            // strategyFn بی‌صدا قورت داده می‌شد) و همیشه صفر ترید تولید می‌کرد.
            const divergenceDetector = options.divergenceDetector || null;
            const divergenceSettings = options.divergenceSettings || null;
            const divergenceIndicators = (divergenceSettings && Array.isArray(divergenceSettings.indicators))
                ? divergenceSettings.indicators
                : [];
            // نکته‌ی عملکردی: runDivergenceDetection هر بار RSI/MACD را از صفر روی کل
            // marketData محاسبه می‌کند (خودِ ماژول divergence-detector.js هم چون
            // detectDivergence را export نمی‌کند، راهی برای محاسبه‌ی افزایشی نمی‌گذارد).
            // صدا زدنش در هر کندل یعنی هزینه‌ی O(n^2) روی دیتاست‌های بزرگ. برای کنترل این
            // هزینه، divergenceSettings.recomputeInterval (پیش‌فرض ۱ = دقیق‌ترین حالت،
            // هر کندل) throttle می‌کند؛ بین دو بازمحاسبه، آخرین نتیجه (که چون با
            // maxIndex واقعی همان لحظه محاسبه شده، هنوز کاملاً lookahead-free است) نگه
            // داشته می‌شود.
            const divergenceRecomputeInterval = Math.max(1, divergenceSettings?.recomputeInterval || 1);
            if (divergenceIndicators.length > 0 && !divergenceDetector) {
                console.warn('⚠️ [DIVERGENCE] divergenceSettings.indicators تنظیم شده اما divergenceDetector پاس داده نشده — واگرایی محاسبه نخواهد شد و getDivergenceSignals() همیشه [] برمی‌گرداند.');
            }
            let __lastDivergenceComputedIndex = -1;
            let __lastDivergenceSignals = [];

            // ==================== تنظیمات سیستم ادامه‌دهی ====================
            const settings = {
                enableContinuation: options.enableContinuation !== false,
                maxContinuationFiles: options.maxContinuationFiles || 3,
                handleGaps: options.handleGaps !== false,
                useStagedStopLoss: options.useStagedStopLoss !== false,
                uploadedFiles: options.uploadedFiles || {},
                combinedFiles: options.combinedFiles || {},
                fileName: options.fileName || 'unknown',
                timezoneOffset: options.timezoneOffset || 0, // به دقیقه
                symbolType: options.symbolType || 'crypto', // 'crypto' یا 'forex' (برای طلا/XAUUSD)
                // بافر خودکار ادامه‌دهی: اگر true باشد، هنگام ادامه‌دهی معاملات باز به فایل بعدی
                // (یا در ابتدای هر فایل جدید)، بخشی از انتهای داده‌ی فایل(های) قبلی به‌صورت خودکار
                // به ابتدای فایل جدید الحاق می‌شود (بدون نیاز به تعریف پارامتر جدیدی مثل bufferSize
                // در استراتژی). اندازه‌ی این بافر بر اساس تایم‌فریم به‌صورت پویا محاسبه می‌شود
                // (رجوع کنید به calculateBufferPercentage).
                enableSmartContinuation: options.enableSmartContinuation === true,
                // برچسب تایم‌فریم جاری (مثلاً "5m", "15m", "30m", "1h") — برای محاسبه‌ی درصد بافر پویا
                timeframeLabel: options.timeframeLabel || null
            };

            // ==================== توابع بافر پویا بر اساس تایم‌فریم (بدون پارامتر جدید در استراتژی) ====================
            // calculateBufferPercentage: درصد بافر مورد نیاز را بر اساس برچسب تایم‌فریم برمی‌گرداند.
            //   15m → 0.75 (۷۵٪)   30m → 1.25 (۱۲۵٪)   1h → 2.00 (۲۰۰٪)   سایر موارد (مثلاً 5m) → 0.25 (۲۵٪، رفتار قبلی)
            function calculateBufferPercentage(timeframeLabel) {
                switch (timeframeLabel) {
                    case '15m': return 0.75;
                    case '30m': return 1.25;
                    case '1h': return 2.00;
                    default: return 0.25;
                }
            }

            // نرمال‌سازی ورودی prevDataList: هم آرایه‌ای از آرایه‌های کندل (چند فایل قبلی، از
            // جدیدترین به قدیمی‌ترین) و هم یک آرایه‌ی تک‌فایلی (رفتار قدیمی/legacy) را می‌پذیرد.
            function normalizePrevDataList(prevDataList) {
                if (!prevDataList) return [];
                if (Array.isArray(prevDataList) && prevDataList.length > 0 && Array.isArray(prevDataList[0])) {
                    return prevDataList.filter(d => d && d.length > 0);
                }
                return (Array.isArray(prevDataList) && prevDataList.length > 0) ? [prevDataList] : [];
            }

            // calculateBufferSize: بر اساس targetPercentage، بافر لازم را از یک یا چند فایل قبلی می‌سازد.
            //   prevDataList: آرایه‌ای از داده‌های فایل‌های قبلی، از جدیدترین (prevDataList[0]) به قدیمی‌ترین.
            //   targetPercentage <= 1  → فقط از آخرین فایل قبلی، به اندازه‌ی floor(length * targetPercentage) کندل.
            //   targetPercentage > 1   → کل آخرین فایل قبلی + بخشی/کل از فایل(های) ماقبل تا رسیدن به درصد.
            // بافر فقط از داده‌های گذشته ساخته می‌شود؛ پس هیچ آینده‌نگری‌ای رخ نمی‌دهد.
            function calculateBufferSize(prevDataList, targetPercentage) {
                const normalized = normalizePrevDataList(prevDataList);
                if (normalized.length === 0 || !normalized[0] || normalized[0].length === 0) {
                    return [];
                }

                if (targetPercentage <= 1) {
                    const prevFile = normalized[0];
                    const bufferCount = Math.floor(prevFile.length * targetPercentage);
                    return bufferCount > 0 ? prevFile.slice(prevFile.length - bufferCount) : [];
                }

                // targetPercentage > 1: کل آخرین فایل قبلی + بخشی از فایل‌های قدیمی‌تر
                let remainingPercent = targetPercentage - 1;
                const bufferParts = [normalized[0]]; // کل آخرین فایل قبلی (ترتیب زمانی حفظ می‌شود)
                let fileIdx = 1;
                while (remainingPercent > 0 && fileIdx < normalized.length) {
                    const olderFile = normalized[fileIdx];
                    if (!olderFile || olderFile.length === 0) { fileIdx++; continue; }
                    if (remainingPercent >= 1) {
                        bufferParts.unshift(olderFile); // کل فایل ماقبل
                        remainingPercent -= 1;
                    } else {
                        const partialCount = Math.floor(olderFile.length * remainingPercent);
                        const partial = partialCount > 0 ? olderFile.slice(olderFile.length - partialCount) : [];
                        bufferParts.unshift(partial);
                        remainingPercent = 0;
                    }
                    fileIdx++;
                }
                return bufferParts.flat();
            }

            // ==================== بافر خودکار ابتدای فایل (بدون پارامتر جدید در استراتژی) ====================
            // اگر enableSmartContinuation فعال باشد و داده‌ی فایل(های) قبلی (options.previousFullDataList
            // یا به‌صورت legacy، options.previousFullData) در دسترس باشد، بافری متناسب با تایم‌فریم جاری
            // (calculateBufferPercentage) به‌صورت خودکار به ابتدای marketData الحاق می‌شود تا
            // اندیکاتورهای دوره‌بلند (SMA200، ایچیموکو با سنکو ۵۲ و غیره) در ابتدای فایل جدید ناقص
            // محاسبه نشوند. بافر فقط از داده‌های گذشته ساخته می‌شود (بدون آینده‌نگری). معامله‌ی جدید
            // فقط از entryStartIndex به بعد مجاز است؛ کندل‌های بافر صرفاً برای آپدیت اندیکاتورها استفاده می‌شوند.
            let entryStartIndex = 0;
            if (settings.enableSmartContinuation) {
                const prevList = normalizePrevDataList(options.previousFullDataList || options.previousFullData);
                if (prevList.length > 0) {
                    const combined = buildCombinedData(prevList, marketData, settings.timeframeLabel);
                    marketData = combined.combinedData;
                    entryStartIndex = combined.startIndex;
                    if (entryStartIndex > 0) {
                        const pct = (combined.targetPercentage * 100).toFixed(0);
                        console.log(`🧩 بافر خودکار ابتدای فایل: ${entryStartIndex} کندل (معادل ${pct}% بر اساس تایم‌فریم ${settings.timeframeLabel || 'نامشخص'}) الحاق شد؛ معاملات جدید فقط از کندل ${entryStartIndex} به بعد مجازند`);
                    }
                }
            }

            // ==================== مراحل حد ضرر پلکانی (اصلاح شده برای SELL) ====================
            const stopLossStages = [
                { movePercent: 0.75, stopLossPercent: 0.10 },
                { movePercent: 1.5, stopLossPercent: 0.75 },
                { movePercent: 2.5, stopLossPercent: 1.5 },
                { movePercent: 3.5, stopLossPercent: 2.75 },
                { movePercent: 4.5, stopLossPercent: 3.75 },
            ];

            // ==================== تابع حد ضرر پلکانی (اصلاح شده برای SELL) ====================
            function stagedStopLoss(currentPrice, entryPrice, initialStopLoss, stages, positionType) {
                if (!stages || stages.length === 0) {
                    return initialStopLoss;
                }

                // محاسبه درصد سود/ضرر — اصلاح شده برای SELL
                // قبلاً همیشه فرمول BUY استفاده می‌شد که برای SELL همیشه منفی برمی‌گشت
                // و باعث می‌شد stage هیچ‌وقت برای پوزیشن‌های فروش فعال نشود
                const profitPercent = positionType === 'SELL'
                    ? ((entryPrice - currentPrice) / entryPrice) * 100
                    : ((currentPrice - entryPrice) / entryPrice) * 100;

                // اگر در ضرر هستیم یا به حداقل سود نرسیده‌ایم
                if (profitPercent < stages[0].movePercent) {
                    return initialStopLoss;
                }

                // پیدا کردن مناسب‌ترین مرحله (از آخر به اول)
                let selectedStage = stages[0];
                for (let i = stages.length - 1; i >= 0; i--) {
                    if (profitPercent >= stages[i].movePercent) {
                        selectedStage = stages[i];
                        break;
                    }
                }

                // محاسبه حد ضرر جدید
                let newStopLoss;
                if (positionType === 'BUY') {
                    newStopLoss = entryPrice * (1 + selectedStage.stopLossPercent / 100);
                    // حد ضرر جدید نباید از قیمت فعلی بالاتر باشد
                    newStopLoss = Math.min(newStopLoss, currentPrice * 0.999);
                    // حد ضرر جدید نباید بدتر از حد اولیه باشد
                    newStopLoss = Math.max(newStopLoss, initialStopLoss);
                } else if (positionType === 'SELL') {
                    newStopLoss = entryPrice * (1 - selectedStage.stopLossPercent / 100);
                    newStopLoss = Math.max(newStopLoss, currentPrice * 1.001);
                    newStopLoss = Math.min(newStopLoss, initialStopLoss);
                }

                return newStopLoss;
            }

            // ==================== تابع Gap Handling ====================
            // تصمیم مستندشده (بخش ۶ پرامپت مهاجرت): گپ واقعی (خصوصاً گپ آخر هفته در
            // فارکس/طلا) ممکن است در وسط بازه‌ی یک کندل بزرگ رخ داده باشد، نه دقیقاً در
            // ابتدای آن. با داده‌ی پایه (۱ دقیقه‌ای) می‌توان اولین کندل ریزِ داخل همین کندل
            // بزرگ را پیدا کرد که واقعاً از سطح SL/TP گپ زده، و open همان کندل ریز را
            // به‌عنوان قیمت گپ واقعی‌تر استفاده کرد — این دقیقاً هم‌خانواده‌ی همان کاری‌ست که
            // detectFirstHitFrom5m برای برخورد TP/SL انجام می‌دهد. این منطق فقط وقتی
            // enableIntrabarPrecision فعال باشد و داده‌ی پایه برای همین کندل موجود باشد اجرا
            // می‌شود؛ در غیر این صورت به رفتار قبلی (سطح open کندل بزرگ) برمی‌گردد، پس این
            // تغییر کاملاً عقب‌سازگار (backward compatible) است.
            function handleGapExit(position, candle, exitType) {
                if (enableIntrabarPrecision && baseMinuteData) {
                    const baseCandles = getBaseMinuteCandlesForCandle(candle);
                    if (baseCandles.length > 0) {
                        const firstBase = baseCandles[0];
                        if (position.type === 'BUY') {
                            if (exitType === 'stopLoss' && firstBase.open <= position.stopLoss) {
                                return { shouldExit: true, exitPrice: firstBase.open, exitReason: 'Stop Loss (Gap)' };
                            }
                            if (exitType === 'takeProfit' && firstBase.open >= position.takeProfit) {
                                return { shouldExit: true, exitPrice: firstBase.open, exitReason: 'Take Profit (Gap)' };
                            }
                        } else if (position.type === 'SELL') {
                            if (exitType === 'stopLoss' && firstBase.open >= position.stopLoss) {
                                return { shouldExit: true, exitPrice: firstBase.open, exitReason: 'Stop Loss (Gap)' };
                            }
                            if (exitType === 'takeProfit' && firstBase.open <= position.takeProfit) {
                                return { shouldExit: true, exitPrice: firstBase.open, exitReason: 'Take Profit (Gap)' };
                            }
                        }
                    }
                }

                // fallback: رفتار قبلی — دقت در سطح open کندل بزرگ (وقتی داده‌ی پایه یا
                // enableIntrabarPrecision موجود نیست)
                let shouldExit = false;
                let exitPrice = 0;
                let exitReason = '';

                if (position.type === 'BUY') {
                    if (exitType === 'stopLoss' && candle.open <= position.stopLoss) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Stop Loss (Gap)';
                    } else if (exitType === 'takeProfit' && candle.open >= position.takeProfit) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Take Profit (Gap)';
                    }
                } else if (position.type === 'SELL') {
                    if (exitType === 'stopLoss' && candle.open >= position.stopLoss) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Stop Loss (Gap)';
                    } else if (exitType === 'takeProfit' && candle.open <= position.takeProfit) {
                        shouldExit = true;
                        exitPrice = candle.open;
                        exitReason = 'Take Profit (Gap)';
                    }
                }

                return { shouldExit, exitPrice, exitReason };
            }

            // ==================== تابع پیدا کردن فایل بعدی (بر اساس تاریخ) ====================
            function findNextFileByDate(referenceData, usedFileNames = new Set()) {
                // اصلاح باگ: قبلاً این تابع همیشه از marketData اصلی (closure) می‌خواند
                // و آپدیت شدن currentData در حلقه‌ی ادامه‌دهی را نمی‌دید.
                // الان referenceData (یعنی آخرین داده‌ی فایل جاری در ادامه‌دهی) پاس داده می‌شود.
                const dataToCheck = referenceData && referenceData.length > 0 ? referenceData : marketData;
                if (!dataToCheck || dataToCheck.length === 0) {
                    return null;
                }

                // تشخیص نوع نماد (کریپتو یا طلا/فارکس)
                // symbolType می‌تواند مستقیم در options تنظیم شود یا از نام فایل/نماد استخراج شود
                function detectSymbolType() {
                    if (options.symbolType) return options.symbolType;
                    const nameToCheck = (options.fileName || options.symbol || settings.fileName || '').toUpperCase();
                    if (nameToCheck.includes('XAU') || nameToCheck.includes('PAXG') || nameToCheck.includes('XAUUSD')) {
                        return 'forex';
                    }
                    return 'crypto';
                }

                const symbolType = detectSymbolType();

                // بررسی اینکه روز کاری است (دوشنبه تا جمعه)
                function isWeekday(date) {
                    const day = date.getUTCDay(); // 0=یکشنبه، 6=شنبه
                    return day >= 1 && day <= 5;
                }

                // پیدا کردن اولین روز کاری بعد از یک تاریخ
                function nextWeekday(date) {
                    const next = new Date(date);
                    next.setUTCDate(next.getUTCDate() + 1);
                    while (!isWeekday(next)) {
                        next.setUTCDate(next.getUTCDate() + 1);
                    }
                    return next;
                }

                // پیدا کردن آخرین تاریخ فایل جاری
                const lastCandle = dataToCheck[dataToCheck.length - 1];
                const lastTimestamp = lastCandle.timestamp;
                const lastDate = new Date(lastTimestamp);

                // بررسی همه فایل‌ها
                const allFiles = { ...settings.uploadedFiles, ...settings.combinedFiles };
                let nextFile = null;
                let smallestGap = Infinity;

                Object.entries(allFiles).forEach(([key, fileInfo]) => {
                    if (!fileInfo.data || fileInfo.data.length === 0) return;
                    // جلوگیری از انتخاب دوبارهٔ فایلی که قبلاً برای ادامه‌دهی استفاده شده
                    const fileIdentifier = fileInfo.fileName || key;
                    if (usedFileNames.has(fileIdentifier)) return;

                    const firstCandle = fileInfo.data[0];
                    const firstDate = new Date(firstCandle.timestamp);

                    // فاصله زمانی (به میلی‌ثانیه)
                    const timeGap = firstDate - lastDate;
                    if (timeGap <= 0) return; // فقط فایل‌های بعدی

                    let isValidNext = false;

                    if (symbolType === 'forex') {
                        // برای طلا: فایل بعدی باید در اولین روز کاری بعد از آخرین کندل شروع شود
                        // حداکثر فاصله: ۴ روز (پوشش آخر هفته)
                        const maxGap = 4 * 24 * 60 * 60 * 1000;
                        if (timeGap <= maxGap) {
                            const expectedNextDay = nextWeekday(lastDate);
                            // روز شروع فایل بعدی باید همان روز کاری بعدی باشد (با تلرانس یک روز)
                            const expectedStart = expectedNextDay.getTime();
                            const firstDateStart = new Date(firstDate);
                            firstDateStart.setUTCHours(0, 0, 0, 0);
                            const expectedStart0 = new Date(expectedNextDay);
                            expectedStart0.setUTCHours(0, 0, 0, 0);
                            const dayDiff = Math.abs(firstDateStart.getTime() - expectedStart0.getTime());
                            if (dayDiff < 24 * 60 * 60 * 1000) {
                                isValidNext = true;
                            }
                        }
                    } else {
                        // برای کریپتو: فایل بعدی باید دقیقاً بلافاصله بعد از آخرین کندل شروع شود
                        // (ادامه مستقیم کندل‌ها بدون شکاف)
                        // تایم‌فریم کندل را از دو کندل اول تخمین می‌زنیم
                        // توجه: این fallback فقط وقتی dataToCheck کمتر از ۲ کندل دارد استفاده
                        // می‌شود (عملاً تقریباً هیچ‌وقت). با مهاجرت منبع به ۱ دقیقه، برای وضوح
                        // پیش‌فرض هم به ۱ دقیقه تغییر کرد؛ در عمل چون این مسیر تقریباً هیچ‌وقت
                        // اجرا نمی‌شود، رفتار قابل مشاهده‌ای تغییر نمی‌کند.
                        let candleIntervalMs = 1 * 60 * 1000; // پیش‌فرض: ۱ دقیقه
                        if (dataToCheck.length >= 2) {
                            const t1 = new Date(dataToCheck[dataToCheck.length - 2].timestamp).getTime();
                            const t2 = new Date(dataToCheck[dataToCheck.length - 1].timestamp).getTime();
                            if (t2 > t1) candleIntervalMs = t2 - t1;
                        }
                        // شکاف مجاز: دقیقاً یک بازه کندل (با تلرانس ۱۰٪)
                        const tolerance = candleIntervalMs * 0.1;
                        if (Math.abs(timeGap - candleIntervalMs) <= tolerance) {
                            isValidNext = true;
                        }
                    }

                    if (isValidNext && timeGap < smallestGap) {
                        smallestGap = timeGap;
                        nextFile = fileInfo;
                    }
                });

                if (!nextFile) {
                    return null;
                }

                // اندازه‌ی بافر خودکار (بر اساس تایم‌فریم جاری) — فقط جهت اطلاع؛ محاسبه‌ی
                // نهایی و استخراج واقعی بافر (که می‌تواند از چند فایل قبلی تشکیل شود) در
                // buildCombinedData انجام می‌شود.
                const calculatedBufferSize = Math.floor(dataToCheck.length * calculateBufferPercentage(settings.timeframeLabel));

                return {
                    ...nextFile,
                    data: nextFile.data,
                    bufferSize: calculatedBufferSize
                };
            }

            // ==================== تابع ساخت داده‌ی ترکیبی (بافر پویا بر اساس تایم‌فریم + فایل بعدی) ====================
            // بدون نیاز به هیچ پارامتر جدیدی در استراتژی: بر اساس timeframeLabel، درصد بافر لازم
            // (calculateBufferPercentage) محاسبه شده و از یک یا چند فایل قبلی (prevDataList، از
            // جدیدترین به قدیمی‌ترین) به عنوان بافر تاریخی به ابتدای nextData الحاق می‌شود تا
            // اندیکاتورها (میانگین‌های متحرک بلندمدت، ایچیموکو با سنکو ۵۲ و غیره) در ابتدای فایل
            // جدید دچار نقص نشوند. بافر فقط از داده‌های گذشته ساخته می‌شود، پس هیچ آینده‌نگری‌ای
            // رخ نمی‌دهد.
            function buildCombinedData(prevDataList, nextData, timeframeLabel) {
                if (!nextData || nextData.length === 0) {
                    return { combinedData: nextData || [], startIndex: 0, bufferSize: 0, targetPercentage: 0 };
                }

                const normalizedPrevList = normalizePrevDataList(prevDataList);
                if (normalizedPrevList.length === 0) {
                    return { combinedData: nextData, startIndex: 0, bufferSize: 0, targetPercentage: 0 };
                }

                const targetPercentage = calculateBufferPercentage(timeframeLabel);
                const bufferData = calculateBufferSize(normalizedPrevList, targetPercentage);

                return {
                    combinedData: [...bufferData, ...nextData],
                    // نقطه‌ی شروع معاملات جدید: کندل‌های قبل از این ایندکس فقط بافرند و
                    // نباید در آن‌ها معامله‌ی جدیدی باز شود.
                    startIndex: bufferData.length,
                    bufferSize: bufferData.length,
                    targetPercentage
                };
            }

            // ==================== تابع ادامه معاملات باز (با پشتیبانی از SELL) ====================
            // nextFileData ممکن است داده‌ی خام فایل بعدی باشد یا (وقتی enableSmartContinuation فعال
            // است) داده‌ی ترکیبی [بافر ۲۵٪ + فایل بعدی]. startIndex نقطه‌ای است که کندل‌های واقعیِ
            // فایل بعدی از آنجا شروع می‌شوند؛ کندل‌های قبل از آن فقط بافر تاریخی‌اند. از آنجا که این
            // تابع صرفاً معاملاتِ از قبل باز را می‌بندد (و معامله‌ی جدیدی باز نمی‌کند)، بازبینی کندل‌های
            // بافر بی‌خطر است: آن کندل‌ها همان انتهای فایل قبلی هستند که قبلاً در حلقه‌ی اصلی همان فایل
            // بررسی شده‌اند و چون پوزیشن هنوز باز مانده، در آن‌ها خروجی رخ نداده است.
            function continueOpenTradesWithNextFile(openPositions, nextFileData, commission, startIndex = 0) {
                if (!openPositions || openPositions.length === 0) {
                    return { trades: [], remainingPositions: [] };
                }

                if (!nextFileData || nextFileData.length === 0) {
                    return { trades: [], remainingPositions: openPositions };
                }

                const closedTrades = [];
                const remainingPositions = [...openPositions];

                // پردازش هر کندل از داده (خام یا ترکیبی)
                for (let i = 0; i < nextFileData.length; i++) {
                    const candle = nextFileData[i];

                    for (let j = remainingPositions.length - 1; j >= 0; j--) {
                        const position = remainingPositions[j];
                        let shouldExit = false;
                        let exitPrice = 0;
                        let exitReason = '';

                        // 1. بررسی Gap در Open
                        if (settings.handleGaps) {
                            const gapCheck = handleGapExit(position, candle, 'stopLoss');
                            if (gapCheck.shouldExit) {
                                shouldExit = true;
                                exitPrice = gapCheck.exitPrice;
                                exitReason = gapCheck.exitReason;
                            }
                        }

                        // 2. بررسی Stop Loss عادی (با اولویت صحیح)
                        if (!shouldExit) {
                            if (position.type === 'BUY' && candle.low <= position.stopLoss) {
                                shouldExit = true;
                                exitPrice = position.stopLoss;
                                exitReason = 'Stop Loss (Continued)';
                            } else if (position.type === 'SELL' && candle.high >= position.stopLoss) {
                                shouldExit = true;
                                exitPrice = position.stopLoss;
                                exitReason = 'Stop Loss (Continued)';
                            }
                        }

                        // 3. بررسی Take Profit
                        if (!shouldExit && position.takeProfit) {
                            if (position.type === 'BUY' && candle.high >= position.takeProfit) {
                                shouldExit = true;
                                exitPrice = position.takeProfit;
                                exitReason = 'Take Profit (Continued)';
                            } else if (position.type === 'SELL' && candle.low <= position.takeProfit) {
                                shouldExit = true;
                                exitPrice = position.takeProfit;
                                exitReason = 'Take Profit (Continued)';
                            }
                        }

                        // 4. به‌روزرسانی حد ضرر پلکانی (فقط اگر معامله نبسته شود)
                        if (!shouldExit && position.useStagedStopLoss) {
                            const newStopLoss = stagedStopLoss(
                                candle.close,
                                position.entryPrice,
                                position.initialStopLoss,
                                position.stopLossStages || stopLossStages,
                                position.type
                            );

                            if ((position.type === 'BUY' && newStopLoss > position.stopLoss) ||
                                (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                                position.stopLoss = newStopLoss;
                            }
                        }

                        // بستن معامله
                        if (shouldExit) {
                            const profit = position.type === 'BUY'
                                ? (exitPrice - position.entryPrice) * position.size
                                : (position.entryPrice - exitPrice) * position.size;

                            const commissionAmount = position.size * exitPrice * (commission / 100);

                            const grossProfitPercent = position.type === 'BUY'
                                ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                                : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

                            const commissionPercent = (commissionAmount / (position.entryPrice * position.size)) * 100;
                            const netProfitPercent = grossProfitPercent - commissionPercent;

                            const tradeData = {
                                type: position.type,
                                entryPrice: position.entryPrice,
                                exitPrice: exitPrice,
                                entryTime: position.entryTime,
                                exitTime: candle.timestamp,
                                profit: profit - commissionAmount,
                                grossProfit: profit,
                                profitPercent: netProfitPercent,
                                grossProfitPercent: grossProfitPercent,
                                commissionPercent: commissionPercent,
                                size: position.size,
                                exitReason: exitReason,
                                stopLoss: position.stopLoss,
                                takeProfit: position.takeProfit,
                                source: 'continued',
                                originalFile: settings.fileName,
                                continuedFile: 'next_file',
                                candleIndex: i - startIndex,
                                bufferCandle: i < startIndex,
                                riskType: 'Fixed',
                                riskAmount: position.riskAmount || 0,
                                riskPercent: position.riskPercent || 0,
                                entryCommission: commissionAmount,
                                exitCommission: 0
                            };

                            closedTrades.push(tradeData);
                            remainingPositions.splice(j, 1);
                        }
                    }

                    // اگر همه معاملات بسته شدند، ادامه نده
                    if (remainingPositions.length === 0) {
                        break;
                    }
                }

                return {
                    trades: closedTrades,
                    remainingPositions: remainingPositions
                };
            }

            // ==================== تابع محاسبه سود با کارمزد ورود و خروج ====================
            function calculateProfit(position, exitPrice, commissionPercent) {
                const entryPrice = position.entryPrice;
                const size = position.size;
                const grossProfit = position.type === 'BUY'
                    ? (exitPrice - entryPrice) * size
                    : (entryPrice - exitPrice) * size;
                const entryCommission = entryPrice * size * (commissionPercent / 100);
                const exitCommission = exitPrice * size * (commissionPercent / 100);
                const netProfit = grossProfit - entryCommission - exitCommission;
                return { grossProfit, netProfit, entryCommission, exitCommission };
            }

            // ==================== تابع تشخیص اولین برخورد حد سود/ضرر در یک کندل (اصلاح اولویت) ====================
            // برای تایم‌فریم‌های بالاتر از تایم‌فریم پایه، از کندل‌های ریزتر (پایه) درون آن
            // کندل استفاده می‌شود تا ترتیب دقیق برخورد به TP یا SL مشخص شود.
            // baseMinuteData باید از options.fiveMinData پاس داده شود (نام گزینه به دلایل
            // سازگاری تغییر نکرده، اما محتوایش دیگر لزوماً ۵ دقیقه‌ای نیست — قبلاً همیشه
            // ۵ دقیقه‌ای بود، الان با مهاجرت منبع داده معمولاً ۱ دقیقه‌ای است).
            const baseMinuteData = options.fiveMinData || null;

            // سوییچ روشن/خاموش دقت درون‌کندلی. با false، رفتار قدیمی (بدون لایه‌ی داده‌ی
            // پایه) بازتولید می‌شود — برای دیباگ رگرسیون و مقایسه‌ی قبل/بعد از مهاجرت.
            const enableIntrabarPrecision = options.enableIntrabarPrecision !== false;

            // محاسبه تایم‌فریم کندل‌ها (به میلی‌ثانیه)
            function detectCandleIntervalMs(data, fallbackMs) {
                const fb = fallbackMs || 5 * 60 * 1000;
                if (!data || data.length < 2) return fb;
                const t1 = new Date(data[0].timestamp).getTime();
                const t2 = new Date(data[1].timestamp).getTime();
                return t2 > t1 ? t2 - t1 : fb;
            }
            const mainCandleIntervalMs = detectCandleIntervalMs(marketData);
            // دوره‌ی گذار: به‌جای هاردکد کردن ۱ دقیقه به‌عنوان تایم‌فریم پایه، آن را از خودِ
            // baseMinuteData تشخیص می‌دهیم. اگر بخشی از آرشیو هنوز ۵ دقیقه‌ای باشد (فایل
            // قدیمی)، این منطق به‌جای فرض غلط «پایه = ۱ دقیقه»، همان ۵ دقیقه را به‌عنوان
            // مرجع دقت در نظر می‌گیرد.
            const baseIntervalMs = (baseMinuteData && baseMinuteData.length >= 2)
                ? detectCandleIntervalMs(baseMinuteData)
                : 5 * 60 * 1000;
            // اصلاح باگ مهاجرت ۵→۱ دقیقه: قبلاً این آستانه هاردکد روی ۵ دقیقه بود، پس این
            // لایه‌ی دقت فقط برای تایم‌فریم‌های >۵ دقیقه (یعنی 15m/30m/1h) فعال می‌شد و 5m
            // هیچ‌وقت از آن بهره نمی‌برد (چون قبلاً برای 5m چیز ریزتری برای مقایسه نبود).
            // الان که baseIntervalMs معمولاً ۱ دقیقه است، همین شرط به‌طور خودکار برای 5m هم
            // برقرار می‌شود (۵ دقیقه > ۱ دقیقه)، بدون نیاز به کد جداگانه.
            const isHigherTF = enableIntrabarPrecision && mainCandleIntervalMs > baseIntervalMs;

            // پیدا کردن کندل‌های پایه‌ای (baseMinuteData) که درون یک کندل اصلی قرار دارند
            function getBaseMinuteCandlesForCandle(candle) {
                if (!baseMinuteData || baseMinuteData.length === 0) return [];
                const candleStart = new Date(candle.timestamp).getTime();
                const candleEnd = candleStart + mainCandleIntervalMs;
                return baseMinuteData.filter(c => {
                    const t = new Date(c.timestamp).getTime();
                    return t >= candleStart && t < candleEnd;
                });
            }

            // پیدا کردن کندل‌های پایه‌ای از لحظه‌ی مشخصی (entryTimestampMs) تا انتهای همان کندل بزرگ.
            // برخلاف getBaseMinuteCandlesForCandle که کل بازه‌ی کندل بزرگ را برمی‌گرداند، این تابع
            // فقط بخشی از کندل که *بعد از* یک لحظه‌ی مشخص (مثلاً لحظه‌ی ورود پوزیشن) است را می‌دهد.
            // کاربرد: بررسی خروج یک پوزیشن تازه‌بازشده در همان کندلِ ورود (نگاه کنید به رفع باگ
            // «عدم بررسی خروج در کندل ورود» در مرحله‌ی باز کردن پوزیشن جدید).
            function getBaseMinuteCandlesFromEntryOnward(candle, entryTimestampMs) {
                if (!baseMinuteData || baseMinuteData.length === 0) return [];
                const candleStart = new Date(candle.timestamp).getTime();
                const candleEnd = candleStart + mainCandleIntervalMs;
                const effectiveStart = Math.max(candleStart, entryTimestampMs);
                return baseMinuteData.filter(c => {
                    const t = new Date(c.timestamp).getTime();
                    return t >= effectiveStart && t < candleEnd;
                });
            }

            // تشخیص اولین برخورد TP/SL از روی کندل‌های پایه‌ای
            function detectFirstHitFrom5m(baseCandles, position) {
                for (const c of baseCandles) {
                    if (position.type === 'BUY') {
                        const hitStop = c.low <= position.stopLoss;
                        const hitTake = position.takeProfit ? c.high >= position.takeProfit : false;
                        if (hitStop && hitTake) {
                            // هر دو در همین کندل ۵ دقیقه‌ای: از جهت کندل تصمیم بگیر
                            if (c.close >= c.open) {
                                return { exitPrice: position.takeProfit, exitReason: 'Take Profit (first)' };
                            } else {
                                return { exitPrice: position.stopLoss, exitReason: 'Stop Loss (first)' };
                            }
                        } else if (hitStop) {
                            return { exitPrice: position.stopLoss, exitReason: 'Stop Loss' };
                        } else if (hitTake) {
                            return { exitPrice: position.takeProfit, exitReason: 'Take Profit' };
                        }
                    } else if (position.type === 'SELL') {
                        const hitStop = c.high >= position.stopLoss;
                        const hitTake = position.takeProfit ? c.low <= position.takeProfit : false;
                        if (hitStop && hitTake) {
                            if (c.close <= c.open) {
                                return { exitPrice: position.takeProfit, exitReason: 'Take Profit (first)' };
                            } else {
                                return { exitPrice: position.stopLoss, exitReason: 'Stop Loss (first)' };
                            }
                        } else if (hitStop) {
                            return { exitPrice: position.stopLoss, exitReason: 'Stop Loss' };
                        } else if (hitTake) {
                            return { exitPrice: position.takeProfit, exitReason: 'Take Profit' };
                        }
                    }
                }
                return null;
            }

            function getExitPriceAndReason(candle, position) {
                let exitPrice = 0;
                let exitReason = '';

                // اگر تایم‌فریم اصلی بالاتر از تایم‌فریم پایه است و داده‌ی پایه موجود است،
                // از آن برای تشخیص دقیق ترتیب برخورد استفاده کن (الان شامل 5m هم می‌شود،
                // چون baseIntervalMs معمولاً ۱ دقیقه است، نه ۵).
                if (isHigherTF && baseMinuteData) {
                    const baseCandles = getBaseMinuteCandlesForCandle(candle);
                    if (baseCandles.length > 0) {
                        const hit = detectFirstHitFrom5m(baseCandles, position);
                        if (hit) {
                            return { exitPrice: hit.exitPrice, exitReason: hit.exitReason };
                        }
                    }
                }

                // fallback: رفتار اصلی برای تایم‌فریم پایه خودش یا زمانی که داده‌ی پایه نداریم
                if (position.type === 'BUY') {
                    const hitStop = candle.low <= position.stopLoss;
                    const hitTake = position.takeProfit ? candle.high >= position.takeProfit : false;

                    if (hitStop && hitTake) {
                        // هر دو برخورد شده: بر اساس جهت کندل تصمیم بگیریم
                        if (candle.close >= candle.open) {
                            exitPrice = position.takeProfit;
                            exitReason = 'Take Profit (first)';
                        } else {
                            exitPrice = position.stopLoss;
                            exitReason = 'Stop Loss (first)';
                        }
                    } else if (hitStop) {
                        exitPrice = position.stopLoss;
                        exitReason = 'Stop Loss';
                    } else if (hitTake) {
                        exitPrice = position.takeProfit;
                        exitReason = 'Take Profit';
                    }
                } else if (position.type === 'SELL') {
                    const hitStop = candle.high >= position.stopLoss;
                    const hitTake = position.takeProfit ? candle.low <= position.takeProfit : false;

                    if (hitStop && hitTake) {
                        if (candle.close <= candle.open) {
                            exitPrice = position.takeProfit;
                            exitReason = 'Take Profit (first)';
                        } else {
                            exitPrice = position.stopLoss;
                            exitReason = 'Stop Loss (first)';
                        }
                    } else if (hitStop) {
                        exitPrice = position.stopLoss;
                        exitReason = 'Stop Loss';
                    } else if (hitTake) {
                        exitPrice = position.takeProfit;
                        exitReason = 'Take Profit';
                    }
                }

                return { exitPrice, exitReason };
            }

            // ==================== تابع بررسی امکان ورود در منطقه شلوغ (اصلاح شده برای SELL) ====================
            function canOpenNewPosition(positions, newEntryPrice) {
                const tolerance = 0.005;
                const positionsInZone = positions.filter(pos => {
                    const diff = Math.abs(pos.entryPrice - newEntryPrice) / pos.entryPrice;
                    return diff <= tolerance;
                });

                if (positionsInZone.length === 0) {
                    return true;
                }

                const allInProfit = positionsInZone.every(pos => {
                    if (pos.type === 'BUY') return pos.stopLoss > pos.entryPrice;
                    else if (pos.type === 'SELL') return pos.stopLoss < pos.entryPrice;
                    return false;
                });
                return allInProfit;
            }

            // ==================== سیستم تشخیص اولین شکست خطوط روند ====================
            const trendLineBreaks = {};
            const processedTrendLines = [];

            // تابع محاسبه مقدار خط روند
            function calculateTrendLineValue(line, candleIndex) {
                if (!line || typeof line.slope === 'undefined' || typeof line.intercept === 'undefined') {
                    if (line.startIndex !== undefined && line.endIndex !== undefined &&
                        line.startPrice !== undefined && line.endPrice !== undefined) {
                        line.slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
                        line.intercept = line.startPrice - line.slope * line.startIndex;
                        return line.slope * candleIndex + line.intercept;
                    }
                    return null;
                }
                return line.slope * candleIndex + line.intercept;
            }

            // تابع تشخیص اولین شکست خط روند
            function detectTrendLineFirstBreak(line, candleIndex, candle) {
                if (trendLineBreaks[line.id]) return null;
                if (candleIndex < line.startIndex) return null;

                const lineValue = calculateTrendLineValue(line, candleIndex);
                if (lineValue === null) return null;

                let isBreak = false;
                let breakInfo = null;

                if (line.type.includes('Up') || line.type.includes('manualUp')) {
                    const tolerance = lineValue * 0.001;
                    if (candle.low < lineValue - tolerance) {
                        isBreak = true;
                        breakInfo = {
                            lineId: line.id,
                            breakIndex: candleIndex,
                            breakPrice: candle.low,
                            breakTime: candle.timestamp,
                            direction: 'down',
                            lineValueAtBreak: lineValue,
                            lineType: line.type,
                            isFirstBreak: true,
                            candleData: {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }
                        };
                    }
                } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
                    const tolerance = lineValue * 0.001;
                    if (candle.high > lineValue + tolerance) {
                        isBreak = true;
                        breakInfo = {
                            lineId: line.id,
                            breakIndex: candleIndex,
                            breakPrice: candle.high,
                            breakTime: candle.timestamp,
                            direction: 'up',
                            lineValueAtBreak: lineValue,
                            lineType: line.type,
                            isFirstBreak: true,
                            candleData: {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }
                        };
                    }
                }

                if (isBreak) {
                    trendLineBreaks[line.id] = breakInfo;
                    return breakInfo;
                }

                return null;
            }

            // ==================== دقیق‌سازی نقطه‌ی ورود با داده‌ی پایه (بخش ۵ پرامپت مهاجرت) ====================
            // مشکل: در حالت openBreak، قیمت ورود معمولاً = open همان کندل بزرگ فرض می‌شود
            // (نگاه کنید به breakPrice در detectOpenBreak). اگر خط روند/سطح breakTolerance
            // *وسط* کندل بزرگ شکسته شده باشد، این فرض می‌تواند از واقعیت دور باشد.
            //
            // راه‌حل: با داده‌ی پایه (baseMinuteData)، اولین کندل ریز داخل همین کندل بزرگ که
            // واقعاً شرط breakTolerance را با open خودش برآورده می‌کند را پیدا کن و open همان
            // کندل ریز را به‌عنوان قیمت ورود دقیق‌تر برگردان. این دقیقاً هم‌خانواده‌ی همان
            // کاری‌ست که detectFirstHitFrom5m برای خروج انجام می‌دهد، این‌بار برای ورود.
            //
            // ⚠️ بدون آینده‌نگری: getBaseMinuteCandlesForCandle بازه را به دقیقاً همان کندل
            // بزرگ (candle) محدود می‌کند — [start, start+mainCandleIntervalMs) — پس هیچ کندل
            // پایه‌ای از کندل‌های بزرگ بعدی دیده نمی‌شود.
            //
            // ⚠️ محدودیت شناخته‌شده: این تابع فقط برای entryType==='openBreak' معنا دارد،
            // چون در openBreak سیگنال و ورود روی *همان* کندل i اتفاق می‌افتد. در nextCandle،
            // شکست با High/Low کندل i تشخیص داده می‌شود ولی ورود روی کندل i+1 است، پس کندل
            // «سیگنال‌دهنده» و کندل «ورود» یکی نیستند و این تابع اینجا کاربرد ندارد.
            //
            // نکته‌ی مهم برای استفاده: این تابع به strategyFn به‌عنوان آرگومان ششم پاس داده
            // می‌شود (refineEntryPrice). چون backtest-core.js نمی‌داند کدام خط/breakInfo باعث
            // صدور سیگنال شده (این تصمیم داخل کد استراتژی گرفته می‌شود)، خودِ استراتژی باید
            // این تابع را با direction و lineValue مربوط به همان breakInfو که استفاده کرده صدا
            // بزند تا signal.price را دقیق‌تر کند. اگر کد استراتژی این تابع را صدا نزند، رفتار
            // قبلی (signal.price = open کندل بزرگ) بدون تغییر باقی می‌ماند.
            function refineEntryPriceFromBaseMinute(candle, direction, lineValue, fallbackPrice) {
                if (!enableIntrabarPrecision || !baseMinuteData || !openBreakEntry) return fallbackPrice;
                const baseCandles = getBaseMinuteCandlesForCandle(candle);
                if (baseCandles.length === 0) return fallbackPrice;

                for (const bc of baseCandles) {
                    if (direction === 'down' && bc.open < lineValue * (1 - breakTolerance)) {
                        return bc.open;
                    }
                    if (direction === 'up' && bc.open > lineValue * (1 + breakTolerance)) {
                        return bc.open;
                    }
                }
                // هیچ کندل پایه‌ای شرط را با open خودش برآورده نکرد؛ به قیمت پیش‌فرض برگرد
                return fallbackPrice;
            }

            // تابع تشخیص شکست بر اساس Open کندل جاری (حالت openBreak — بدون آینده‌نگری)
            // فقط از قیمت Open کندل جاری استفاده می‌شود؛ هرگز از High/Low/Close همان کندل.
            function detectOpenBreak(line, candleIndex, candle) {
                if (trendLineBreaks[line.id]) return null;
                if (candleIndex < line.startIndex) return null;

                const lineValue = calculateTrendLineValue(line, candleIndex);
                if (lineValue === null) return null;

                let isBreak = false;
                let breakInfo = null;
                const open = candle.open;

                if (line.type.includes('Up') || line.type.includes('manualUp')) {
                    if (open < lineValue * (1 - breakTolerance)) {
                        isBreak = true;
                        breakInfo = {
                            lineId: line.id,
                            breakIndex: candleIndex,
                            breakPrice: open,
                            breakTime: candle.timestamp,
                            direction: 'down',
                            lineValueAtBreak: lineValue,
                            lineType: line.type,
                            isFirstBreak: true,
                            candleData: {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }
                        };
                    }
                } else if (line.type.includes('Down') || line.type.includes('manualDown')) {
                    if (open > lineValue * (1 + breakTolerance)) {
                        isBreak = true;
                        breakInfo = {
                            lineId: line.id,
                            breakIndex: candleIndex,
                            breakPrice: open,
                            breakTime: candle.timestamp,
                            direction: 'up',
                            lineValueAtBreak: lineValue,
                            lineType: line.type,
                            isFirstBreak: true,
                            candleData: {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }
                        };
                    }
                }

                if (isBreak) {
                    trendLineBreaks[line.id] = breakInfo;
                    return breakInfo;
                }

                return null;
            }

            // ==================== آماده‌سازی خطوط روند ====================
            function prepareTrendLines(trendLinesData) {
                if (!trendLinesData || typeof trendLinesData !== 'object') {
                    return;
                }

                Object.entries(trendLinesData).forEach(([type, lines]) => {
                    if (Array.isArray(lines)) {
                        lines.forEach((line, index) => {
                            if (line) {
                                if (!line.id) {
                                    line.id = `${type}_${line.startIndex}_${line.endIndex}_${index}`;
                                }

                                if (!line.type) {
                                    line.type = type;
                                }

                                if (typeof line.slope === 'undefined' || typeof line.intercept === 'undefined') {
                                    if (line.startIndex !== undefined && line.endIndex !== undefined &&
                                        line.startPrice !== undefined && line.endPrice !== undefined) {
                                        line.slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
                                        line.intercept = line.startPrice - line.slope * line.startIndex;
                                    }
                                }

                                processedTrendLines.push(line);
                            }
                        });
                    }
                });
            }

            // ==================== نگاشت نقاط شکست برای ارسال به استراتژی ====================
            const breakPointsMap = {};

            // ==================== تابع محاسبه روز با منطقه زمانی مشخص ====================
            function getDateString(timestamp, offsetMinutes) {
                const date = new Date(timestamp);
                const utc = date.getTime() + date.getTimezoneOffset() * 60000;
                const local = new Date(utc + offsetMinutes * 60000);
                return local.toDateString();
            }

            // ==================== پارامترهای اولیه ====================
            const initialCapital = options.initialCapital || 10000;
            const riskPerTrade = options.riskPerTrade || 2;
            const commission = options.commission || 0.05;

            let capital = initialCapital;
            let equity = initialCapital;
            let positions = [];
            const trades = [];
            const equityData = [];
            let tradeCounter = 0;

            // ==================== آمار دیباگ (برای پیدا کردن علت صفر بودن معاملات) ====================
            const debugStats = {
                totalCandles: 0,
                ichimokuNullCount: 0,
                trendLineBreaksDetected: 0,
                breaksByDirection: { up: 0, down: 0 },
                strategyCalls: 0,
                strategyErrors: 0,
                strategyErrorSamples: [],
                nullOrNoSignalCount: 0,
                signalReturnedCount: 0,
                invalidSignalCount: 0,
                invalidSignalSamples: [],
                blockedByZoneCount: 0,
                blockedByCapitalCount: 0,
                blockedByCapitalSamples: [],
                positionsOpenedCount: 0,
                sameCandleExitCount: 0, // چند پوزیشن همان کندل ورود بسته شدند (رفع باگ چک‌نشدن خروج در کندل ورود)
                firstSignalCandleIndex: null,
                firstPositionCandleIndex: null,
                maxTrendLinesSeen: 0,
                candlesWithZeroTrendLines: 0
            };

            // ==================== آمار بافر خودکار ادامه‌دهی (enableSmartContinuation) ====================
            const smartContinuationStats = {
                usedCount: 0,             // چند بار بافر واقعاً ساخته و استفاده شد
                lastBufferSize: 0,        // اندازه‌ی آخرین بافر ساخته‌شده (تعداد کندل)
                totalBufferCandles: 0,    // مجموع کندل‌های بافر در طول کل پردازش این فایل
                lastTargetPercentage: 0   // آخرین درصد هدف بافر (بر اساس تایم‌فریم)
            };

            console.log("🚀 ===== شروع بکتست (نسخه کامل با اصلاح آینده‌نگری) =====");
            console.log(`📊 سرمایه اولیه: ${initialCapital}, ریسک: ${riskPerTrade}%, کارمزد: ${commission}%`);
            console.log(`📈 تعداد کندل‌ها: ${marketData.length}`);
            console.log(`🔧 ichimoku.enabled=${options.ichimoku?.enabled !== false}`);

            // ==================== آماده‌سازی خطوط روند (بدون آینده‌نگری) ====================
            // اصلاح باگ آینده‌نگری: قبلاً خطوط روند یک‌بار با کل marketData محاسبه می‌شدند
            // (options.trendLines از detectTrendLinesAdvanced روی کل بازه) و همین لیست ثابت
            // در تمام کندل‌های حلقه در دسترس استراتژی بود. یعنی در کندل ۸۶ می‌شد خطی را دید
            // که pivot/touch pointِ تاییدکننده‌اش مربوط به کندل ۲۵۰۰ بود.
            // الان اگر options.trendLineSettings داده شده باشد، خطوط روند به‌صورت افزایشی
            // (incremental) و فقط با داده‌ی تا همان کندل، داخل خودِ حلقه محاسبه می‌شوند.
            const trendLineSettings = options.trendLineSettings || null;
            let trendLineIncState = null;

            // ==================== BATCH + فرمول (اختیاری، پشت فلگ) ====================
            // USE_BATCH_TRENDLINES=true → به‌جای محاسبه‌ی افزایشیِ کندل‌به‌کندل، خطوط روند
            //   یک‌بار batch محاسبه می‌شوند و در حلقه فقط فیلتر می‌شوند (سریع).
            // VERIFY_BATCH_EQUIVALENCE=true → هر دو روش (batch+فرمول و incremental واقعی)
            //   موازی اجرا و در هر کندل مقایسه می‌شوند؛ در اولین عدم تطابق بلافاصله خطا
            //   می‌دهد. این حالت کند است (چون هر دو روش اجرا می‌شوند) و فقط برای
            //   اعتبارسنجی یک‌باره است، نه استفاده‌ی همیشگی.
            // تا وقتی VERIFY_BATCH_EQUIVALENCE روی حداقل چند فایل واقعی با ✅ کامل
            // (بدون هیچ عدم تطابقی) تایید نشده، USE_BATCH_TRENDLINES را روشن نکنید —
            // منبع حقیقتِ پیش‌فرض همچنان همان incremental واقعی است.
            const USE_BATCH_TRENDLINES = process.env.USE_BATCH_TRENDLINES === 'true';
            const VERIFY_BATCH_EQUIVALENCE = process.env.VERIFY_BATCH_EQUIVALENCE === 'true';

            let batchTrendLines = null;
            let batchCursor = null;
            let verifyComparisonsCount = 0;

            if (trendLineSettings && (USE_BATCH_TRENDLINES || VERIFY_BATCH_EQUIVALENCE)) {
                console.log('⚙️  [BATCH] پیش‌محاسبه‌ی خطوط روند به‌صورت batch روی کل دیتاست...');
                const batchPrecomputeStart = Date.now();
                batchTrendLines = precomputeTrendLinesBatch(marketData, trendLineSettings);
                batchCursor = { pos: 0, activeLines: [] };
                console.log(`⚙️  [BATCH] ${batchTrendLines.length} خط در ${Date.now() - batchPrecomputeStart}ms پیش‌محاسبه شد.`);
                if (USE_BATCH_TRENDLINES && !VERIFY_BATCH_EQUIVALENCE) {
                    console.warn('⚠️  [BATCH] USE_BATCH_TRENDLINES فعال است بدون VERIFY_BATCH_EQUIVALENCE. مطمئن شوید قبلاً روی داده‌ی واقعی این مسیر را با ✅ کامل تایید کرده‌اید.');
                }
            }

            console.log(`🔧 trendLineSettings=${trendLineSettings ? JSON.stringify(trendLineSettings) : 'ندارد'} | options.trendLines=${options.trendLines ? 'دارد (pre-computed)' : 'ندارد'}`);
            if (!trendLineSettings && !options.trendLines) {
                console.warn('⚠️ [CONFIG] نه trendLineSettings و نه options.trendLines تنظیم شده — processedTrendLines همیشه خالی می‌ماند و هیچ شکست خطی (trendLineBreak) هرگز تشخیص داده نخواهد شد. اگر استراتژی شما به breakPoints/trendLines وابسته است، همین یک دلیل کافی برای صفر بودن معاملات است.');
            }

            if (!trendLineSettings && options.trendLines) {
                // حالت سازگاری با نسخه‌ی قدیمی: اگر تنظیمات pivot داده نشده ولی خطوط
                // از پیش‌محاسبه‌شده داده شده، از همان استفاده می‌کنیم — اما این حالت
                // همچنان مستعد آینده‌نگری است چون خطوط از قبل و با کل داده ساخته شده‌اند.
                console.log('⚠️ [TREND_LINES] از خطوط روند پیش‌محاسبه‌شده استفاده می‌شود (احتمال آینده‌نگری). برای رفع کامل، options.trendLineSettings را ارسال کنید.');
                prepareTrendLines(options.trendLines || {});
            }

            // ==================== ساخت تابع استراتژی یک بار خارج از حلقه (بهبود کارایی) ====================
            const strategyFn = new Function('data', 'index', 'breakPointsParam', 'ichimokuParam', 'trendLinesParam', 'refineEntryPriceParam', 'divergenceSignalsParam', `
                function calculateSMA(data, endIndex, period) {
                    let sum = 0;
                    for (let i = 0; i < period; i++) {
                        if (endIndex - i < 0) return null;
                        sum += data[endIndex - i].close;
                    }
                    return sum / period;
                }

                function getTrendLines() {
                    return trendLinesParam || [];
                }

                // اصلاح باگ: پیش از این تعریف نشده بود؛ صدا زدنش از داخل کد استراتژی
                // (customStrategy) باعث ReferenceError می‌شد که در try/catch اطراف
                // strategyFn بی‌صدا قورت داده می‌شد و همیشه صفر ترید نتیجه می‌داد.
                function getDivergenceSignals() {
                    return divergenceSignalsParam || [];
                }

                function getBreakPointsAtCandle(candleIndex) {
                    return breakPointsParam[candleIndex] || [];
                }

                function calculateTrendLineValue(line, candleIndex) {
                    if (!line || typeof line.slope === 'undefined' || typeof line.intercept === 'undefined') {
                        if (line.startIndex !== undefined && line.endIndex !== undefined && 
                            line.startPrice !== undefined && line.endPrice !== undefined) {
                            line.slope = (line.endPrice - line.startPrice) / (line.endIndex - line.startIndex);
                            line.intercept = line.startPrice - line.slope * line.startIndex;
                            return line.slope * candleIndex + line.intercept;
                        }
                        return null;
                    }
                    return line.slope * candleIndex + line.intercept;
                }

                function isTrendLineBroken(line, candleIndex) {
                    const breakPoints = getBreakPointsAtCandle(candleIndex);
                    return breakPoints.some(bp => bp.lineId === line.id);
                }

                function getCurrentBreakLines(candleIndex) {
                    return getBreakPointsAtCandle(candleIndex);
                }

                function isRealBreakoutWithIchimoku(breakInfo, ichimokuData, currentPrice) {
                    if (!ichimokuData) return true;
                    if (breakInfo.direction === 'up') {
                        const conditions = {
                            priceAboveCloud: currentPrice > ichimokuData.kumoTop,
                            tenkanAboveKijun: ichimokuData.tenkan > ichimokuData.kijun,
                            // chikou = close فعلی؛ bullish یعنی close فعلی بالاتر از close 26 کندل قبل
                            chikouBullish: ichimokuData.isChikouBullish,
                            kumoThick: (ichimokuData.kumoTop - ichimokuData.kumoBottom) > 0
                        };
                        const useCloudFilter = ${options.ichimoku?.useCloudFilter || false};
                        const useTKCross = ${options.ichimoku?.useTKCross || false};
                        const useChikou = ${options.ichimoku?.useChikou || false};
                        let isValid = true;
                        if (useCloudFilter) isValid = isValid && conditions.priceAboveCloud;
                        if (useTKCross) isValid = isValid && conditions.tenkanAboveKijun;
                        if (useChikou) isValid = isValid && conditions.chikouBullish;
                        return isValid;
                    } else {
                        const conditions = {
                            priceBelowCloud: currentPrice < ichimokuData.kumoBottom,
                            tenkanBelowKijun: ichimokuData.tenkan < ichimokuData.kijun,
                            // bearish یعنی close فعلی پایین‌تر از close 26 کندل قبل
                            chikouBearish: !ichimokuData.isChikouBullish
                        };
                        const useCloudFilter = ${options.ichimoku?.useCloudFilter || false};
                        const useTKCross = ${options.ichimoku?.useTKCross || false};
                        const useChikou = ${options.ichimoku?.useChikou || false};
                        let isValid = true;
                        if (useCloudFilter) isValid = isValid && conditions.priceBelowCloud;
                        if (useTKCross) isValid = isValid && conditions.tenkanBelowKijun;
                        if (useChikou) isValid = isValid && conditions.chikouBearish;
                        return isValid;
                    }
                }

                const __internalStopLossStages = ${JSON.stringify(stopLossStages)};

                function calculateStopLossFromStages(entryPrice, currentPrice, stages) {
                    if (stages.length === 0) return entryPrice;
                    if (currentPrice <= entryPrice) return entryPrice * (1 + stages[0].stopLossPercent / 100);
                    const priceMovePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                    let selectedStage = stages[0];
                    for (const stage of stages) {
                        if (priceMovePercent >= stage.movePercent) selectedStage = stage;
                        else break;
                    }
                    return entryPrice * (1 + selectedStage.stopLossPercent / 100);
                }

                function trailingStop(currentPrice, entryPrice, initialStopLoss, trailPercentage, maxDistancePercent = 10, useFibonacci = false, highestPivot = null, trendLineAngle = null) {
                    if (currentPrice > entryPrice) {
                        let stageStopLoss = calculateStopLossFromStages(entryPrice, currentPrice, __internalStopLossStages);
                        let minStop = Math.max(initialStopLoss, stageStopLoss);
                        if (useFibonacci && highestPivot && trendLineAngle) {
                            if (trendLineAngle >= 270 && trendLineAngle <= 350) {
                                const distanceToPivot = highestPivot - entryPrice;
                                let currentFibLevel = minStop;
                                const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
                                for (const level of fibLevels) {
                                    const fibPrice = entryPrice + (distanceToPivot * level);
                                    if (currentPrice >= fibPrice) {
                                        currentFibLevel = Math.max(currentFibLevel, fibPrice * 0.99);
                                    }
                                }
                                return Math.max(currentFibLevel, minStop);
                            }
                        }
                        const newStop = currentPrice * (1 - trailPercentage / 100);
                        const maxDistance = entryPrice * (maxDistancePercent / 100);
                        const minStop2 = currentPrice - maxDistance;
                        return Math.max(newStop, minStop, minStop2, initialStopLoss);
                    }
                    return initialStopLoss;
                }

                function calculateLineAngle(line) {
                    if (!line || !line.pivots || line.pivots.length < 2) return 0;
                    const firstPivot = line.pivots[0];
                    const lastPivot = line.pivots[line.pivots.length - 1];
                    const deltaY = lastPivot.price - firstPivot.price;
                    const deltaX = lastPivot.index - firstPivot.index;
                    if (deltaX === 0) return 90;
                    const slope = deltaY / deltaX;
                    const angleRad = Math.atan(slope);
                    const angleDeg = angleRad * (180 / Math.PI);
                    let normalizedAngle = angleDeg;
                    if (normalizedAngle < 0) normalizedAngle += 360;
                    return normalizedAngle;
                }

                ${code}
                return customStrategy(data, index, breakPointsParam, ichimokuParam, trendLinesParam, refineEntryPriceParam);
            `);

            // ==================== ذخیره تاریخچه ایچیموکو برای شیفت ابر ====================
            // اصلاح باگ: قبلاً با .push() ذخیره می‌شد، که چون حلقه از i=20 شروع می‌شود
            // باعث می‌شد ichimokuHistory[k] متناظر کندل i=20+k باشد، نه کندل k.
            // الان با ایندکس واقعی کندل (i) ذخیره می‌شود تا شیفت دقیق انجام شود.
            const ichimokuHistory = [];
            const cloudShiftPeriod = options.ichimoku?.kijunPeriod || 30; // استاندارد: برابر با دوره کیجون

            // ==================== حلقه اصلی بکتست ====================
            for (let i = 20; i < marketData.length; i++) {
                const candle = marketData[i];
                debugStats.totalCandles++;

                // ==================== محاسبه ایچیموکو با شیفت ابر ====================
                let ichimoku = null;
                if (options.ichimoku?.enabled !== false) {
                    const raw = calculateIchimokuHistorical(marketData, i, {
                        tenkanPeriod: options.ichimoku?.tenkanPeriod || 14,
                        kijunPeriod: options.ichimoku?.kijunPeriod || 30,
                        senkouBPeriod: options.ichimoku?.senkouBPeriod || 57
                    });
                    // اصلاح: ذخیره بر اساس ایندکس واقعی کندل i، نه ترتیب push
                    ichimokuHistory[i] = raw;
                    if (raw) {
                        ichimoku = {
                            tenkan: raw.tenkan,
                            kijun: raw.kijun,
                            chikou: raw.chikou,
                            currentClose: candle.close
                        };
                        // شیفت ابر به جلو (استفاده از مقدار cloudShiftPeriod کندل قبل)
                        // اصلاح: ایندکس آرایه الان مستقیماً با ایندکس کندل مطابقت دارد
                        if (i >= cloudShiftPeriod && ichimokuHistory[i - cloudShiftPeriod]) {
                            const shifted = ichimokuHistory[i - cloudShiftPeriod];
                            ichimoku.senkouA = shifted.senkouA;
                            ichimoku.senkouB = shifted.senkouB;
                            ichimoku.kumoTop = Math.max(shifted.senkouA, shifted.senkouB);
                            ichimoku.kumoBottom = Math.min(shifted.senkouA, shifted.senkouB);
                            ichimoku.isPriceAboveCloud = candle.close > ichimoku.kumoTop;
                            ichimoku.isPriceBelowCloud = candle.close < ichimoku.kumoBottom;
                        } else {
                            ichimoku.senkouA = null;
                            ichimoku.senkouB = null;
                            ichimoku.kumoTop = null;
                            ichimoku.kumoBottom = null;
                            ichimoku.isPriceAboveCloud = false;
                            ichimoku.isPriceBelowCloud = false;
                        }
                        ichimoku.isTenkanAboveKijun = raw.tenkan > raw.kijun;
                        // اصلاح مقایسه چیکو: chikou = close فعلی، مقایسه با close 26 کندل قبل
                        // raw.isChikouBullish در calculateIchimokuHistorical درست محاسبه شده
                        ichimoku.isChikouBullish = raw.isChikouBullish;
                    } else {
                        debugStats.ichimokuNullCount++;
                    }
                }

                // ==================== محاسبه واگرایی (بدون آینده‌نگری) ====================
                // marketData کامل پاس داده می‌شود اما maxIndex=i همان تضمینی است که خودِ
                // divergence-detector.js برای حالت زنده/کندل‌به‌کندل مستند کرده: هیچ پیوتی که
                // به کندل‌های بعد از i نیاز داشته باشد ساخته نمی‌شود.
                let divergenceSignals = __lastDivergenceSignals;
                if (divergenceDetector && divergenceIndicators.length > 0 &&
                    (i - __lastDivergenceComputedIndex >= divergenceRecomputeInterval)) {
                    const combinedDivergenceSignals = [];
                    for (const indicatorName of divergenceIndicators) {
                        try {
                            const sigs = divergenceDetector.runDivergenceDetection({
                                marketData,
                                indicator: indicatorName,
                                maxIndex: i
                            });
                            if (Array.isArray(sigs)) combinedDivergenceSignals.push(...sigs);
                        } catch (err) {
                            debugStats.divergenceErrors = (debugStats.divergenceErrors || 0) + 1;
                            console.error(`❌ [DIVERGENCE_ERROR] خطا در محاسبه واگرایی (${indicatorName}) در کندل ${i}:`, err.message);
                        }
                    }
                    divergenceSignals = combinedDivergenceSignals;
                    __lastDivergenceSignals = combinedDivergenceSignals;
                    __lastDivergenceComputedIndex = i;
                }

                // ==================== بروزرسانی افزایشی خطوط روند (بدون آینده‌نگری) ====================
                // فقط با داده‌ی تا همین کندل (marketData.slice(0, i + 1)) محاسبه می‌شود، هرگز
                // کندل‌های آینده. state بین کندل‌ها نگه‌داشته می‌شود تا هر بار از صفر محاسبه نشود
                // (پیوت‌ها/خطوطِ قبلاً تایید شده در state.trendLines باقی می‌مانند).
                if (trendLineSettings) {
                    if (USE_BATCH_TRENDLINES && !VERIFY_BATCH_EQUIVALENCE) {
                        // مسیر سریع: فقط فیلترِ خطوطِ از‌قبل‌محاسبه‌شده
                        processedTrendLines.length = 0;
                        getActiveTrendLinesAtCandle(batchTrendLines, i, batchCursor).forEach(l => processedTrendLines.push(l));
                    } else if (VERIFY_BATCH_EQUIVALENCE) {
                        // مسیر اعتبارسنجی: هر دو روش را اجرا و مقایسه کن
                        const dataUpToNow = marketData.slice(0, i + 1);
                        const incResult = detectTrendLinesIncremental(dataUpToNow, trendLineIncState, trendLineSettings);
                        trendLineIncState = incResult.state;
                        processedTrendLines.length = 0;
                        prepareTrendLines(incResult.trendLines);

                        const batchActive = getActiveTrendLinesAtCandle(batchTrendLines, i, batchCursor);
                        const lineKey = l => `${l.type}|${l.startIndex}|${l.endIndex}`;
                        const incKeys = new Set(processedTrendLines.map(lineKey));
                        const batchKeys = new Set(batchActive.map(lineKey));
                        verifyComparisonsCount++;

                        const onlyInIncremental = [...incKeys].filter(k => !batchKeys.has(k));
                        const onlyInBatch = [...batchKeys].filter(k => !incKeys.has(k));

                        if (onlyInIncremental.length > 0 || onlyInBatch.length > 0) {
                            throw new Error(
                                `❌ [VERIFY_BATCH_EQUIVALENCE] عدم تطابق در کندل ${i} — این یک باگ بحرانی است، اجرا متوقف شد.\n` +
                                `   incremental: ${incKeys.size} خط معتبر | batch: ${batchKeys.size} خط معتبر\n` +
                                `   فقط در incremental موجودند ولی در batch هنوز نیستند (batch دیرتر از موعد فعال می‌کند): ${JSON.stringify(onlyInIncremental)}\n` +
                                `   فقط در batch موجودند ولی در incremental هنوز نیستند (⚠️ لو رفتن اطلاعات آینده در batch): ${JSON.stringify(onlyInBatch)}`
                            );
                        }

                        // اگر USE_BATCH_TRENDLINES هم فعال باشد، بعد از تایید تطابق در همین
                        // کندل، از نسخه‌ی batch (با id های خودش) به‌عنوان خروجی رسمی استفاده کن
                        if (USE_BATCH_TRENDLINES) {
                            processedTrendLines.length = 0;
                            batchActive.forEach(l => processedTrendLines.push(l));
                        }
                    } else {
                        // مسیر پیش‌فرض فعلی: افزایشی واقعی، کندل‌به‌کندل
                        const dataUpToNow = marketData.slice(0, i + 1);
                        const incResult = detectTrendLinesIncremental(dataUpToNow, trendLineIncState, trendLineSettings);
                        trendLineIncState = incResult.state;
                        processedTrendLines.length = 0;
                        prepareTrendLines(incResult.trendLines);
                    }
                }

                // ==================== آمار خطوط روند ====================
                if (processedTrendLines.length === 0) {
                    debugStats.candlesWithZeroTrendLines++;
                } else if (processedTrendLines.length > debugStats.maxTrendLinesSeen) {
                    debugStats.maxTrendLinesSeen = processedTrendLines.length;
                }

                // ==================== تشخیص شکست خطوط روند ====================
                // دو حالت مجزا بر اساس entryType:
                // - openBreak: تشخیص با Open کندل جاری (detectOpenBreak)، ورود در همان کندل i
                //   (breakPointsMap[i]) — هرگز از High/Low/Close کندل جاری استفاده نمی‌شود.
                // - nextCandle: تشخیص با High/Low کندل جاری (detectTrendLineFirstBreak)، ورود
                //   موکول به کندل بعدی (breakPointsMap[i+1]) تا از آینده‌نگری جلوگیری شود.
                if (processedTrendLines.length > 0) {
                    processedTrendLines.forEach(line => {
                        const breakInfo = openBreakEntry
                            ? detectOpenBreak(line, i, candle)
                            : detectTrendLineFirstBreak(line, i, candle);
                        if (breakInfo) {
                            debugStats.trendLineBreaksDetected++;
                            debugStats.breaksByDirection[breakInfo.direction] = (debugStats.breaksByDirection[breakInfo.direction] || 0) + 1;
                            const signalIndex = openBreakEntry ? i : i + 1;
                            if (!breakPointsMap[signalIndex]) breakPointsMap[signalIndex] = [];
                            breakPointsMap[signalIndex].push(breakInfo);
                        }
                    });
                }

                // ==================== مرحله ۱: مدیریت و بستن پوزیشن‌های باز (بدون هیچ شرطی) ====================
                for (let j = positions.length - 1; j >= 0; j--) {
                    const position = positions[j];
                    let shouldExit = false;
                    let exitPrice = 0;
                    let exitReason = '';

                    // 1. Gap Handling — هم stopLoss و هم takeProfit باید بررسی شوند
                    if (settings.handleGaps) {
                        // ابتدا بررسی takeProfit gap (اگر وجود داشت)
                        if (!shouldExit && position.takeProfit) {
                            const tpGap = handleGapExit(position, candle, 'takeProfit');
                            if (tpGap.shouldExit) {
                                shouldExit = true;
                                exitPrice = tpGap.exitPrice;
                                exitReason = tpGap.exitReason;
                            }
                        }
                        // سپس بررسی stopLoss gap
                        if (!shouldExit) {
                            const slGap = handleGapExit(position, candle, 'stopLoss');
                            if (slGap.shouldExit) {
                                shouldExit = true;
                                exitPrice = slGap.exitPrice;
                                exitReason = slGap.exitReason;
                            }
                        }
                    }

                    // 2. برخورد درون کندل (با اولویت صحیح) — stopLoss حتی بدون takeProfit بررسی شود
                    if (!shouldExit) {
                        const { exitPrice: ep, exitReason: er } = getExitPriceAndReason(candle, position);
                        if (ep) {
                            shouldExit = true;
                            exitPrice = ep;
                            exitReason = er;
                        }
                    }

                    // 3. به‌روزرسانی حد ضرر پلکانی
                    if (!shouldExit && position.useStagedStopLoss) {
                        const newStopLoss = stagedStopLoss(
                            candle.close,
                            position.entryPrice,
                            position.initialStopLoss,
                            position.stopLossStages || stopLossStages,
                            position.type
                        );
                        if ((position.type === 'BUY' && newStopLoss > position.stopLoss) ||
                            (position.type === 'SELL' && newStopLoss < position.stopLoss)) {
                            position.stopLoss = newStopLoss;
                        }
                    }

                    // 4. بستن پوزیشن
                    if (shouldExit) {
                        const { grossProfit, netProfit, entryCommission, exitCommission } =
                            calculateProfit(position, exitPrice, commission);
                        capital += netProfit;

                        const grossProfitPercent = position.type === 'BUY'
                            ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                            : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

                        const totalCommPercent = ((entryCommission + exitCommission) / (position.entryPrice * position.size)) * 100;
                        const netProfitPercent = grossProfitPercent - totalCommPercent;

                        const tradeData = {
                            type: position.type,
                            entryPrice: position.entryPrice,
                            exitPrice: exitPrice,
                            entryTime: position.entryTime,
                            exitTime: candle.timestamp,
                            profit: netProfit,
                            grossProfit: grossProfit,
                            profitPercent: netProfitPercent,
                            grossProfitPercent: grossProfitPercent,
                            commissionPercent: totalCommPercent,
                            size: position.size,
                            exitReason: exitReason,
                            stopLoss: position.stopLoss,
                            initialStopLoss: position.initialStopLoss,
                            takeProfit: position.takeProfit,
                            trailingStop: position.trailingStop,
                            useFibonacci: position.useFibonacci || false,
                            highestPivot: position.highestPivot || null,
                            trendLineAngle: position.trendLineAngle || null,
                            entryCommission: entryCommission,
                            exitCommission: exitCommission,
                            entryIndex: position.entryIndex,
                            ichimoku: position.ichimoku || null,
                            riskType: 'Fixed',
                            riskAmount: position.riskAmount || 0,
                            riskPercent: position.riskPercent || 0
                        };

                        trades.push(tradeData);
                        tradeCounter++;

                        positions.splice(j, 1);
                    }
                }

                // ==================== مرحله ۲: باز کردن پوزیشن جدید (فقط در صورت مجاز بودن) ====================
                // کندل‌های بافر خودکار (i < entryStartIndex) فقط برای آپدیت اندیکاتورها/خطوط روند
                // استفاده می‌شوند؛ استراتژی همچنان صدا زده می‌شود اما سیگنالش نادیده گرفته می‌شود.
                let allowNewTrade = i >= entryStartIndex;
                try {
                    debugStats.strategyCalls++;
                    // آرگومان ششم (refineEntryPriceFromBaseMinute) اختیاری است: استراتژی
                    // می‌تواند برای حالت openBreak، به‌جای open کندل بزرگ، قیمت ورود دقیق‌تری
                    // از داده‌ی پایه (۱ دقیقه‌ای) بگیرد. نگاه کنید به توضیحات بالای تعریف تابع.
                    const signal = strategyFn(marketData, i, breakPointsMap, ichimoku, processedTrendLines, refineEntryPriceFromBaseMinute, divergenceSignals);

                    if (!signal || !signal.signal) {
                        debugStats.nullOrNoSignalCount++;
                    } else {
                        debugStats.signalReturnedCount++;
                        if (debugStats.firstSignalCandleIndex === null) {
                            debugStats.firstSignalCandleIndex = i;
                            console.log(`🔔 [FIRST_SIGNAL] اولین سیگنال استراتژی در کندل ${i} (زمان ${candle.timestamp}): ${JSON.stringify(signal)}`);
                        }
                    }

                    // اعتبارسنجی سیگنال خروجی
                    if (signal && signal.signal) {
                        const isBuy = signal.signal === 'BUY';
                        const isSell = signal.signal === 'SELL';
                        // بررسی پایه‌ای
                        let isValid = signal.price > 0 &&
                                      signal.stopLoss > 0 &&
                                      (isBuy || isSell) &&
                                      signal.stopLoss !== signal.price;
                        // جهت stopLoss باید با نوع پوزیشن مطابقت داشته باشد
                        // BUY: stopLoss باید پایین‌تر از price باشد
                        // SELL: stopLoss باید بالاتر از price باشد
                        if (isValid && isBuy && signal.stopLoss >= signal.price) {
                            isValid = false;
                        }
                        if (isValid && isSell && signal.stopLoss <= signal.price) {
                            isValid = false;
                        }
                        // takeProfit اختیاری است — اگر وجود داشت جهتش را بررسی کن
                        if (isValid && signal.takeProfit) {
                            if (isBuy && signal.takeProfit <= signal.price) {
                                isValid = false;
                            }
                            if (isSell && signal.takeProfit >= signal.price) {
                                isValid = false;
                            }
                        }
                        if (!isValid) {
                            allowNewTrade = false;
                            debugStats.invalidSignalCount++;
                            if (debugStats.invalidSignalSamples.length < 10) {
                                debugStats.invalidSignalSamples.push({ candle: i, signal });
                            }
                        }
                    }

                    if (allowNewTrade && signal && signal.signal) {
                        if (!canOpenNewPosition(positions, signal.price)) {
                            allowNewTrade = false;
                            debugStats.blockedByZoneCount++;
                        }
                    }

                    if (allowNewTrade && signal && signal.signal) {
                        const riskAmount = initialCapital * (riskPerTrade / 100);
                        const positionSize = riskAmount / Math.abs(signal.price - signal.stopLoss);
                        const requiredCapital = positionSize * signal.price * (commission / 100);

                        if (capital < requiredCapital) {
                            debugStats.blockedByCapitalCount++;
                            if (debugStats.blockedByCapitalSamples.length < 10) {
                                debugStats.blockedByCapitalSamples.push({ candle: i, capital, requiredCapital, signal });
                            }
                        }

                        if (capital >= requiredCapital) {
                            const newPosition = {
                                type: signal.signal,
                                entryPrice: signal.price,
                                entryTime: candle.timestamp,
                                stopLoss: signal.stopLoss,
                                takeProfit: signal.takeProfit,
                                size: positionSize,
                                initialStopLoss: signal.stopLoss,
                                trailingStop: signal.trailingStop || false,
                                trailingPercent: signal.trailingPercent || 2,
                                useFibonacci: signal.useFibonacci || false,
                                highestPivot: signal.highestPivot || null,
                                trendLineAngle: signal.trendLineAngle || null,
                                entryIndex: i,
                                // اصلاح باگ: قبلاً فقط از signal.useStagedStopLoss خوانده می‌شد
                                // و options.useStagedStopLoss (سطح کلی runBacktest) هیچ اثری نداشت.
                                // الان اگر استراتژی صریحاً مقدار نداده باشد (undefined)، از settings.useStagedStopLoss
                                // (که از options گرفته می‌شود) استفاده می‌شود. اگر استراتژی صریحاً false بدهد، false باقی می‌ماند.
                                useStagedStopLoss: signal.useStagedStopLoss !== undefined
                                    ? signal.useStagedStopLoss
                                    : settings.useStagedStopLoss,
                                stopLossStages: signal.stopLossStages || stopLossStages,
                                ichimoku: ichimoku,
                                riskAmount: riskAmount,
                                riskPercent: riskPerTrade
                            };

                            // ==================== رفع باگ: بررسی خروج در همان کندل ورود ====================
                            // مشکل: چون «مرحله ۱» (بستن پوزیشن‌های باز) همیشه *قبل* از «مرحله ۲» (باز کردن
                            // پوزیشن جدید) در همین حلقه اجرا می‌شود، پوزیشنی که همین‌جا (کندل i) باز می‌شود
                            // تا کندل i+1 اصلاً وارد چرخه‌ی چک خروج نمی‌شد — حتی اگر داده‌ی دقیق ۱ دقیقه‌ای
                            // (baseMinuteData) موجود باشد و نشان دهد که حد ضرر/سود همان کندل i لمس شده.
                            // راه‌حل: بلافاصله بعد از ساخت newPosition، با کندل‌های پایه‌ای *از لحظه‌ی ورود
                            // به بعد* (نه کل کندل i، چون قبل از لحظه‌ی ورود نباید بررسی شود) چک می‌کنیم که
                            // آیا SL/TP در باقی‌مانده‌ی همین کندل لمس شده یا نه. اگر بله، پوزیشن همان‌جا
                            // بسته می‌شود و اصلاً وارد آرایه‌ی positions نمی‌شود؛ در غیر این صورت رفتار
                            // قبلی (باز کردن عادی پوزیشن) بدون هیچ تغییری ادامه پیدا می‌کند.
                            let closedInEntryCandle = false;
                            if (enableIntrabarPrecision && baseMinuteData) {
                                const entryTimestampMs = new Date(candle.timestamp).getTime();
                                const baseCandlesAfterEntry = getBaseMinuteCandlesFromEntryOnward(candle, entryTimestampMs);
                                if (baseCandlesAfterEntry.length > 0) {
                                    const hit = detectFirstHitFrom5m(baseCandlesAfterEntry, newPosition);
                                    if (hit) {
                                        const { grossProfit, netProfit, entryCommission, exitCommission } =
                                            calculateProfit(newPosition, hit.exitPrice, commission);

                                        const grossProfitPercent = newPosition.type === 'BUY'
                                            ? ((hit.exitPrice - newPosition.entryPrice) / newPosition.entryPrice) * 100
                                            : ((newPosition.entryPrice - hit.exitPrice) / newPosition.entryPrice) * 100;
                                        const totalCommPercent = ((entryCommission + exitCommission) / (newPosition.entryPrice * newPosition.size)) * 100;
                                        const netProfitPercent = grossProfitPercent - totalCommPercent;

                                        trades.push({
                                            type: newPosition.type,
                                            entryPrice: newPosition.entryPrice,
                                            exitPrice: hit.exitPrice,
                                            entryTime: newPosition.entryTime,
                                            exitTime: candle.timestamp,
                                            profit: netProfit,
                                            grossProfit: grossProfit,
                                            profitPercent: netProfitPercent,
                                            grossProfitPercent: grossProfitPercent,
                                            commissionPercent: totalCommPercent,
                                            size: newPosition.size,
                                            exitReason: hit.exitReason + ' (Same-Candle Entry)',
                                            stopLoss: newPosition.stopLoss,
                                            initialStopLoss: newPosition.initialStopLoss,
                                            takeProfit: newPosition.takeProfit,
                                            trailingStop: newPosition.trailingStop,
                                            useFibonacci: newPosition.useFibonacci,
                                            highestPivot: newPosition.highestPivot,
                                            trendLineAngle: newPosition.trendLineAngle,
                                            entryCommission: entryCommission,
                                            exitCommission: exitCommission,
                                            entryIndex: newPosition.entryIndex,
                                            ichimoku: newPosition.ichimoku,
                                            riskType: 'Fixed',
                                            riskAmount: newPosition.riskAmount,
                                            riskPercent: newPosition.riskPercent
                                        });

                                        capital -= requiredCapital; // همون رزرو سرمایه‌ی مسیر عادی
                                        capital += netProfit;       // به‌علاوه‌ی نتیجه‌ی همین معامله

                                        tradeCounter++;
                                        debugStats.sameCandleExitCount = (debugStats.sameCandleExitCount || 0) + 1;
                                        closedInEntryCandle = true;
                                    }
                                }
                            }

                            if (!closedInEntryCandle) {
                                positions.push(newPosition);
                                capital -= requiredCapital;
                                debugStats.positionsOpenedCount++;
                                if (debugStats.firstPositionCandleIndex === null) {
                                    debugStats.firstPositionCandleIndex = i;
                                }
                            }
                        }
                    }

                } catch (error) {
                    debugStats.strategyErrors++;
                    if (debugStats.strategyErrorSamples.length < 10) {
                        debugStats.strategyErrorSamples.push({ candle: i, message: error.message, stack: error.stack });
                    }
                    console.error(`❌ [STRATEGY_ERROR] خطا در اجرای استراتژی در کندل ${i} (زمان ${candle.timestamp}):`, error.message);
                    console.error(error.stack);
                }

                // ==================== بروزرسانی Equity ====================
                let totalPositionValue = 0;
                positions.forEach(position => {
                    const currentValue = position.type === 'BUY'
                        ? (candle.close - position.entryPrice) * position.size
                        : (position.entryPrice - candle.close) * position.size;
                    totalPositionValue += currentValue;
                });
                equity = capital + totalPositionValue;

                equityData.push({
                    time: candle.timestamp,
                    equity: equity,
                    openPositions: positions.length,
                    capital: capital,
                    riskType: 'Fixed'
                });

                if (onProgress && i % Math.floor(marketData.length / 100) === 0) {
                    onProgress((i / marketData.length) * 100);
                }
            }

            // ==================== سیستم ادامه‌دهی بین فایل‌ها (با پشتیبانی از SELL و چند فایل) ====================
            if (positions.length > 0 && settings.enableContinuation) {
                console.log(`🔄 بررسی فایل‌های بعدی برای ادامه ${positions.length} معامله...`);

                let currentData = marketData;
                let remainingPositions = positions;
                let continuationCount = 0;
                const usedFileNames = new Set(); // جلوگیری از انتخاب دوبارهٔ فایل تکراری
                // تاریخچه‌ی فایل‌های قبلی (از جدیدترین به قدیمی‌ترین)، برای پشتیبانی از بافرهای
                // بیش از ۱۰۰٪ (مثلاً ۱۲۵٪/۲۰۰٪ برای ۳۰m/1h) که به بیش از یک فایل قبلی نیاز دارند.
                let fileHistory = [marketData];
                const MAX_FILE_HISTORY = 3; // کافی برای حداکثر بافر ۲۰۰٪ (نیازمند ۲ فایل کامل قبلی)

                while (remainingPositions.length > 0 && continuationCount < settings.maxContinuationFiles) {
                    // پیدا کردن فایل بعدی — اصلاح باگ: الان از currentData (فایل جاری) می‌خوانیم
                    // نه از marketData ثابت، تا continuation واقعاً به فایل بعدی برود نه همان فایل قبلی
                    const nextFile = findNextFileByDate(currentData, usedFileNames);
                    if (!nextFile) break;

                    console.log(`📂 ادامه با فایل: ${nextFile.fileName} (${nextFile.data.length} کندل)`);
                    usedFileNames.add(nextFile.fileName || `file_${continuationCount}`);

                    // اگر enableSmartContinuation فعال باشد، به‌جای ارسال مستقیم داده‌ی خام فایل
                    // بعدی، بافری متناسب با تایم‌فریم جاری (calculateBufferPercentage) از انتهای
                    // فایل(های) قبلی را به‌صورت خودکار به ابتدای آن الحاق می‌کنیم تا اندیکاتورها
                    // در ابتدای فایل بعدی دچار نقص نشوند.
                    let dataForContinuation = nextFile.data;
                    let startIndexForContinuation = 0;

                    if (settings.enableSmartContinuation) {
                        const combined = buildCombinedData(fileHistory, nextFile.data, settings.timeframeLabel);
                        dataForContinuation = combined.combinedData;
                        startIndexForContinuation = combined.startIndex;

                        if (combined.bufferSize > 0) {
                            const pct = (combined.targetPercentage * 100).toFixed(0);
                            smartContinuationStats.usedCount++;
                            smartContinuationStats.lastBufferSize = combined.bufferSize;
                            smartContinuationStats.totalBufferCandles += combined.bufferSize;
                            smartContinuationStats.lastTargetPercentage = combined.targetPercentage;
                            console.log(`🧩 بافر خودکار ادامه‌دهی: ${combined.bufferSize} کندل (معادل ${pct}% بر اساس تایم‌فریم ${settings.timeframeLabel || 'نامشخص'}) به ابتدای فایل بعدی الحاق شد`);
                        }
                    }

                    const continuationResult = continueOpenTradesWithNextFile(
                        remainingPositions,
                        dataForContinuation,
                        commission,
                        startIndexForContinuation
                    );

                    // اضافه کردن معاملات بسته شده
                    trades.push(...continuationResult.trades);

                    // به‌روزرسانی capital برای معاملات بسته شده
                    continuationResult.trades.forEach(t => {
                        capital += t.profit;
                    });

                    // به‌روزرسانی پوزیشن‌ها
                    remainingPositions = continuationResult.remainingPositions;

                    // به‌روزرسانی data برای پیدا کردن فایل بعدی (الان واقعاً استفاده می‌شود)
                    // توجه: عمداً داده‌ی خام nextFile.data (بدون بافر) نگه داشته می‌شود، چون این
                    // مقدار در دور بعدی حلقه هم برای findNextFileByDate (پیدا کردن فایل پس از آن)
                    // و هم به‌عنوان جدیدترین عضو fileHistory برای بافر دور بعد استفاده خواهد شد.
                    currentData = nextFile.data;
                    fileHistory = [nextFile.data, ...fileHistory].slice(0, MAX_FILE_HISTORY);

                    continuationCount++;
                    console.log(`✅ ${continuationResult.trades.length} معامله در فایل بعدی بسته شدند`);

                    if (remainingPositions.length === 0) break;
                }

                positions = remainingPositions;
            }

            // ==================== بستن معاملات باقی‌مانده در پایان (با اصلاح درصد سود SELL) ====================
            if (positions.length > 0) {
                const lastCandle = marketData[marketData.length - 1];
                console.log(`🔚 بستن ${positions.length} معامله باقی‌مانده در پایان بکتست`);

                positions.forEach((position, index) => {
                    const exitPrice = lastCandle.close;
                    const { grossProfit, netProfit, entryCommission, exitCommission } =
                        calculateProfit(position, exitPrice, commission);
                    capital += netProfit;

                    const grossProfitPercent = position.type === 'BUY'
                        ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                        : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

                    const totalCommPercent = ((entryCommission + exitCommission) / (position.entryPrice * position.size)) * 100;
                    const netProfitPercent = grossProfitPercent - totalCommPercent;

                    const tradeData = {
                        type: position.type,
                        entryPrice: position.entryPrice,
                        exitPrice: exitPrice,
                        entryTime: position.entryTime,
                        exitTime: lastCandle.timestamp,
                        profit: netProfit,
                        grossProfit: grossProfit,
                        profitPercent: netProfitPercent,
                        grossProfitPercent: grossProfitPercent,
                        commissionPercent: totalCommPercent,
                        size: position.size,
                        exitReason: 'End of backtest (Forced close)',
                        stopLoss: position.stopLoss,
                        takeProfit: position.takeProfit,
                        isForced: true,
                        entryCommission: entryCommission,
                        exitCommission: exitCommission,
                        riskType: 'Fixed',
                        riskAmount: position.riskAmount || 0,
                        riskPercent: position.riskPercent || 0
                    };

                    trades.push(tradeData);
                    tradeCounter++;
                });

                positions = [];
                equity = capital;
            }

            // ==================== محاسبه آمار نهایی ====================
            const closedTrades = trades;
            const profitableTrades = closedTrades.filter(t => t.profit > 0);
            const losingTrades = closedTrades.filter(t => t.profit < 0);

            const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profit, 0);
            const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
            const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? Infinity : 0);

            let maxDrawdown = 0;
            let peakEquity = initialCapital;
            let runningEquity = initialCapital;
            closedTrades.forEach(trade => {
                runningEquity += trade.profit;
                if (runningEquity > peakEquity) {
                    peakEquity = runningEquity;
                }
                const drawdownFromPeak = ((peakEquity - runningEquity) / peakEquity) * 100;
                if (drawdownFromPeak > maxDrawdown) {
                    maxDrawdown = drawdownFromPeak;
                }
            });

            const fixedRiskAmount = initialCapital * (riskPerTrade / 100);
            const totalRiskExposure = fixedRiskAmount * closedTrades.length;
            const actualAverageRisk = closedTrades.reduce((sum, t) => sum + (t.riskAmount || 0), 0) / closedTrades.length || 0;

            const result = {
                trades: trades,
                finalCapital: capital,
                initialCapital: initialCapital,
                equityData: equityData,
                trendLineBreaks: trendLineBreaks,
                ichimokuSettings: options.ichimoku || {},
                statistics: {
                    riskType: 'Fixed Risk',
                    riskPerTrade: riskPerTrade,
                    fixedRiskAmount: fixedRiskAmount,
                    totalRiskExposure: totalRiskExposure,
                    actualAverageRisk: actualAverageRisk,

                    totalTrades: closedTrades.length,
                    winningTrades: profitableTrades.length,
                    losingTrades: losingTrades.length,
                    winRate: closedTrades.length > 0 ? (profitableTrades.length / closedTrades.length) * 100 : 0,

                    fixedRiskTrades: closedTrades.length,
                    fixedRiskWinning: profitableTrades.length,
                    fixedRiskLosing: losingTrades.length,
                    fixedRiskWinRate: closedTrades.length > 0 ? (profitableTrades.length / closedTrades.length) * 100 : 0,

                    fibonacciTrades: closedTrades.filter(t => t.useFibonacci).length,
                    fibonacciWinning: closedTrades.filter(t => t.useFibonacci && t.profit > 0).length,
                    fibonacciLosing: closedTrades.filter(t => t.useFibonacci && t.profit < 0).length,
                    fibonacciWinRate: (() => {
                        const fib = closedTrades.filter(t => t.useFibonacci);
                        return fib.length > 0 ? (fib.filter(t => t.profit > 0).length / fib.length) * 100 : 0;
                    })(),

                    ichimokuTrades: closedTrades.filter(t => t.ichimoku).length,
                    ichimokuWinning: closedTrades.filter(t => t.ichimoku && t.profit > 0).length,
                    ichimokuLosing: closedTrades.filter(t => t.ichimoku && t.profit < 0).length,
                    ichimokuWinRate: (() => {
                        const ichi = closedTrades.filter(t => t.ichimoku);
                        return ichi.length > 0 ? (ichi.filter(t => t.profit > 0).length / ichi.length) * 100 : 0;
                    })(),

                    totalProfit: totalProfit - totalLoss,
                    grossProfit: totalProfit,
                    grossLoss: totalLoss,

                    maxDrawdown: maxDrawdown,
                    maxDrawdownTrades: 0,
                    profitFactor: profitFactor,

                    maxOpenPositions: Math.max(...equityData.map(e => e.openPositions || 0), 0),
                    avgOpenPositions: equityData.reduce((sum, e) => sum + (e.openPositions || 0), 0) / (equityData.length || 1),

                    trendLineBreakCount: Object.keys(trendLineBreaks).length,
                    trendLinesTotal: processedTrendLines.length,

                    continuedTrades: trades.filter(t => t.source === 'continued').length,
                    forcedCloses: trades.filter(t => t.isForced).length,
                    gapTrades: trades.filter(t => t.exitReason && t.exitReason.includes('Gap')).length
                },
                debugStats: debugStats,
                smartContinuationStats: smartContinuationStats
            };

            // ==================== گزارش دیباگ (علت‌یابی صفر بودن معاملات) ====================
            console.log("\n" + "=".repeat(60));
            console.log("🔍 گزارش دیباگ اجرای بکتست");
            console.log("=".repeat(60));
            console.log(`├─ کل کندل‌های پردازش‌شده: ${debugStats.totalCandles}`);
            if (VERIFY_BATCH_EQUIVALENCE) {
                console.log(`├─ ✅ [VERIFY_BATCH_EQUIVALENCE] تمام ${verifyComparisonsCount} کندلِ مقایسه‌شده، batch+فرمول دقیقاً با incremental واقعی یکسان بود (۰ عدم تطابق).`);
            } else if (USE_BATCH_TRENDLINES) {
                console.log(`├─ ⚙️  [BATCH] خطوط روند با batch+فرمول محاسبه شدند (بدون اجرای موازی incremental برای مقایسه).`);
            }
            console.log(`├─ کندل‌هایی که ichimoku=null بود: ${debugStats.ichimokuNullCount}`);
            console.log(`├─ کندل‌هایی با ۰ خط روند معتبر: ${debugStats.candlesWithZeroTrendLines} از ${debugStats.totalCandles}`);
            console.log(`├─ حداکثر تعداد خط روند معتبر همزمان: ${debugStats.maxTrendLinesSeen}`);
            console.log(`├─ کل شکست‌های خط روند شناسایی‌شده: ${debugStats.trendLineBreaksDetected} (بالا=${debugStats.breaksByDirection.up || 0}, پایین=${debugStats.breaksByDirection.down || 0})`);
            console.log(`├─ تعداد فراخوانی استراتژی: ${debugStats.strategyCalls}`);
            console.log(`├─ خطاهای استراتژی (throw شده): ${debugStats.strategyErrors}`);
            if (debugStats.divergenceErrors) {
                console.log(`├─ خطاهای محاسبه واگرایی: ${debugStats.divergenceErrors}`);
            }
            if (debugStats.strategyErrorSamples.length > 0) {
                console.log(`│  نمونه خطاها:`);
                debugStats.strategyErrorSamples.forEach(s => console.log(`│    - کندل ${s.candle}: ${s.message}`));
            }
            console.log(`├─ کندل‌هایی که استراتژی هیچ سیگنالی نداد: ${debugStats.nullOrNoSignalCount}`);
            console.log(`├─ کل سیگنال‌های تولیدشده (BUY/SELL): ${debugStats.signalReturnedCount}`);
            console.log(`│  ├─ اولین کندل با سیگنال: ${debugStats.firstSignalCandleIndex ?? 'هیچ‌وقت'}`);
            console.log(`│  ├─ سیگنال‌های نامعتبر (رد شده به دلیل قیمت/stopLoss/takeProfit): ${debugStats.invalidSignalCount}`);
            if (debugStats.invalidSignalSamples.length > 0) {
                console.log(`│  │  نمونه: ${JSON.stringify(debugStats.invalidSignalSamples[0])}`);
            }
            console.log(`│  ├─ رد شده به دلیل منطقه شلوغ (canOpenNewPosition): ${debugStats.blockedByZoneCount}`);
            console.log(`│  └─ رد شده به دلیل کمبود سرمایه: ${debugStats.blockedByCapitalCount}`);
            if (debugStats.blockedByCapitalSamples.length > 0) {
                console.log(`│     نمونه: ${JSON.stringify(debugStats.blockedByCapitalSamples[0])}`);
            }
            console.log(`├─ پوزیشن‌های واقعاً بازشده (باقی‌مانده باز تا کندل بعد): ${debugStats.positionsOpenedCount} (اولین در کندل ${debugStats.firstPositionCandleIndex ?? 'هیچ‌وقت'})`);
            console.log(`└─ پوزیشن‌هایی که در همان کندل ورود بسته شدند (رفع باگ same-candle): ${debugStats.sameCandleExitCount}`);

            if (trades.length === 0) {
                console.warn("\n⚠️⚠️⚠️ [ZERO_TRADES] هیچ معامله‌ای در کل بکتست باز نشد. علت‌های محتمل بر اساس آمار بالا:");
                if (debugStats.strategyErrors > 0) {
                    console.warn("   → استراتژی throw کرده (به بخش خطاهای استراتژی بالا نگاه کنید).");
                }
                if (debugStats.candlesWithZeroTrendLines === debugStats.totalCandles) {
                    console.warn("   → در تمام کندل‌ها هیچ خط روند معتبری وجود نداشت (processedTrendLines همیشه خالی بود). یا trendLineSettings/options.trendLines تنظیم نشده، یا شرایط isValidTrendLine خیلی سخت‌گیرانه است.");
                }
                if (debugStats.trendLineBreaksDetected === 0 && debugStats.maxTrendLinesSeen > 0) {
                    console.warn("   → خط روند معتبر پیدا شد ولی هیچ‌وقت شکسته نشد (شرط شکست در detectTrendLineFirstBreak هیچ‌وقت true نشد).");
                }
                if (debugStats.signalReturnedCount === 0 && debugStats.strategyCalls > 0) {
                    console.warn("   → استراتژی (کد کاربر) در هیچ کندلی سیگنال BUY/SELL برنگرداند، با اینکه بدون خطا اجرا شد. منطق ورود داخل کد استراتژی را بررسی کنید (شاید به breakPoints/trendLines/ichimoku وابسته است که هیچ‌وقت شرطش برقرار نشده).");
                }
                if (debugStats.signalReturnedCount > 0 && debugStats.positionsOpenedCount === 0) {
                    console.warn(`   → استراتژی ${debugStats.signalReturnedCount} سیگنال داد ولی همه رد شدند: نامعتبر=${debugStats.invalidSignalCount}, منطقه شلوغ=${debugStats.blockedByZoneCount}, کمبود سرمایه=${debugStats.blockedByCapitalCount}.`);
                }
                if (debugStats.ichimokuNullCount === debugStats.totalCandles) {
                    console.warn("   → ichimoku در تمام کندل‌ها null بود (داده تاریخی کافی برای senkouBPeriod/kijunPeriod نیست) — اگر استراتژی به ichimoku وابسته است این دلیل کافی است.");
                }
            }
            console.log("=".repeat(60) + "\n");

            // ==================== گزارش نهایی ====================
            console.log("\n" + "=".repeat(60));
            console.log("📊 گزارش جامع بکتست - Fixed Risk (نسخه کامل با اصلاح آینده‌نگری)");
            console.log("=".repeat(60));
            console.log(`\n🎯 سیستم Fixed Risk:`);
            console.log(`├─ ریسک هر معامله: ${riskPerTrade}% سرمایه اولیه`);
            console.log(`├─ مقدار ریسک ثابت: $${fixedRiskAmount.toFixed(2)}`);
            console.log(`├─ مجموع ریسک: $${totalRiskExposure.toFixed(2)} (${closedTrades.length} معامله)`);
            console.log(`└─ میانگین ریسک واقعی: $${actualAverageRisk.toFixed(2)}`);
            console.log(`\n📈 آمار معاملات:`);
            console.log(`├─ تعداد کل: ${result.statistics.totalTrades}`);
            console.log(`├─ سودده: ${result.statistics.winningTrades} (${result.statistics.winRate.toFixed(2)}%)`);
            console.log(`├─ ضررده: ${result.statistics.losingTrades} (${(100 - result.statistics.winRate).toFixed(2)}%)`);
            console.log(`\n⚠️ آنالیز ریسک:`);
            console.log(`├─ حداکثر افت سرمایه: ${maxDrawdown.toFixed(2)}%`);
            console.log(`├─ Profit Factor: ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}`);
            if (settings.enableSmartContinuation && smartContinuationStats.usedCount > 0) {
                const lastPct = (smartContinuationStats.lastTargetPercentage * 100).toFixed(0);
                console.log(`├─ اندازه‌ی بافر خودکار: ${smartContinuationStats.lastBufferSize} کندل (معادل ${lastPct}% از فایل قبلی، بر اساس تایم‌فریم ${settings.timeframeLabel || 'نامشخص'})`);
                console.log(`└─ بافر خودکار ${smartContinuationStats.usedCount} بار در طول ادامه‌دهی استفاده شد (مجموع ${smartContinuationStats.totalBufferCandles} کندل)`);
            }
            console.log("\n" + "=".repeat(60));
            console.log(`💰 سرمایه اولیه: ${initialCapital.toFixed(2)}`);
            console.log(`💰 سرمایه نهایی: ${capital.toFixed(2)}`);
            console.log(`📊 بازدهی کل: ${((capital - initialCapital) / initialCapital * 100).toFixed(2)}%`);
            console.log("=".repeat(60) + "\n");

            resolve(result);

        } catch (error) {
            console.error('❌ [BACKTEST_ERROR] خطا در اجرای بکتست:', error.message);
            console.error(error.stack);
            reject(error);
        }
    });
}

// ==================== تابع دیباگ ====================
async function debugTrendLines(marketData, options) {
    return new Promise((resolve) => {
        const debugInfo = {
            marketDataLength: marketData.length,
            options: options,
            pivotPoints: [],
            trendLines: [],
            ichimoku: null
        };

        const pivots = findPivotPoints(marketData, options.pivotPeriod, marketData.length - 1);
        debugInfo.pivotPoints = pivots;

        if (pivots.length >= 2) {
            const currentCandleIndex = marketData.length - 1;
            const sampleLine = createTrendLine(pivots[0], pivots[1], marketData, options, currentCandleIndex);
            if (sampleLine) {
                debugInfo.trendLines.push(sampleLine);
            }
        }

        if (marketData.length > 52) {
            debugInfo.ichimoku = calculateIchimokuHistorical(marketData, marketData.length - 1, options.ichimoku);
        }

        resolve(debugInfo);
    });
}

// ==================== اکسپورت ماژول‌ها ====================
module.exports = {
    runBacktest,
    detectTrendLinesAdvanced,
    debugTrendLines,
    precomputeTrendLinesBatch,
    getActiveTrendLinesAtCandle
};                   
