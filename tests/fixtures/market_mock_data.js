/**
 * @fileoverview Mock market data fixture based on real TradingView API response
 * Used by stress tests to simulate market scanner behavior without live API calls
 * 
 * Data structure matches COLUMNS_MARKET:
 *   d[0]=ticker-view, d[1]=close, d[2]=type, d[3]=typespecs, d[4]=pricescale,
 *   d[5]=minmov, d[6]=fractional, d[7]=minmove2, d[8]=currency,
 *   d[9]=Value.Traded, d[10]=relative_volume_intraday|5, d[11]=volume,
 *   d[12]=float_shares_outstanding, d[13]=float_shares_percent, d[14]=rvol_10d,
 *   d[15]=change, d[16]=change_from_open, d[17]=market_cap, d[18]=fundamental_currency,
 *   d[19]=premarket_volume, d[20]=premarket_change, d[21]=ATRP,
 *   d[22]=average_volume_10d, d[23]=ATR, d[24]=volume_change, d[25]=gap
 */

// ── Helper: strip d[0] ticker-view object, keep only numeric/string fields ──
const mkRow = (symbol, d) => ({ s: symbol, d });

// ── BASELINE DATA (Snapshot 1 — "market open") ──────────────────────────────
export const BASELINE_RESPONSE = {
    totalCount: 47,
    data: [
        mkRow("NYSE:THS", [
            null, 24.43, "stock", ["common"], 100, 1, "false", 0, "USD",
            706996846.57, 13.37, 28939699, 49937019.35, 98.91,
            28.79, -0.08, -0.49, 1233368360.78, "USD",
            null, null, 0.90, 3858553, 0.22, 1041.18, 0.41
        ]),
        mkRow("NASDAQ:NKTR", [
            null, 56.00, "stock", ["common"], 100, 1, "false", 0, "USD",
            486928176.00, 13.57, 8695146, 20043656.58, 98.54,
            14.11, 51.07, 18.77, 1139128973.08, "USD",
            884632, 27.33, 6.82, 1429168, 3.82, 1721.25, 27.19
        ]),
        mkRow("NYSE:EVMN", [
            null, 29.03, "stock", ["common"], 100, 1, "false", 0, "USD",
            462543118.40, 29.56, 15933280, 17746867.01, 56.30,
            49.80, 70.87, -1.66, 915144426.51, "USD",
            2485354, 72.75, 10.55, 1874409.1, 3.06, 7534.72, 73.75
        ]),
        mkRow("NYSE:KD", [
            null, 11.12, "stock", ["common"], 100, 1, "false", 0, "USD",
            369589235.04, 4.17, 33236442, 223982320.48, 97.99,
            3.63, 5.00, 4.51, 2541635567.27, "USD",
            218294, 0.47, 17.41, 12251541.5, 1.94, -45.49, 0.47
        ]),
        mkRow("NYSE:OSCR", [
            null, 12.88, "stock", ["common"], 100, 1, "false", 0, "USD",
            340938803.52, 3.00, 26470404, 210797979.75, 92.05,
            3.20, 1.74, -4.59, 2949648694.19, "USD",
            2920239, 7.42, 6.78, 10136603.3, 0.87, 69.62, 6.64
        ]),
        mkRow("NASDAQ:UPWK", [
            null, 15.21, "stock", ["common"], 100, 1, "false", 0, "USD",
            293961899.00, 7.32, 19333239, 121260121.57, 92.81,
            5.32, -19.08, 1.37, 1986607497.17, "USD",
            648566, -20.70, 8.83, 5321002.5, 1.34, 144.66, -20.17
        ]),
        mkRow("NASDAQ:GTM", [
            null, 6.63, "stock", ["common"], 100, 1, "false", 0, "USD",
            247327595.19, 4.38, 37304313, 258199046.71, 82.86,
            3.89, -9.43, 9.68, 2065858517.74, "USD",
            1289304, -16.94, 8.22, 12858600.3, 0.55, 113.38, -17.42
        ]),
        mkRow("NASDAQ:MBIN", [
            null, 46.32, "stock", ["common"], 100, 1, "false", 0, "USD",
            246689249.52, 4.75, 5325761, 20690476.61, 45.09,
            13.62, 2.80, 3.53, 2125589496.68, "USD",
            100, -0.24, 3.67, 896295.9, 1.70, 292.94, -0.71
        ]),
        mkRow("NASDAQ:ICHR", [
            null, 45.27, "stock", ["common"], 100, 1, "false", 0, "USD",
            244917399.96, 6.92, 5410148, 33243607.32, 96.68,
            5.55, 32.72, 7.22, 1556574191.24, "USD",
            167938, 23.13, 6.97, 1419289.8, 3.15, 237.02, 23.78
        ]),
        mkRow("NASDAQ:GT", [
            null, 9.10, "stock", ["common"], 100, 1, "false", 0, "USD",
            215272839.60, 4.18, 23656356, 274837323.07, 96.04,
            3.49, -13.50, -0.96, 2604064478.05, "USD",
            410007, -12.26, 4.49, 8776779.2, 0.41, 105.18, -12.66
        ]),
        mkRow("NASDAQ:JZXN", [
            null, 2.58, "stock", ["common"], 100, 1, "false", 0, "USD",
            198182862.54, 56.59, 76815063, 1391525.59, 99.91,
            27.01, 89.71, 54.95, 3593418.31, "USD",
            994263, 22.43, 16.80, 9997526.6, 0.43, 4641.64, 22.43
        ]),
        mkRow("NASDAQ:PHIO", [
            null, 1.12, "stock", ["common"], 10000, 1, "false", 0, "USD",
            180571891.36, 464.74, 161224903, 9519249.56, 88.43,
            729.82, 24.44, -20.57, 12056159.11, "USD",
            53399887, 55.56, 9.29, 16321302.7, 0.10, 157315.45, 56.67
        ]),
        mkRow("NYSE:CCO", [
            null, 2.36, "stock", ["common"], 100, 1, "false", 0, "USD",
            151879683.28, 23.99, 64355798, 371739465.94, 74.75,
            23.55, 7.76, -0.42, 1173640245.06, "USD",
            10738049, 8.22, 4.87, 9038265.6, 0.11, 2843.71, 8.22
        ]),
        mkRow("NYSE:SDRL", [
            null, 40.20, "stock", ["common"], 100, 1, "false", 0, "USD",
            140296673.40, 4.86, 3489967, null, null,
            3.58, -2.38, -2.43, 2497860842.00, "USD",
            15257, 0.34, 4.39, 1249418.7, 1.77, 21.50, 0.05
        ]),
        mkRow("NASDAQ:ABP", [
            null, 1.67, "stock", ["common"], 100, 1, "false", 0, "USD",
            123757549.39, 876.71, 74106317, 1731333.87, 63.74,
            50.11, 9.87, -34.77, 4536184.74, "USD",
            16403062, 68.42, 25.96, 8886884, 0.43, 420.88, 68.42
        ]),
        mkRow("NYSE:HGV", [
            null, 46.73, "stock", ["common"], 100, 1, "false", 0, "USD",
            121962683.12, 4.52, 2609944, 65573918.74, 76.66,
            3.55, -0.38, -1.06, 3997428620.70, "USD",
            null, null, 3.20, 938264.1, 1.50, 330.40, 0.68
        ]),
        mkRow("NASDAQ:GSHD", [
            null, 50.02, "stock", ["common"], 100, 1, "false", 0, "USD",
            83386141.12, 7.00, 1667056, 23549172.97, 94.54,
            4.66, -12.93, -12.25, 1842930914.17, "USD",
            100, -0.61, 7.43, 482500, 3.72, 129.62, -0.78
        ]),
        mkRow("NASDAQ:TECX", [
            null, 21.05, "stock", ["common"], 100, 1, "false", 0, "USD",
            73206890.10, 9.83, 3477762, 10609877.43, 56.69,
            9.93, -15.22, 21.68, 393977692.81, "USD",
            615054, -31.90, 10.54, 676306.7, 2.22, 1203.80, -30.33
        ]),
        mkRow("NYSE:VSTS", [
            null, 8.50, "stock", ["common"], 100, 1, "false", 0, "USD",
            67856826.00, 4.51, 7983156, 129967594.72, 98.50,
            3.65, 16.12, -5.45, 1121566050.61, "USD",
            45540, 22.95, 5.85, 2751533, 0.50, 256.89, 22.81
        ]),
        mkRow("NYSE:XIFR", [
            null, 11.12, "stock", ["common"], 100, 1, "false", 0, "USD",
            67564163.68, 5.07, 6075914, 86209191.78, 91.74,
            3.62, 9.23, 5.90, 2143359800.49, "USD",
            10239, 1.67, 3.30, 2185672.2, 0.37, 158.36, 3.14
        ]),
        mkRow("NASDAQ:EWCZ", [
            null, 5.72, "stock", ["common"], 100, 1, "false", 0, "USD",
            66941571.84, 23.12, 11703072, 28708769.49, 65.71,
            25.38, 43.00, -0.26, 310941027.54, "USD",
            3335171, 43.25, 5.14, 1597943.5, 0.29, 4502.67, 43.38
        ]),
        mkRow("NASDAQ:GILT", [
            null, 15.04, "stock", ["common"], 100, 1, "false", 0, "USD",
            51314690.24, 3.16, 3411881, 63667083.74, 87.04,
            3.06, -21.95, -7.39, 1100084366.83, "USD",
            147460, -15.62, 9.00, 1362316.4, 1.35, 290.65, -15.72
        ]),
        mkRow("NASDAQ:MBOT", [
            null, 2.05, "stock", ["common"], 100, 1, "false", 0, "USD",
            43668005.30, 10.06, 21301466, 61018952.90, 90.86,
            17.77, 11.41, 2.50, 137674005.84, "USD",
            7089228, 9.24, 6.38, 3201060.3, 0.13, 1703.38, 8.70
        ]),
        mkRow("NYSE:YEXT", [
            null, 5.61, "stock", ["common"], 100, 1, "false", 0, "USD",
            43240668.24, 3.80, 7707784, 102300838.99, 83.42,
            3.63, 14.26, -0.36, 687937442.58, "USD",
            682574, 14.05, 5.77, 2813693.9, 0.32, 323.97, 14.66
        ]),
    ]
};

