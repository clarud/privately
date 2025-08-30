/**
 * Privately - Options Page Script
 * Handles user preferences, detection categories, and custom fake data
 */

// Define detection categories locally for options page
const ALL_DETECTION_CATEGORIES = {
  EMAIL: true,
  SG_PHONE: true,
  URL: true,
  IP: true,
  IP_PRIVATE: true,
  NRIC: true,
  UEN: true,
  POSTAL_SG: true,
  CARD: true,
  IBAN: true,
  JWT: true,
  AWS_KEY: true,
  SECRET: true,
  PRIVATE_KEY: true,
  AUTH_HEADER: true,
  SET_COOKIE: true,
  FILEPATH: true,
  UUID: true,
  BASE64_LONG: true,
  HEX_LONG: true,
  NAME: true,
  ADDRESS: true,
  ORG: true
};

// Default fake data map for options page
const DEFAULT_FAKE_DATA = {
  EMAIL: "alex.murphy@example.org",
  SG_PHONE: "+65 9123 4567",
  URL: "https://example.com/safe-link",
  IP: "192.0.2.1",
  IP_PRIVATE: "10.0.0.1",
  CARD: "4242 4242 4242 4242",
  NRIC: "S1234567A",
  UEN: "12345678A",
  POSTAL_SG: "123456",
  IBAN: "GB82WEST12345698765432",
  JWT: "eyJhbGciOiJIUzI1NiJ9.fake.signature",
  AWS_KEY: "AKIAIOSFODNN7EXAMPLE",
  SECRET: "fake_secret_key_123",
  PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nFAKE_KEY_DATA\\n-----END PRIVATE KEY-----",
  AUTH_HEADER: "Authorization: Bearer fake_token_123",
  SET_COOKIE: "Set-Cookie: session=fake_session_id",
  FILEPATH: "/home/user/documents/file.txt",
  UUID: "550e8400-e29b-41d4-a716-446655440000",
  BASE64_LONG: "ZmFrZV9iYXNlNjRfZGF0YV9leGFtcGxl",
  HEX_LONG: "deadbeefcafebabe1234567890abcdef",
  NAME: "Jordan Avery",
  ADDRESS: "221B Baker Street, London",
  ORG: "Example Corporation Ltd"
};

// Category descriptions for better UX
const CATEGORY_DESCRIPTIONS = {
  EMAIL: "Email addresses",
  SG_PHONE: "Singapore phone numbers",
  URL: "Website URLs",
  IP: "IP addresses",
  IP_PRIVATE: "Private IP addresses",
  NRIC: "Singapore NRIC/FIN",
  UEN: "Singapore UEN numbers",
  POSTAL_SG: "Singapore postal codes",
  CARD: "Credit card numbers",
  IBAN: "International bank accounts",
  JWT: "JSON Web Tokens",
  AWS_KEY: "AWS access keys",
  SECRET: "API keys & secrets",
  PRIVATE_KEY: "Private cryptographic keys",
  AUTH_HEADER: "Authorization headers",
  SET_COOKIE: "Cookie headers",
  FILEPATH: "File system paths",
  UUID: "Unique identifiers",
  BASE64_LONG: "Base64 encoded data",
  HEX_LONG: "Hexadecimal strings",
  NAME: "Personal names (AI detected)",
  ADDRESS: "Addresses (AI detected)",
  ORG: "Organizations (AI detected)"
};

// Default preferences with all available categories
const DEFAULT_PREFERENCES = {
  enabled: true,
  mode: "balanced",
  categories: { ...ALL_DETECTION_CATEGORIES },
  allowlist: {},
  fakeData: { ...DEFAULT_FAKE_DATA }
};

let currentPreferences = { ...DEFAULT_PREFERENCES };

/**
 * Initialize the options page
 */
