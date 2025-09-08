// tvClient.js
// TradingView scanner client (browser-like headers, retries, fixed columns)
// ⚠️ НЕ ЧІПАТИ без крайньої потреби.

const TV_URL =
  "https://scanner.tradingview.com/america/scan?label-product=underchart-screener-stock";

const BROWSER_HEADERS_BASE = {
  accept: "text/plain, */*; q=0.01",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  // тіло — JSON (не form-urlencoded)
  "content-type": "application/json",
  "sec-ch-ua":
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  origin: "https://www.tradingview.com",
  referer: "https://www.tradingview.com/",
};

// (!) опційно — якщо заданий COOKIE у .env, вийде ще більш «браузерно»
const COOKIE = (process.env.COOKIE || "").trim();

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
  "fundamental_currency_code"// d[26]
]);

// Маппер: гарантуємо сталі індекси
function mapRow(row) {
  const d = row.d || [];
  return Object.freeze({
    symbol: row.s,                                // "NASDAQ:XXX"
    premarket_change: Number(d[3] || 0),          // %
    premarket_volume: Number(d[5] || 0),
    float_shares_outstanding: Number(d[8] || 0),
  });
}

// Низькорівневий fetch з ретраями, referrer/referrerPolicy і логами
async function fetchWithBrowserHeaders(bodyObj, { timeoutMs = 12000, retries = 2 } = {}) {
  const headers = { ...BROWSER_HEADERS_BASE };
  if (COOKIE) headers.cookie = COOKIE;

  const payload = JSON.stringify(bodyObj);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ts = nowTs();
    const { signal, cancel } = withTimeout(timeoutMs);
    try {
      console.log(`[${ts}] → TV request (try ${attempt + 1}/${retries + 1})`);
      const res = await fetch(TV_URL, {
        method: "POST",
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
    filter: [
      { left: "type", operation: "equal", right: "stock" },
      { left: "subtype", operation: "in_range", right: ["common", "foreign-issuer"] },
      { left: "exchange", operation: "in_range", right: ["AMEX", "NASDAQ", "NYSE"] },
      { left: "is_primary", operation: "equal", right: true },
      { left: "active_symbol", operation: "equal", right: true },
      { left: "premarket_change", operation: "egreater", right: preMarketThreshold },
      { left: "premarket_close", operation: "egreater", right: 0.8 },
      { left: "premarket_volume", operation: "greater", right: 50000 },
    ],
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: COLUMNS,
    sort: { sortBy: "premarket_change", sortOrder: "desc" },
    range: [0, 150],
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