// ── SCENARIO: RVOL SPIKE — NKTR rvol jumps from 13.57 → 25 ─────────────────
export const createRvolSpikeData = (baseData) => {
    const data = JSON.parse(JSON.stringify(baseData));
    // Find NKTR and spike its RVOL 5m (index 10)
    const nktr = data.data.find(r => r.s === "NASDAQ:NKTR");
    if (nktr) nktr.d[10] = 25.0; // was 13.57 → +11.43 (>5 delta → PUMP trigger)
    return data;
};

// ── SCENARIO: PRICE DUMP — JZXN price drops from $2.58 → $2.40 (≈-7%) ──────
export const createPriceDumpData = (baseData) => {
    const data = JSON.parse(JSON.stringify(baseData));
    const jzxn = data.data.find(r => r.s === "NASDAQ:JZXN");
    if (jzxn) {
        jzxn.d[1] = 2.40;   // close drops
        jzxn.d[16] = 44.0;  // change_from_open drops from 54.95 to ~44
    }
    return data;
};

// ── SCENARIO: NEW ENTRANT — add a brand-new ticker (TSLA) at top ────────────
export const createNewEntrantData = (baseData) => {
    const data = JSON.parse(JSON.stringify(baseData));
    data.data.unshift(mkRow("NASDAQ:TSLA", [
        null, 320.50, "stock", ["common"], 100, 1, "false", 0, "USD",
        900000000.00, 18.50, 45000000, 500000000, 95.0,
        12.0, 15.50, 8.25, 1000000000000.00, "USD",
        500000, 3.5, 5.5, 8000000, 12.50, 350.0, 4.0
    ]));
    data.totalCount += 1;
    return data;
};

