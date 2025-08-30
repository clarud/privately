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
    console.log('🔍 Getting fake data for label:', label);
    console.log('🔍 User preferences:', prefs);
    console.log('🔍 User fakeData:', prefs.fakeData);
    console.log('🔍 Available in FAKE_DATA_MAP:', FAKE_DATA_MAP[label]);
    
    let replacement;
    
    // Try user's custom fake data first
    if (prefs.fakeData && prefs.fakeData[label]) {
      replacement = prefs.fakeData[label];
      console.log(`🎯 Using user custom fake data for ${label}:`, replacement);
    }
    // Fall back to default fake data
    else if (FAKE_DATA_MAP[label]) {
      replacement = FAKE_DATA_MAP[label];
      console.log(`🔄 Using default fake data for ${label}:`, replacement);
    }
    // Final fallback
    else {
      replacement = "REDACTED";
      console.log(`⚠️ No fake data found for ${label}, using fallback:`, replacement);
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
