// tvClient.js
// TradingView scanner client (browser-like headers, retries, fixed columns)
// ⚠️ НЕ ЧІПАТИ без крайньої потреби.

const TV_URL =
    "https://scanner.tradingview.com/america/scan?label-product=popup-screener-stock";

const BROWSER_HEADERS_BASE = {
    accept: "application/json",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "content-type": "text/plain;charset=UTF-8",
    priority: "u=1, i",
    "sec-ch-ua":
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
};

function nowTs() {
    return new Date().toISOString().split("T")[1].split(".")[0];
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function withTimeout(ms = 12000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

// Фіксований набір колонок (без "symbol" — символ приходить у row.s)
// Фіксований набір колонок для Premarket (з трасування браузера)
const COLUMNS_PREMARKET = Object.freeze([
    "ticker-view", "premarket_change", "float_shares_outstanding_current", "close",
    "type", "typespecs", "pricescale", "minmov", "fractional", "minmove2",
    "currency", "premarket_volume", "market_cap_basic", "fundamental_currency_code",
    "volume", "average_volume_10d_calc", "change", "relative_volume_10d_calc",
    "sector.tr", "market", "sector", "premarket_close", "change_from_open"
]);

// =============================================================================
// [DISABLED] Market Scanner — RVOL columns (will be rewritten)
// =============================================================================
// const COLUMNS_RVOL = Object.freeze([
//     "ticker-view", "Value.Traded", "type", "typespecs", "currency",
//     "relative_volume_10d_calc", "relative_volume_intraday|5", "volume",
//     "close", "pricescale", "minmov", "fractional", "minmove2", "change",
//     "float_shares_outstanding_current", "premarket_volume", "market_cap_basic",
//     "fundamental_currency_code", "premarket_change", "change_from_open",
//     "ATRP", "average_volume_10d_calc", "ATR", "volume_change", "gap"
// ]);

// Маппер для Premarket (індекси за COLUMNS_PREMARKET)
function mapRow(row) {
    const d = row.d || [];
    return Object.freeze({
        symbol: row.s,                                // "NASDAQ:XXX"
        premarket_change: Number(d[1] || 0),          // idx 1
        premarket_volume: Number(d[11] || 0),         // idx 11
        float_shares_outstanding: Number(d[2] || 0),  // idx 2 (float_shares_outstanding_current)
        premarket_close: Number(d[21] || 0),          // idx 21 (premarket_close)
    });
}

// Низькорівневий fetch з ретраями, referrer/referrerPolicy і логами
async function fetchWithBrowserHeaders(bodyObj, { timeoutMs = 12000, retries = 2, cookie = null } = {}) {
    const headers = { ...BROWSER_HEADERS_BASE };
    if (cookie) headers.cookie = cookie;

    const payload = JSON.stringify(bodyObj);

    for (let attempt = 0; attempt <= retries; attempt++) {
        const ts = nowTs();
        const { signal, cancel } = withTimeout(timeoutMs);
        try {
            console.log(`[${ts}] → TV request (try ${attempt + 1}/${retries + 1})`);
            const res = await fetch(TV_URL, {
                method: "POST",
                mode: "cors",
                credentials: "include",
                signal,
                headers,
                referrer: "https://www.tradingview.com/",
                referrerPolicy: "origin-when-cross-origin",
                body: payload,
            });
            const text = await res.text();
            console.log(`[${ts}] ← TV status=${res.status} len=${text.length}`);

            if (!res.ok) {
                if (res.status === 429) console.error("Rate limited (429). Збільш інтервал/додай backoff.");
                if (res.status === 403) console.error("Forbidden (403). Перевір cookie/заголовки або спробуй без cookie.");
                if (res.status === 401) console.error("Unauthorized (401). Можливо, COOKIE протух/некоректний.");
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            }
            try {
                return JSON.parse(text);
            } catch {
                throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
            }
        } catch (e) {
            console.error(`[${ts}] ✖ fetch error:`, e.message);
            if (attempt < retries) {
                const wait = 1000 * Math.pow(2, attempt);
                console.log(`[${ts}] ⏳ retry in ${wait}ms`);
                await sleep(wait);
                continue;
            }
            throw e;
        } finally {
            cancel();
        }
    }
}

// Shared stock type filters
const BASE_FILTER2 = {
    operator: "and",
    operands: [{
        operation: {
            operator: "or",
            operands: [
                {
                    operation: {
                        operator: "and",
                        operands: [
                            { expression: { left: "type", operation: "equal", right: "stock" } },
                            { expression: { left: "typespecs", operation: "has", right: ["common"] } }
                        ]
                    }
                },
                {
                    operation: {
                        operator: "and",
                        operands: [
                            { expression: { left: "type", operation: "equal", right: "stock" } },
                            { expression: { left: "typespecs", operation: "has", right: ["preferred"] } }
                        ]
                    }
                },
                {
                    operation: {
                        operator: "and",
                        operands: [
                            { expression: { left: "type", operation: "equal", right: "dr" } }
                        ]
                    }
                },
                {
                    operation: {
                        operator: "and",
                        operands: [
                            { expression: { left: "type", operation: "equal", right: "fund" } },
                            { expression: { left: "typespecs", operation: "has_none_of", right: ["etf"] } }
                        ]
                    }
                }
            ]
        }
    },
    { expression: { left: "typespecs", operation: "has_none_of", right: ["pre-ipo"] } }
    ]
};

// Публічний API модуля: один стабільний метод
async function getStocks10(config, preMarketThreshold) {
    const threshold = preMarketThreshold ?? config.premarketThreshold ?? 10;
    const body = {
        columns: COLUMNS_PREMARKET,
        filter: [
            { left: "premarket_volume", operation: "greater", right: 50000 },
            { left: "premarket_change", operation: "greater", right: threshold },
            { left: "premarket_close", operation: "egreater", right: 0.8 },
            { left: "is_primary", operation: "equal", right: true } // Avoid duplicates from secondary listings
        ],
        filter2: BASE_FILTER2,
        ignore_unknown_fields: false,
        options: { lang: "en" },
        range: [0, 100],
        sort: { sortBy: "premarket_change", sortOrder: "desc" },
        symbols: {},
        markets: ["america"]
    };

    const t0 = Date.now();
    const data = await fetchWithBrowserHeaders(body, {
        timeoutMs: 12000,
        retries: 2,
        cookie: config?.api?.tvCookie
    });
    const dt = Date.now() - t0;

    const rows = Array.isArray(data?.data) ? data.data : [];
    const totalCount = data?.totalCount ?? 0;
    console.log(`[${nowTs()}] ✓ TV ok in ${dt}ms, totalCount=${totalCount}, rows=${rows.length}`);
    return { data: rows, totalCount };
}

// =============================================================================
// [DISABLED] Market Scanner — RVOL methods (will be rewritten)
// =============================================================================
// async function getRvolSurgeStocks(config, rvolThreshold) {
//     const threshold = rvolThreshold ?? config.rvolThreshold ?? 3;
//     const body = {
//         columns: COLUMNS_RVOL,
//         filter: [
//             { left: "close", operation: "egreater", right: 1 },
//             { left: "volume", operation: "greater", right: 5000000 },
//             { left: "relative_volume_intraday|5", operation: "greater", right: threshold },
//             { left: "is_primary", operation: "equal", right: true }
//         ],
//         ignore_unknown_fields: false,
//         options: { lang: "en" },
//         range: [0, 200],
//         sort: { sortBy: "relative_volume_intraday|5", sortOrder: "desc" },
//         symbols: {},
//         markets: ["america"],
//         filter2: BASE_FILTER2
//     };
//
//     const t0 = Date.now();
//     const data = await fetchWithBrowserHeaders(body, {
//         timeoutMs: 15000,
//         retries: 2,
//         cookie: config?.api?.tvCookie
//     });
//     const dt = Date.now() - t0;
//
//     const rows = Array.isArray(data?.data) ? data.data : [];
//     const totalCount = data?.totalCount ?? 0;
//     console.log(`[${nowTs()}] ✓ RVOL scan ok in ${dt}ms, totalCount=${totalCount}, rows=${rows.length}`);
//     return { data: rows, totalCount };
// }
//
// function mapRvolRow(row) {
//     const d = row.d || [];
//     return Object.freeze({
//         symbol: row.s,
//         close: Number(d[8] || 0),
//         rvol_intraday_5m: Number(d[6] || 0),
//         volume: Number(d[7] || 0),
//         change: Number(d[13] || 0),
//         premarket_change: Number(d[18] || 0),
//         float_shares_outstanding: Number(d[14] || 0),
//     });
// }

// Freeze експорт, щоб не мутували випадково
export const TvScanner = Object.freeze({
    getStocks10,
    // getRvolSurgeStocks,  // [DISABLED] Market Scanner
    mapRow,
    // mapRvolRow,          // [DISABLED] Market Scanner
});
