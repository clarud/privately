/**
 * State Management for Privately Extension
 */

// User preferences state
let userPreferences = { ...DEFAULT_PREFERENCES };

/**
 * Initialize and manage user preferences
 */
function initializePreferences() {
  chrome.storage.local.get({ pg_prefs: DEFAULT_PREFERENCES }, ({ pg_prefs }) => {
    // Deep merge to ensure nested objects are properly handled
    userPreferences = {
      enabled: pg_prefs.enabled !== undefined ? pg_prefs.enabled : DEFAULT_PREFERENCES.enabled,
      mode: pg_prefs.mode || DEFAULT_PREFERENCES.mode,
      categories: { 
        ...DEFAULT_PREFERENCES.categories, 
        ...(pg_prefs.categories || {}) 
      },
      allowlist: { 
        ...DEFAULT_PREFERENCES.allowlist, 
        ...(pg_prefs.allowlist || {}) 
      },
      fakeData: { 
        ...DEFAULT_PREFERENCES.fakeData, 
        ...(pg_prefs.fakeData || {}) 
      }
    };
    
    console.log('State: Initialized preferences:', userPreferences);
  });

  chrome.storage.onChanged.addListener(changes => {
    if (changes.pg_prefs) {
      const newPrefs = changes.pg_prefs.newValue;
      userPreferences = {
        enabled: newPrefs.enabled !== undefined ? newPrefs.enabled : DEFAULT_PREFERENCES.enabled,
        mode: newPrefs.mode || DEFAULT_PREFERENCES.mode,
        categories: { 
          ...DEFAULT_PREFERENCES.categories, 
          ...(newPrefs.categories || {}) 
        },
        allowlist: { 
          ...DEFAULT_PREFERENCES.allowlist, 
          ...(newPrefs.allowlist || {}) 
        },
        fakeData: { 
          ...DEFAULT_PREFERENCES.fakeData, 
          ...(newPrefs.fakeData || {}) 
        }
      };
      console.log('State: Updated preferences:', userPreferences);
    }
  });
}

/**
 * Get current user preferences
 */
function getUserPreferences() {
  return userPreferences;
}

/**
 * Update user preferences
 */
function updateUserPreferences(newPrefs) {
  userPreferences = { ...userPreferences, ...newPrefs };
  chrome.storage.local.set({ pg_prefs: userPreferences });
}
