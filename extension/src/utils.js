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
    let replacement;
    
    // Try user's custom fake data first
    if (prefs.fakeData && prefs.fakeData[label]) {
      replacement = prefs.fakeData[label];
    }
    // Fall back to default fake data
    else if (FAKE_DATA_MAP[label]) {
      replacement = FAKE_DATA_MAP[label];
    }
    // Final fallback
    else {
      replacement = "REDACTED";
    }
    
    return replacement;
  },

  /**
   * Extract only digits from a string
   */
  extractDigits: (str) => {
    return (str.match(/\d/g) || []).join("");
  }
};
