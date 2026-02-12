/**
 * @fileoverview API Verification Test for Catalyst Scanner
 * Runs real API calls to TradingView to verify data retrieval for both Pre-market and Market sessions.
 */
import { TvScanner } from "../src/services/tradingview.js";
import { parseConfig } from "../src/config/index.js";
import { createLogger } from "../src/core/logger.js";

async function verifyApi() {
    const logger = createLogger();
    const config = parseConfig();

    logger.info("Test", "🚀 Starting Catalyst API Verification...");
    logger.info("Test", `Using TV_COOKIE: ${config.api.tvCookie ? "✅ Provided" : "❌ Not provided (Using public access)"}`);

    try {
        // 1. Verify Catalyst Setup (Pre-market)
        logger.info("Test", "--- Testing getCatalystSetupStocks (Pre-market phase) ---");
        const setupResult = await TvScanner.getCatalystSetupStocks(config);
        logger.info("Test", `Total Count: ${setupResult.totalCount}`);
        logger.info("Test", `Rows returned: ${setupResult.data.length}`);

        if (setupResult.data.length > 0) {
            const sample = TvScanner.mapRow(setupResult.data[0]);
            logger.info("Test", `Sample Row (Mapped): ${JSON.stringify(sample)}`);
        } else {
            logger.warn("Test", "No stocks found matching pre-market catalyst criteria. (Standard behavior if no gaps > 4% or < -8% exist right now)");
        }

        // 2. Verify Market Scan (Market phase)
        logger.info("Test", "\n--- Testing getMarketStocks (Market phase) ---");
        const marketResult = await TvScanner.getMarketStocks(config);
        logger.info("Test", `Total Count: ${marketResult.totalCount}`);
        logger.info("Test", `Rows returned: ${marketResult.data.length}`);

        if (marketResult.data.length > 0) {
            const sample = TvScanner.mapMarketRow(marketResult.data[0]);
            logger.info("Test", `Sample Row (Mapped): ${JSON.stringify(sample)}`);
        } else {
            logger.warn("Test", "No stocks found matching market criteria. (Standard behavior if it's currently pre-market or volume is low)");
        }

        logger.info("Test", "\n✅ API Verification complete.");
    } catch (error) {
        logger.error("Test", `❌ API Verification failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

verifyApi();