// ── SCENARIO: DEAD ZONE — all changes become tiny (±0.3%) ───────────────────
export const createDeadZoneData = (baseData) => {
    const data = JSON.parse(JSON.stringify(baseData));
    for (const row of data.data) {
        row.d[16] = 0.1 + Math.random() * 0.3; // change_from_open: 0.1–0.4%
        row.d[10] = 1.0 + Math.random() * 0.5;  // rvol: 1.0–1.5 (below threshold)
        row.d[9] = 5000000;                       // value_traded: $5M (below $10M gate)
    }
    return data;
};

// ── SCENARIO: NULL / EDGE CASES — missing fields ────────────────────────────
export const createEdgeCaseData = (baseData) => {
    const data = JSON.parse(JSON.stringify(baseData));
    // Stock with null rvol
    if (data.data[0]) data.data[0].d[10] = null;
    // Stock with null value_traded
    if (data.data[1]) data.data[1].d[9] = null;
    // Stock with null change_from_open
    if (data.data[2]) data.data[2].d[16] = null;
    // Penny stock (price < $2)
    if (data.data[3]) data.data[3].d[1] = 0.50;
    // Stock with undefined d array
    if (data.data.length > 20) data.data[20] = { s: "NASDAQ:BROKEN", d: undefined };
    return data;
};

// ── SCENARIO: MASSIVE SWING — multiple stocks with extreme values ───────────
export const createMassiveSwingData = (baseData) => {
    const data = JSON.parse(JSON.stringify(baseData));
    // Multiple high-SVS stocks to test TOP-5 ranking
    for (let i = 0; i < Math.min(8, data.data.length); i++) {
        data.data[i].d[10] = 20 + i * 10;           // RVOL 20-90
        data.data[i].d[16] = 10 + i * 5;            // change 10-45%
        data.data[i].d[9] = 100_000_000 + i * 50_000_000; // $100M-$450M
        data.data[i].d[1] = 5 + i * 3;              // price $5-$26
    }
    return data;
};
