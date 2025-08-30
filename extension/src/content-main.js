/**
 * Privately - Main Content Script
 * Detects sensitive information in form fields and provides privacy warnings
 */

/**
 * Main input handler with debouncing
 */
const handleInput = UtilityHelpers.debounce(async (element) => {
  console.log('🔍 Analyzing text:', element.isContentEditable ? element.innerText : element.value);
  
  // Check if privacy detection is enabled
  const prefs = getUserPreferences();
  if (!prefs.enabled) {
    console.log('❌ Detection disabled');
    return;
  }
  
  // Check if current site is in allowlist
  if (AllowlistManager.isCurrentSiteAllowed()) {
    console.log('❌ Site allowlisted');
    return;
  }

  // Get text content from element
  const text = element.isContentEditable ? element.innerText : element.value;
  
  // Clear highlights if no text content
  if (!text?.trim()) {
    if (element.isContentEditable) {
      DOMHelpers.clearHighlights(element);
    }
    TooltipManager.removeTooltip(element);
    return;
  }

  // Perform local detection
  const localSpans = DetectionEngine.detectSensitiveData(text);

  // TODO: Re-enable backend analysis when AI model is connected
  // const backendSpans = await DetectionEngine.analyzeWithBackend(text);
  
  // Use only local detection for now
  const allDetectedSpans = localSpans;

  // Apply visual highlights for contenteditable elements
  if (element.isContentEditable) {
    DOMHelpers.clearHighlights(element);
    if (allDetectedSpans.length > 0) {
      DOMHelpers.highlightContentEditable(element, allDetectedSpans);
    }
  }

  // Show tooltip if sensitive data detected
  if (allDetectedSpans.length > 0) {
    console.log('🏷️ Showing tooltip for detections:', allDetectedSpans.map(s => s.label));
    TooltipManager.attachTooltip(element, allDetectedSpans, false); // Using local detection only
  } else {
    console.log('🚫 No detections');
    TooltipManager.removeTooltip(element);
  }
}, CONFIG.DEBOUNCE_MS);

/**
 * Initialize event listeners for focus and input events
 */
function initializeEventListeners() {
  console.log('🎯 Setting up event listeners...');
  
  document.addEventListener('focusin', (event) => {
    const element = event.target;
    console.log('👆 Focus event on element:', element.tagName, element.type, element);
    
    // Check if element is a supported input field
    if (!element.matches(INPUT_FIELD_SELECTOR)) {
      console.log('❌ Element does not match INPUT_FIELD_SELECTOR');
      return;
    }
    
    console.log('✅ Element matches! Setting up listeners...');

    // Add input listener for real-time detection
    element.addEventListener('input', () => {
      console.log('📝 Input event triggered on:', element);
      handleInput(element);
    });
    
    // Add blur listener to clean up when element loses focus
    element.addEventListener('blur', () => {
      console.log('👋 Blur event on:', element);
      // Add a small delay to allow tooltip clicks to register first
      setTimeout(() => {
        TooltipManager.removeTooltip(element);
        if (element.isContentEditable) {
          DOMHelpers.clearHighlights(element);
        }
      }, 150);
    }, { capture: true });

    // Perform initial analysis
    console.log('🔍 Performing initial analysis...');
    handleInput(element);
  });
  
  console.log('✅ Event listeners set up successfully');
}

/**
 * Initialize the extension
 */
function initializeExtension() {
  console.log('🔒 Privately extension initializing...');
  console.log('📍 Current URL:', window.location.href);
  console.log('📝 INPUT_FIELD_SELECTOR:', INPUT_FIELD_SELECTOR);
  
  // Initialize user preferences
  initializePreferences();
  
  // Set up event listeners
  initializeEventListeners();
  
  console.log('✅ Privately extension initialized successfully');
  
  // Test detection immediately
  setTimeout(() => {
    console.log('🧪 Testing detection on page load...');
    const inputs = document.querySelectorAll(INPUT_FIELD_SELECTOR);
    console.log(`🔍 Found ${inputs.length} input fields:`, inputs);
  }, 1000);
}

// Start the extension when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}
