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

    // محاسبه چیکو اسپن (قیمت بسته ۲۶ دوره قبل) - اصلاح شده
    if (currentIndex >= 26) {
        result.chikou = data[currentIndex - 26].close;
    }

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

    // وضعیت چیکو اسپن - اصلاح شده (مقایسه با قیمت فعلی)
    if (currentIndex >= 52 && result.chikou) {
        const currentClose = data[currentIndex].close;
        result.isChikouBullish = result.chikou < currentClose;
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

function processTrendLineDataForMain(trendLines, marketData = []) {
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
                const touchInfo = countTouchPoints(line, marketData, currentCandleIndex);
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
                    const touchInfo = countTouchPoints(line, marketData, currentCandleIndex);
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
                    const touchInfo = countTouchPoints(line, marketData, currentCandleIndex);
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
            const processedTrendLines = processTrendLineDataForMain(trendLines, marketData);

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
    addNewLinesToPending(state, newTrendLines, currentCandleIndex);
    validatePendingLines(state, data, options, currentCandleIndex);

    const processedTrendLines = processTrendLineDataForMain(state.trendLines, data);

    return {
        trendLines: processedTrendLines,
        state: state
    };
}

function addNewLinesToPending(state, newTrendLines, currentCandleIndex) {
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
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
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
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
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
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
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
                    touchPoints: countTouchPoints(line, state.processedData, currentCandleIndex),
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
        const currentTouchPoints = countTouchPoints(pendingLine, marketData, currentCandleIndex);

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

function countTouchPoints(line, marketData, currentCandleIndex) {
    const maxDeviation = 0.000001;
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
// ==================== تابع اصلی بکتست با همه اصلاحات ====================

async function runBacktest(marketData, options, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            const code = options.code;
            if (!code) {
                throw new Error('کد استراتژی تعریف نشده است');
            }

            // ==================== تنظیمات سیستم ادامه‌دهی ====================
            const settings = {
                enableContinuation: options.enableContinuation !== false,
                maxContinuationFiles: options.maxContinuationFiles || 3,
                handleGaps: options.handleGaps !== false,
                useStagedStopLoss: options.useStagedStopLoss !== false,
                uploadedFiles: options.uploadedFiles || {},
                combinedFiles: options.combinedFiles || {},
                fileName: options.fileName || 'unknown',
                timezoneOffset: options.timezoneOffset || 0 // به دقیقه
            };

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

                // محاسبه درصد سود/ضرر
                const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

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
            function handleGapExit(position, candle, exitType) {
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
            function findNextFileByDate() {
                if (!marketData || marketData.length === 0) {
                    return null;
                }

                // پیدا کردن آخرین تاریخ فایل جاری
                const lastCandle = marketData[marketData.length - 1];
                const lastTimestamp = lastCandle.timestamp;
                const lastDate = new Date(lastTimestamp);

                // بررسی همه فایل‌ها
                const allFiles = { ...settings.uploadedFiles, ...settings.combinedFiles };
                let nextFile = null;
                let smallestGap = Infinity;

                Object.values(allFiles).forEach(fileInfo => {
                    if (!fileInfo.data || fileInfo.data.length === 0) return;

                    const firstCandle = fileInfo.data[0];
                    const firstDate = new Date(firstCandle.timestamp);

                    // فاصله زمانی (به میلی‌ثانیه)
                    const timeGap = firstDate - lastDate;

                    // اگر فایل بعدی است (بعد از تاریخ آخرین کندل) و نزدیک‌ترین است
                    if (timeGap > 0 && timeGap < smallestGap) {
                        // بررسی شکاف زمانی منطقی (حداکثر ۲ روز)
                        const maxGap = 2 * 24 * 60 * 60 * 1000; // ۲ روز
                        if (timeGap <= maxGap) {
                            smallestGap = timeGap;
                            nextFile = fileInfo;
                        }
                    }
                });

                return nextFile;
            }

            // ==================== تابع ادامه معاملات باز (با پشتیبانی از SELL) ====================
            function continueOpenTradesWithNextFile(openPositions, nextFileData, commission) {
                if (!openPositions || openPositions.length === 0) {
                    return { trades: [], remainingPositions: [] };
                }

                if (!nextFileData || nextFileData.length === 0) {
                    return { trades: [], remainingPositions: openPositions };
                }

                const closedTrades = [];
                const remainingPositions = [...openPositions];

                // پردازش هر کندل از فایل جدید
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
                                candleIndex: i,
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
            function getExitPriceAndReason(candle, position) {
                let exitPrice = 0;
                let exitReason = '';

                if (position.type === 'BUY') {
                    const hitStop = candle.low <= position.stopLoss;
                    const hitTake = candle.high >= position.takeProfit;

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
                    const hitTake = candle.low <= position.takeProfit;

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
            let dailyLoss = 0;
            let currentDay = null;
            let tradeCounter = 0;

            console.log("🚀 ===== شروع بکتست (نسخه کامل با اصلاح آینده‌نگری) =====");
            console.log(`📊 سرمایه اولیه: ${initialCapital}, ریسک: ${riskPerTrade}%, کارمزد: ${commission}%`);
            console.log(`📈 تعداد کندل‌ها: ${marketData.length}`);

            // آماده‌سازی خطوط روند
            prepareTrendLines(options.trendLines || {});

            // ==================== ساخت تابع استراتژی یک بار خارج از حلقه (بهبود کارایی) ====================
            const strategyFn = new Function('data', 'index', 'breakPointsParam', 'ichimokuParam', `
                function calculateSMA(data, endIndex, period) {
                    let sum = 0;
                    for (let i = 0; i < period; i++) {
                        if (endIndex - i < 0) return null;
                        sum += data[endIndex - i].close;
                    }
                    return sum / period;
                }

                function getTrendLines() {
                    return ${JSON.stringify(options.trendLines || {})};
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
                            chikouBullish: ichimokuData.chikou < ichimokuData.currentClose,
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
                            chikouBearish: ichimokuData.chikou > ichimokuData.currentClose
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

                const stopLossStages = ${JSON.stringify(stopLossStages)};

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
                        let stageStopLoss = calculateStopLossFromStages(entryPrice, currentPrice, stopLossStages);
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
                return customStrategy(data, index, breakPointsParam, ichimokuParam);
            `);

            // ==================== ذخیره تاریخچه ایچیموکو برای شیفت ابر ====================
            const ichimokuHistory = [];

            // ==================== حلقه اصلی بکتست ====================
            for (let i = 20; i < marketData.length; i++) {
                const candle = marketData[i];
                const currentDate = getDateString(candle.timestamp, options.timezoneOffset || 0);

                if (currentDay !== currentDate) {
                    dailyLoss = 0;
                    currentDay = currentDate;
                }

                if (dailyLoss <= -(options.maxDailyLoss || 5) / 100 * capital) {
                    continue;
                }

                // ==================== محاسبه ایچیموکو با شیفت ابر ====================
                let ichimoku = null;
                if (options.ichimoku?.enabled !== false) {
                    const raw = calculateIchimokuHistorical(marketData, i, {
                        tenkanPeriod: options.ichimoku?.tenkanPeriod || 14,
                        kijunPeriod: options.ichimoku?.kijunPeriod || 30,
                        senkouBPeriod: options.ichimoku?.senkouBPeriod || 57
                    });
                    ichimokuHistory.push(raw);
                    if (raw) {
                        ichimoku = {
                            tenkan: raw.tenkan,
                            kijun: raw.kijun,
                            chikou: raw.chikou,
                            currentClose: candle.close
                        };
                        // شیفت ابر به جلو (استفاده از مقدار ۲۶ کندل قبل)
                        if (i >= 26 && ichimokuHistory[i - 26]) {
                            const shifted = ichimokuHistory[i - 26];
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
                        // اصلاح مقایسه چیکو: چیکو با قیمت فعلی مقایسه شود
                        ichimoku.isChikouBullish = raw.chikou < candle.close;
                    }
                }

                // ==================== تشخیص شکست خطوط روند ====================
                if (processedTrendLines.length > 0) {
                    processedTrendLines.forEach(line => {
                        const breakInfo = detectTrendLineFirstBreak(line, i, candle);
                        if (breakInfo) {
                            if (!breakPointsMap[i]) breakPointsMap[i] = [];
                            breakPointsMap[i].push(breakInfo);
                        }
                    });
                }

                // ==================== اجرای استراتژی ====================
                try {
                    const signal = strategyFn(marketData, i, breakPointsMap, ichimoku);

                    // اعتبارسنجی سیگنال خروجی
                    if (signal && signal.signal) {
                        const isValid = signal.price > 0 &&
                                        signal.stopLoss > 0 &&
                           
                                        (signal.signal === 'BUY' || signal.signal === 'SELL') &&
                                        signal.stopLoss !== signal.price &&
                                        signal.takeProfit !== signal.price;
                        if (!isValid) {
                            console.warn(`⚠️ سیگنال نامعتبر در کندل ${i}`);
                            continue;
                        }
                    }

                    // ==================== مدیریت پوزیشن‌های باز ====================
                    for (let j = positions.length - 1; j >= 0; j--) {
                        const position = positions[j];
                        let shouldExit = false;
                        let exitPrice = 0;
                        let exitReason = '';

                        // 1. Gap Handling
                        if (settings.handleGaps) {
                            const gapCheck = handleGapExit(position, candle, 'stopLoss');
                            if (gapCheck.shouldExit) {
                                shouldExit = true;
                                exitPrice = gapCheck.exitPrice;
                                exitReason = gapCheck.exitReason;
                            }
                        }

                        // 2. برخورد درون کندل (با اولویت صحیح)
                        if (!shouldExit && position.takeProfit) {
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
                            console.log(`\n📊 معامله ${tradeCounter} (Fixed Risk):`);
                            console.log(`   نوع: ${position.type}`);
                            console.log(`   قیمت ورود: ${position.entryPrice.toFixed(4)}`);
                            console.log(`   قیمت خروج: ${exitPrice.toFixed(4)}`);
                            console.log(`   سود ناخالص: ${grossProfitPercent.toFixed(2)}%`);
                            console.log(`   کارمزد کل: ${totalCommPercent.toFixed(2)}%`);
                            console.log(`   سود خالص: ${netProfitPercent.toFixed(2)}%`);
                            console.log(`   دلیل خروج: ${exitReason}`);

                            if (netProfit < 0) {
                                dailyLoss += netProfit;
                            }

                            positions.splice(j, 1);
                        }
                    }

                    // ==================== باز کردن پوزیشن جدید (Fixed Risk) ====================
                    if (signal && signal.signal) {
                        if (!canOpenNewPosition(positions, signal.price)) {
                            console.log(`⚠️ ورود جدید در قیمت ${signal.price.toFixed(4)} ممنوع است (منطقه شلوغ)`);
                            continue;
                        }

                        const riskAmount = initialCapital * (riskPerTrade / 100);
                        const positionSize = riskAmount / Math.abs(signal.price - signal.stopLoss);
                        const requiredCapital = positionSize * signal.price * (commission / 100);

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
                                useStagedStopLoss: signal.useStagedStopLoss || false,
                                stopLossStages: signal.stopLossStages || stopLossStages,
                                ichimoku: ichimoku,
                                riskAmount: riskAmount,
                                riskPercent: riskPerTrade
                            };

                            positions.push(newPosition);
                            capital -= requiredCapital;

                            console.log(`🆕 پوزیشن Fixed Risk:`);
                            console.log(`   نوع: ${signal.signal} | قیمت: ${signal.price.toFixed(4)}`);
                            console.log(`   حجم: ${positionSize.toFixed(6)} | ریسک: $${riskAmount.toFixed(2)} (${riskPerTrade}%)`);
                        }
                    }

                } catch (error) {
                    console.error('❌ خطا در اجرای استراتژی در کندل', i, ':', error);
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

                while (remainingPositions.length > 0 && continuationCount < settings.maxContinuationFiles) {
                    // پیدا کردن فایل بعدی
                    const nextFile = findNextFileByDate();
                    if (!nextFile) break;

                    console.log(`📂 ادامه با فایل: ${nextFile.fileName} (${nextFile.data.length} کندل)`);

                    const continuationResult = continueOpenTradesWithNextFile(
                        remainingPositions,
                        nextFile.data,
                        commission
                    );

                    // اضافه کردن معاملات بسته شده
                    trades.push(...continuationResult.trades);

                    // به‌روزرسانی capital برای معاملات بسته شده
                    continuationResult.trades.forEach(t => {
                        capital += t.profit;
                    });

                    // به‌روزرسانی پوزیشن‌ها
                    remainingPositions = continuationResult.remainingPositions;

                    // به‌روزرسانی data برای پیدا کردن فایل بعدی
                    currentData = nextFile.data;

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
                    console.log(`   معامله ${index + 1}: ${position.type} ${exitPrice.toFixed(4)} (${netProfitPercent.toFixed(2)}%)`);
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
            let currentDrawdown = 0;
            closedTrades.forEach(trade => {
                if (trade.profit < 0) {
                    currentDrawdown += Math.abs(trade.profitPercent);
                } else {
                    if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
                    currentDrawdown = 0;
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
                }
            };

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
            console.log("\n" + "=".repeat(60));
            console.log(`💰 سرمایه اولیه: ${initialCapital.toFixed(2)}`);
            console.log(`💰 سرمایه نهایی: ${capital.toFixed(2)}`);
            console.log(`📊 بازدهی کل: ${((capital - initialCapital) / initialCapital * 100).toFixed(2)}%`);
            console.log("=".repeat(60) + "\n");

            resolve(result);

        } catch (error) {
            console.error('❌ [BACKTEST_ERROR] خطا در اجرای بکتست:', error);
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
    debugTrendLines
};
