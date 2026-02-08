/**
 * @fileoverview State management utilities for functional programming
 */

/**
 * @typedef {Object} StateManager
 * @property {Function} get - Gets current state copy
 * @property {Function} update - Updates state with updater function
 * @property {Function} reset - Resets state to initial values
 */

/**
 * Creates a functional state manager with immutable updates
 * @param {Object} initialState - Initial state object
 * @returns {StateManager} State manager with get, update, reset methods
 */
export const createStateManager = (initialState) => {
    let state = { ...initialState };

    return Object.freeze({
        /**
         * Gets current state as a copy
         * @returns {Object} Current state copy
         */
        get: () => ({ ...state }),

        /**
         * Updates state using updater function
         * @param {Function} updater - Function that receives current state and returns updates
         * @returns {Object} New state after update
         */
        update: (updater) => {
            state = { ...state, ...updater(state) };
            return { ...state };
        },

        /**
         * Resets state to initial values
         * @returns {Object} Reset state
         */
        reset: () => {
            state = { ...initialState };
            return { ...state };
        }
    });
};
