/**
 * @fileoverview Time and timezone utilities for stock market operations
 */

/**
 * @typedef {Object} NYTime
 * @property {string} hhmm - Time in HH:MM format
 * @property {string} weekday - Day of week (Mon, Tue, etc.)
 */

/**
 * @typedef {Object} PremarketHours
 * @property {string} start - Start time in HH:MM format
 * @property {string} end - End time in HH:MM format
 */

/**
 * Gets current timestamp in HH:MM:SS format
 * @returns {string} Current time as HH:MM:SS
 */
export const nowTs = () =>
    new Date().toISOString().split("T")[1].split(".")[0];

/**
 * Gets current New York time with timezone handling (including DST)
 * @returns {NYTime} Object with hhmm and weekday properties
 */
export const nyNow = () => {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
    const hhmm = `${parts.hour}:${parts.minute}`;
    const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short"
    }).format(new Date());
    return Object.freeze({ hhmm, weekday });
};

/**
 * Converts HH:MM time string to minutes since midnight
 * @param {string} hhmm - Time in HH:MM format
 * @returns {number} Minutes since midnight
 */
export const hhmmToMin = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};

/**
 * Checks if given weekday is weekend
 * @param {string} weekday - Day of week (Mon, Tue, etc.)
 * @returns {boolean} True if weekend
 */
export const isWeekend = (weekday) => weekday === "Sat" || weekday === "Sun";

/**
 * Checks if current time is within specified range
 * @param {string} currentTime - Current time in HH:MM format
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {boolean} True if time is in range
 */
export const isTimeInRange = (currentTime, startTime, endTime) => {
    const current = hhmmToMin(currentTime);
    const start = hhmmToMin(startTime);
    const end = hhmmToMin(endTime);
    return current >= start && current < end;
};

/**
 * Checks if current time is within premarket hours (ET, Mon-Fri)
 * @param {PremarketHours} premarketHours - Premarket time configuration
 * @returns {boolean} True if currently in premarket hours
 */
export const isPremarketNow = (premarketHours) => {
    const { hhmm, weekday } = nyNow();
    return !isWeekend(weekday) &&
        isTimeInRange(hhmm, premarketHours.start, premarketHours.end);
};
