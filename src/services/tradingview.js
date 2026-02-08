// tvClient.js
// TradingView scanner client (browser-like headers, retries, fixed columns)
// ⚠️ НЕ ЧІПАТИ без крайньої потреби.

const TV_URL =
    "https://scanner.tradingview.com/america/scan?label-product=underchart-screener-stock";

const BROWSER_HEADERS_BASE = {
    accept: "text/plain, */*; q=0.01",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    cookie: `cookiePrivacyPreferenceBannerProduction=notApplicable; _ga=GA1.1.1233116757.1734004669; cookiesSettings={"analytics":true,"advertising":true}; device_t=R0VrSjow.AAizKRrP0uQcTMAq1xE_Rjot7iZf-AglGFRZUXnmoLQ; sessionid=ps3tjml9pwgo0eia4474mmd8cz5cmnnw; sessionid_sign=v3:UWVBmsuemtowX2lH7FeQlIE+mod/yTkzuvn/YW7nwYY=; cachec=undefined; etg=undefined; _sp_ses.cf1a=*; __gads=ID=d2876515cc6b00e5:T=1734433395:RT=1735294276:S=ALNI_MbXqBgw-APh_FTuE7tMjJ1dEvaIwQ; __gpi=UID=00000f6eb8318f38:T=1734433395:RT=1735294276:S=ALNI_MZhEybiU55qAQ2c4QrdylUZ6R9Fsw; __eoi=ID=5a818a91a5f23c95:T=1734433395:RT=1735294276:S=AA-AfjYNnLIQmiLzNa53s5Vtmxt_; _ga_YVVRYGL0E0=GS1.1.1735289226.39.1.1735299449.55.0.0; _sp_id.cf1a=8df46967-1481-48be-87d0-9dfa6267ef39.1734004669.27.1735299474.1735251939.91ba81de-eea2-4a01-85bf-4a3543965ef8.a370f917-9108-4b3f-a764-2cf59b92873d.4a6adab4-366d-4358-9a76-61d4485455b0.1735289226513.1140`,
    priority: "u=1, i",
    "sec-ch-ua":
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
};

// (!) опційно — якщо заданий COOKIE у .env, вийде ще більш «браузерно»
// const COOKIE = (process.env.COOKIE || "").trim();

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
const COLUMNS = Object.freeze([
    "name",                    // d[0]
    "close",                   // d[1]
    "change",                  // d[2]
    "premarket_change",        // d[3]
    "premarket_change_from_open", // d[4]
    "premarket_volume",        // d[5]
    "Value.Traded",            // d[6]
    "change_abs",              // d[7]
    "float_shares_outstanding",// d[8]
    "Recommend.All",           // d[9]
    "volume",                  // d[10]
    "market_cap_basic",        // d[11]
    "sector",                  // d[12]
    "relative_volume_10d_calc",// d[13]
    "change|5",                // d[14]
    "change|1",                // d[15]
    "relative_volume_intraday|5", // d[16]
    "description",             // d[17]
    "type",                    // d[18]
    "subtype",                 // d[19]
    "update_mode",             // d[20]
    "pricescale",              // d[21]
    "minmov",                  // d[22]
    "fractional",              // d[23]
    "minmove2",                // d[24]
    "currency",                // d[25]
    "fundamental_currency_code", // d[26]
    "premarket_close"// d[27]
]);

// Маппер: гарантуємо сталі індекси
function mapRow(row) {
    const d = row.d || [];
    return Object.freeze({
        symbol: row.s,                                // "NASDAQ:XXX"
        premarket_change: Number(d[3] || 0),          // %
        premarket_volume: Number(d[5] || 0),
        float_shares_outstanding: Number(d[8] || 0),
        premarket_close: Number(d[27] || 0),          // price
    });
}

// Низькорівневий fetch з ретраями, referrer/referrerPolicy і логами
async function fetchWithBrowserHeaders(bodyObj, { timeoutMs = 12000, retries = 2 } = {}) {
    const headers = { ...BROWSER_HEADERS_BASE };
    // if (COOKIE) headers.cookie = COOKIE;

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

// Публічний API модуля: один стабільний метод
async function getStocks10(preMarketThreshold = 10) {
    const body = {
        columns: COLUMNS,
        filter: [
            { left: "premarket_volume", operation: "greater", right: 50000 },
            { left: "premarket_change", operation: "greater", right: preMarketThreshold },
            { left: "premarket_close", operation: "egreater", right: 0.8 }
        ],
        filter2: {
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
                        }
                    ]
                }
            }]
        },
        ignore_unknown_fields: false,
        options: { lang: "en" },
        range: [0, 100],
        sort: { sortBy: "premarket_change", sortOrder: "desc" },
        symbols: {},
        markets: ["america"]
    };

    const t0 = Date.now();
    const data = await fetchWithBrowserHeaders(body, { timeoutMs: 12000, retries: 2 });
    const dt = Date.now() - t0;

    const rows = Array.isArray(data?.data) ? data.data : [];
    console.log(`[${nowTs()}] ✓ TV ok in ${dt}ms, totalCount=${data?.totalCount ?? "n/a"}, rows=${rows.length}`);
    return rows;
}

// Freeze експорт, щоб не мутували випадково
export const TvScanner = Object.freeze({
    getStocks10,
    mapRow,
});