function initializeOptionsPage() {
  console.log('Initializing options page...');
  
  // Load current preferences
  chrome.storage.local.get({ pg_prefs: DEFAULT_PREFERENCES }, ({ pg_prefs }) => {
    console.log('Loaded preferences:', pg_prefs);
    
    // Ensure all required properties exist with proper defaults
    currentPreferences = {
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
        ...DEFAULT_FAKE_DATA, 
        ...(pg_prefs.fakeData || {}) 
      }
    };
    
    console.log('Merged preferences:', currentPreferences);
    
    // Save the merged preferences back to ensure consistency
    chrome.storage.local.set({ pg_prefs: currentPreferences }, () => {
      console.log('Saved merged preferences');
      renderOptionsPage();
    });
  });

  // Set up event listeners
  setupEventListeners();
}

/**
 * Render the complete options page
 */
function renderOptionsPage() {
  console.log('Starting to render options page...');
  
  // Check if required DOM elements exist
  const requiredElements = ['enabled', 'mode', 'categories', 'fake-data', 'allowlist'];
  const missingElements = [];
  
  requiredElements.forEach(id => {
    const element = document.getElementById(id);
    if (!element) {
      missingElements.push(id);
    } else {
      console.log(`Element ${id} found:`, element);
    }
  });
  
  if (missingElements.length > 0) {
    console.error('Missing DOM elements:', missingElements);
    return;
  }
  
  console.log('All required DOM elements found, proceeding with render...');
  
  renderGeneralSettings();
  renderDetectionCategories();
  renderFakeDataSettings();
  renderAllowlistSettings();
  
  console.log('Options page rendering complete');
}

/**
 * Render general settings section
 */
function renderGeneralSettings() {
  const enabledCheckbox = document.getElementById('enabled');
  const modeSelect = document.getElementById('mode');

  enabledCheckbox.checked = currentPreferences.enabled;
  modeSelect.value = currentPreferences.mode;

  enabledCheckbox.onchange = (e) => {
    currentPreferences.enabled = e.target.checked;
    savePreferences();
  };

  modeSelect.onchange = (e) => {
    currentPreferences.mode = e.target.value;
    savePreferences();
  };
}

/**
 * Render detection categories section
 */
function renderDetectionCategories() {
  console.log('Rendering detection categories...');
  const categoriesContainer = document.getElementById('categories');
  categoriesContainer.innerHTML = '';

  // Get enabled categories from user preferences
  const userCategories = currentPreferences.categories || {};
  console.log('User categories:', userCategories);
  console.log('All detection categories:', ALL_DETECTION_CATEGORIES);

  Object.keys(ALL_DETECTION_CATEGORIES).forEach(category => {
    const isEnabled = userCategories[category] !== false;
    const description = CATEGORY_DESCRIPTIONS[category] || category;

    console.log(`Rendering category ${category}: enabled=${isEnabled}`);

    const categoryItem = document.createElement('div');
    categoryItem.className = `category-item ${isEnabled ? 'active' : ''}`;
    
    categoryItem.innerHTML = `
      <input type="checkbox" id="cat-${category}" ${isEnabled ? 'checked' : ''}>
      <div>
        <div class="category-label">${category}</div>
        <div style="font-size: 12px; color: #666;">${description}</div>
      </div>
    `;

    const checkbox = categoryItem.querySelector('input');
    checkbox.onchange = (e) => {
      console.log(`Category ${category} changed to:`, e.target.checked);
      currentPreferences.categories[category] = e.target.checked;
      categoryItem.classList.toggle('active', e.target.checked);
      savePreferences();
    };

    categoryItem.onclick = (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.onchange({ target: checkbox });
      }
    };

    categoriesContainer.appendChild(categoryItem);
  });
  
  console.log(`Rendered ${categoriesContainer.children.length} categories`);
}

/**
 * Render fake data settings section
 */
