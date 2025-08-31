/**
 * Privately - Main Content Script
 * Detects sensitive information in form fields and provides privacy warnings
 */

/**
 * Main input handler with debouncing
 */
const handleInput = UtilityHelpers.debounce(async (element) => {
  try {
    if (!element) {
      console.warn('⚠️ handleInput called with null element');
      return;
    }
    
    console.log('🔍 Analyzing text:', element.isContentEditable ? element.innerText : element.value);
    
    // Check if privacy detection is enabled
    const prefs = getUserPreferences();
    if (!prefs.enabled) {
      console.log('❌ Detection disabled');
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

  // Perform ONNX model analysis for NAME and ADDRESS detection
  // Pass existing regex spans to avoid overlapping detections
  const onnxSpans = await DetectionEngine.analyzeWithONNX(text, localSpans);
  
  // Combine local and ONNX results (ONNX should already exclude overlapping regions)
  const allDetectedSpans = [...localSpans, ...onnxSpans];
  
  // Filter out content that has already been processed (replaced/removed)
  const filteredSpans = ReplacementTracker.filterProcessedSpans(element, allDetectedSpans);
  
  console.log('🔍 Combined detection results:', {
    local: localSpans.length,
    onnx: onnxSpans.length,
    total: allDetectedSpans.length,
    afterFiltering: filteredSpans.length,
    localSpans: localSpans.map(s => ({ text: s.text, label: s.label, start: s.start, end: s.end })),
    onnxSpans: onnxSpans.map(s => ({ text: s.text, label: s.label, start: s.start, end: s.end })),
    filteredOut: allDetectedSpans.length - filteredSpans.length
  });

  // Apply visual highlights based on element type
  if (element.isContentEditable) {
    // Use inline span highlighting for contenteditable elements
    DOMHelpers.clearHighlights(element);
    if (filteredSpans.length > 0) {
      DOMHelpers.highlightContentEditable(element, filteredSpans);
    }
  } else {
    // Use background gradient highlighting for regular input fields
    DOMHelpers.highlightInputField(element, filteredSpans);
  }

  // Show tooltip if sensitive data detected
  if (filteredSpans.length > 0) {
    console.log('🏷️ Showing tooltip for detections:', filteredSpans.map(s => s.label));
    TooltipManager.attachTooltip(element, filteredSpans, false); // Using local detection only
  } else {
    console.log('🚫 No detections (after filtering processed content)');
    TooltipManager.removeTooltip(element);
  }
  
  } catch (error) {
    console.error('❌ Error in handleInput:', error);
    // Clean up any tooltips on error
    if (typeof TooltipManager !== 'undefined' && TooltipManager.removeTooltip) {
      TooltipManager.removeTooltip(element);
    }
  }
}, CONFIG.DEBOUNCE_MS);

/**
 * Initialize event listeners for focus and input events
 */
function initializeEventListeners() {
  console.log('🎯 Setting up event listeners...');
  
  document.addEventListener('focusin', (event) => {
    const element = event.target;
    console.log('👆 Focus event on element:', element.tagName, element.type, element.contentEditable, element);
    
    // Check if element is a supported input field
    if (!element.matches(INPUT_FIELD_SELECTOR)) {
      console.log(`❌ Element does not match INPUT_FIELD_SELECTOR: ${element.tagName}${element.type ? `[type="${element.type}"]` : ''}${element.contentEditable ? `[contenteditable="${element.contentEditable}"]` : ''}`);
      return;
    }
    
    console.log('✅ Element matches! Setting up listeners...');

    // Close any existing tooltips when focusing on a new field
    if (TooltipManager.currentElement && TooltipManager.currentElement !== element) {
      console.log('🔄 Switching to new field, closing previous tooltip');
      
      // Store reference before removing tooltips (which sets currentElement to null)
      const previousElement = TooltipManager.currentElement;
      
      TooltipManager.removeAllTooltips();
      
      // Clear highlights from previous element based on its type
      if (previousElement) {
        if (previousElement.isContentEditable) {
          DOMHelpers.clearHighlights(previousElement);
        } else {
          DOMHelpers.clearInputHighlights(previousElement);
          // Clean up event listeners
          if (previousElement._pgCleanupListeners) {
            previousElement._pgCleanupListeners();
            previousElement._pgCleanupListeners = null;
          }
        }
      }
    }

    // Add input listener for real-time detection
    element.addEventListener('input', () => {
      console.log('📝 Input event triggered on:', element);
      handleInput(element);
    });
    
    // Add scroll and resize listeners to reposition overlays for input fields
    if (!element.isContentEditable) {
      const repositionOverlay = () => {
        if (element._pgOverlay) {
          const inputRect = element.getBoundingClientRect();
          element._pgOverlay.style.left = inputRect.left + 'px';
          element._pgOverlay.style.top = inputRect.top + 'px';
          element._pgOverlay.style.width = inputRect.width + 'px';
          element._pgOverlay.style.height = inputRect.height + 'px';
          console.log('🔄 Repositioned overlay to:', inputRect);
        }
      };
      
      window.addEventListener('scroll', repositionOverlay, { passive: true });
      window.addEventListener('resize', repositionOverlay, { passive: true });
      
      // Store cleanup function
      element._pgCleanupListeners = () => {
        window.removeEventListener('scroll', repositionOverlay);
        window.removeEventListener('resize', repositionOverlay);
      };
    }
    
    // Add blur listener to clean up when element loses focus
    element.addEventListener('blur', () => {
      console.log('👋 Blur event on:', element);
      // Add a small delay to allow tooltip clicks to register first
      setTimeout(() => {
        if (element && typeof TooltipManager !== 'undefined') {
          TooltipManager.removeTooltip(element);
          if (element.isContentEditable) {
            DOMHelpers.clearHighlights(element);
          } else {
            DOMHelpers.clearInputHighlights(element);
            // Clean up event listeners
            if (element._pgCleanupListeners) {
              element._pgCleanupListeners();
              element._pgCleanupListeners = null;
            }
          }
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

/**
 * Cleanup function to remove tooltips and event listeners
 */
function cleanup() {
  console.log('🧹 Cleaning up Privately extension...');
  
  // Remove all tooltips
  if (typeof TooltipManager !== 'undefined' && TooltipManager.removeAllTooltips) {
    TooltipManager.removeAllTooltips();
  }
  
  // Remove all highlights
  document.querySelectorAll('.pg-underline').forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    }
  });
  
  // Remove global click handler
  if (typeof TooltipManager !== 'undefined' && TooltipManager.globalClickHandler) {
    document.removeEventListener('click', TooltipManager.globalClickHandler, true);
  }
}

// Start the extension when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// Cleanup when page is unloaded
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);
