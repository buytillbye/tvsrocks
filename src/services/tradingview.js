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
// Market Scanner — колонки для Market-годин
// =============================================================================
const COLUMNS_MARKET = Object.freeze([
    "ticker-view",                    // idx 0
    "close",                          // idx 1
    "type",                           // idx 2
    "typespecs",                      // idx 3
    "pricescale",                     // idx 4
    "minmov",                         // idx 5
    "fractional",                     // idx 6
    "minmove2",                       // idx 7
    "currency",                       // idx 8
    "Value.Traded",                   // idx 9
    "relative_volume_intraday|5",     // idx 10
    "volume",                         // idx 11
    "float_shares_outstanding_current", // idx 12
    "float_shares_percent_current",   // idx 13
    "relative_volume_10d_calc",       // idx 14
    "change",                         // idx 15
    "change_from_open",               // idx 16
    "market_cap_basic",               // idx 17
    "fundamental_currency_code",      // idx 18
    "premarket_volume",               // idx 19
    "premarket_change",               // idx 20
    "ATRP",                           // idx 21
    "average_volume_10d_calc",        // idx 22
    "ATR",                            // idx 23
    "volume_change",                  // idx 24
    "gap"                             // idx 25
]);

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
async function fetchWithBrowserHeaders(bodyObj, { timeoutMs = 20000, retries = 2, cookie = null } = {}) {
    const headers = { ...BROWSER_HEADERS_BASE };
    if (cookie) headers.cookie = cookie;

    const payload = JSON.stringify(bodyObj);

    for (let attempt = 0; attempt <= retries; attempt++) {
        const { signal, cancel } = withTimeout(timeoutMs);
        try {
            console.log(`[${nowTs()}] [TV] → request (try ${attempt + 1}/${retries + 1})`);
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
            console.log(`[${nowTs()}] [TV] ← status=${res.status} len=${text.length}`);

            if (!res.ok) {
                if (res.status === 429) console.error(`[${nowTs()}] [TV] Rate limited (429). Збільш інтервал/додай backoff.`);
                if (res.status === 403) console.error(`[${nowTs()}] [TV] Forbidden (403). Перевір cookie/заголовки.`);
                if (res.status === 401) console.error(`[${nowTs()}] [TV] Unauthorized (401). COOKIE протух/некоректний.`);
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            }
            try {
                return JSON.parse(text);
            } catch {
                throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
            }
        } catch (e) {
            console.error(`[${nowTs()}] [TV] ✖ fetch error: ${e.message}`);
            if (attempt < retries) {
                const wait = 1000 * Math.pow(2, attempt);
                console.log(`[${nowTs()}] [TV] ⏳ retry in ${wait}ms`);
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
// Market Scanner — отримання даних для Market-годин
// =============================================================================
async function getMarketStocks(config) {
    const body = {
        columns: COLUMNS_MARKET,
        filter: [
            { left: "close", operation: "egreater", right: 1 },
            { left: "volume", operation: "greater", right: 1000000 },
            { left: "relative_volume_intraday|5", operation: "greater", right: 1.5 },
            { left: "is_primary", operation: "equal", right: true }
        ],
        filter2: BASE_FILTER2,
        ignore_unknown_fields: false,
        options: { lang: "en" },
        range: [0, 100],
        sort: { sortBy: "Value.Traded", sortOrder: "desc" },
        symbols: {},
        markets: ["america"]
    };

    const t0 = Date.now();
    const data = await fetchWithBrowserHeaders(body, {
        timeoutMs: 15000,
        retries: 2,
        cookie: config?.api?.tvCookie
    });
    const dt = Date.now() - t0;

    const rows = Array.isArray(data?.data) ? data.data : [];
    const totalCount = data?.totalCount ?? 0;
    console.log(`[${nowTs()}] ✓ Market scan ok in ${dt}ms, totalCount=${totalCount}, rows=${rows.length}`);
    return { data: rows, totalCount };
}

// Маппер для Market (індекси за COLUMNS_MARKET)
function mapMarketRow(row) {
    const d = row.d || [];
    return Object.freeze({
        symbol: row.s,
        close: Number(d[1] || 0),
        value_traded: Number(d[9] || 0),
        rvol_intraday_5m: Number(d[10] || 0),
        volume: Number(d[11] || 0),
        float_shares_outstanding: Number(d[12] || 0),
        float_shares_percent: Number(d[13] || 0),
        relative_volume_10d: Number(d[14] || 0),
        change: Number(d[15] || 0),
        change_from_open: Number(d[16] || 0),
        market_cap: Number(d[17] || 0),
        premarket_volume: Number(d[19] || 0),
        premarket_change: Number(d[20] || 0),
        atrp: Number(d[21] || 0),
        average_volume_10d: Number(d[22] || 0),
        atr: Number(d[23] || 0),
        volume_change: Number(d[24] || 0),
        gap: Number(d[25] || 0),
    });
}

// =============================================================================
// Catalyst Sniper — отримання кандидатів для Watchlist (Pre-market)
// =============================================================================
async function getCatalystSetupStocks(config) {
    const body = {
        columns: COLUMNS_PREMARKET,
        filter: [
            {
                operation: "or",
                operands: [
                    { left: "premarket_change", operation: "greater", right: 4 },   // Strategy A: Gap Up
                    { left: "premarket_change", operation: "less", right: -8 }     // Strategy B: Gap Down
                ]
            },
            { left: "premarket_volume", operation: "greater", right: 500000 },
            { left: "is_primary", operation: "equal", right: true }
        ],
        filter2: BASE_FILTER2,
        ignore_unknown_fields: false,
        options: { lang: "en" },
        range: [0, 100],
        sort: { sortBy: "premarket_volume", sortOrder: "desc" },
        symbols: {},
        markets: ["america"]
    };

    const data = await fetchWithBrowserHeaders(body, {
        timeoutMs: 15000,
        retries: 2,
        cookie: config?.api?.tvCookie
    });

    return {
        data: Array.isArray(data?.data) ? data.data : [],
        totalCount: data?.totalCount ?? 0
    };
}

// Freeze експорт, щоб не мутували випадково
export const TvScanner = Object.freeze({
    getStocks10,
    getMarketStocks,
    getCatalystSetupStocks,
    mapRow,
    mapMarketRow,
});