function renderFakeDataSettings() {
  console.log('Rendering fake data settings...');
  const fakeDataContainer = document.getElementById('fake-data');
  fakeDataContainer.innerHTML = '';

  // Get fake data from current preferences
  const userFakeData = currentPreferences.fakeData || {};
  console.log('User fake data:', userFakeData);

  // Get categories from DEFAULT_FAKE_DATA to ensure we show all available options
  const fakeDataCategories = Object.keys(DEFAULT_FAKE_DATA);
  console.log('Available fake data categories:', fakeDataCategories);

  fakeDataCategories.forEach(category => {
    const currentValue = userFakeData[category] || DEFAULT_FAKE_DATA[category] || '';
    console.log(`Rendering fake data for ${category}: ${currentValue}`);

    const fakeDataItem = document.createElement('div');
    fakeDataItem.className = 'fake-data-item';
    
    fakeDataItem.innerHTML = `
      <div class="fake-data-label">${category}:</div>
      <input 
        type="text" 
        class="fake-data-input" 
        id="fake-${category}"
        value="${currentValue}"
        placeholder="Enter replacement for ${category}"
      >
    `;

    const input = fakeDataItem.querySelector('input');
    
    // Add multiple event listeners for real-time updates
    input.addEventListener('input', (e) => {
      console.log(`Fake data input changed for ${category}:`, e.target.value);
      currentPreferences.fakeData[category] = e.target.value;
      savePreferences();
    });
    
    input.addEventListener('change', (e) => {
      console.log(`Fake data change event for ${category}:`, e.target.value);
      currentPreferences.fakeData[category] = e.target.value;
      savePreferences();
    });
    
    input.addEventListener('blur', (e) => {
      console.log(`Fake data blur event for ${category}:`, e.target.value);
      currentPreferences.fakeData[category] = e.target.value;
      savePreferences();
    });

    fakeDataContainer.appendChild(fakeDataItem);
  });
  
  console.log(`Rendered ${fakeDataContainer.children.length} fake data inputs`);
}

/**
 * Render allowlist settings section
 */
function renderAllowlistSettings() {
  const allowlistContainer = document.getElementById('allowlist');
  allowlistContainer.innerHTML = '';

  const allowedSites = Object.keys(currentPreferences.allowlist).filter(
    site => currentPreferences.allowlist[site] === true
  );

  if (allowedSites.length === 0) {
    allowlistContainer.innerHTML = '<p style="color: #666; font-style: italic;">No sites in allowlist</p>';
    return;
  }

  allowedSites.forEach(site => {
    const allowlistItem = document.createElement('div');
    allowlistItem.className = 'allowlist-item';
    
    allowlistItem.innerHTML = `
      <span class="allowlist-url">${site}</span>
      <button class="remove-allowlist" data-site="${site}">Remove</button>
    `;

    const removeButton = allowlistItem.querySelector('button');
    removeButton.onclick = () => {
      delete currentPreferences.allowlist[site];
      savePreferences();
      renderAllowlistSettings(); // Re-render this section
    };

    allowlistContainer.appendChild(allowlistItem);
  });
}

/**
 * Set up event listeners for action buttons
 */
function setupEventListeners() {
  // Reset fake data button
  document.getElementById('reset-fake-data').onclick = () => {
    if (confirm('Reset all fake data to defaults?')) {
      currentPreferences.fakeData = { ...DEFAULT_FAKE_DATA };
      savePreferences();
      renderFakeDataSettings();
    }
  };

  // Save settings button
  document.getElementById('save-settings').onclick = () => {
    savePreferences();
    showSaveNotification();
  };

  // Reset all button
  document.getElementById('reset-all').onclick = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      currentPreferences = { ...DEFAULT_PREFERENCES };
      savePreferences();
      renderOptionsPage();
      showSaveNotification('Settings reset to defaults');
    }
  };
}

/**
 * Save preferences to Chrome storage
 */
function savePreferences() {
  console.log('Saving preferences:', currentPreferences);
  chrome.storage.local.set({ pg_prefs: currentPreferences }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving preferences:', chrome.runtime.lastError);
    } else {
      console.log('Preferences saved successfully');
    }
  });
}

/**
 * Show save notification
 */
function showSaveNotification(message = 'Settings saved successfully') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--pg-primary);
    color: white;
    padding: 12px 20px;
    border-radius: var(--pg-radius);
    box-shadow: var(--pg-shadow);
    z-index: 1000;
    font-weight: 600;
    transition: all 0.3s;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Remove notification after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - starting initialization');
  console.log('Available categories:', ALL_DETECTION_CATEGORIES);
  console.log('Default fake data:', DEFAULT_FAKE_DATA);
  initializeOptionsPage();
});
