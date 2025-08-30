/**
 * Utility Functions for Privately Extension
 */

const UtilityHelpers = {
  /**
   * Debounce function to limit function calls
   */
  debounce: (func, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  },

  /**
   * Generate unique ID for DOM elements
   */
  generateElementId: (element) => {
    if (!element.dataset.pgId) {
      element.dataset.pgId = 'pg-' + Math.random().toString(36).slice(2);
    }
    return element.dataset.pgId;
  },

  /**
   * Get fake replacement data for detected sensitive information
   */
  getFakeData: (label) => {
    const prefs = getUserPreferences();
    const replacement = (prefs.fakeData && prefs.fakeData[label]) || FAKE_DATA_MAP[label] || "REDACTED";
    console.log(`🔄 Replacing ${label} with:`, replacement);
    return replacement;
  },

  /**
   * Extract only digits from a string
   */
  extractDigits: (str) => {
    return (str.match(/\d/g) || []).join("");
  }
};
