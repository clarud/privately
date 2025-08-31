/**
 * Replacement Tracker for Privately Extension
 * Tracks content that has been replaced/removed to avoid re-detecting it
 */

const ReplacementTracker = {
  // Map of element IDs to their processed content information
  processedContent: new Map(),
  
  /**
   * Generate a unique identifier for an element
   */
  getElementId: (element) => {
    if (!element._pgElementId) {
      element._pgElementId = 'pg_' + Math.random().toString(36).substr(2, 9);
    }
    return element._pgElementId;
  },

  /**
   * Record that content has been processed (replaced/removed)
   */
  recordProcessedContent: (element, originalText, processedSpans, action = 'replace') => {
    const elementId = ReplacementTracker.getElementId(element);
    const currentText = element.isContentEditable ? element.innerText : element.value;

    if (!ReplacementTracker.processedContent.has(elementId)) {
      ReplacementTracker.processedContent.set(elementId, {
        processedSpans: [],
        lastText: '',
        timestamp: Date.now()
      });
    }

    const record = ReplacementTracker.processedContent.get(elementId);
    
    // Add the processed spans to our tracking
    processedSpans.forEach(span => {
      record.processedSpans.push({
        originalText: span.text,
        label: span.label,
        action: action,
        timestamp: Date.now(),
        originalStart: span.start,
        originalEnd: span.end
      });
    });
    
    record.lastText = currentText;
    record.timestamp = Date.now();
    
    console.log('✅ Recorded processed content for element:', elementId);
  },

  /**
   * Filter out spans that correspond to content we've already processed
   */
  filterProcessedSpans: (element, detectedSpans) => {
    const prefs = getUserPreferences();
    
    // If user disabled remembering processed content, don't filter anything
    if (!prefs.replacementDetection || !prefs.replacementDetection.rememberProcessed) {
      console.log('📝 Replacement tracking disabled by user preferences');
      return detectedSpans;
    }
    
    const elementId = ReplacementTracker.getElementId(element);
    const record = ReplacementTracker.processedContent.get(elementId);
    
    if (!record || !record.processedSpans.length) {
      return detectedSpans; // No processed content to filter
    }

    const currentText = element.isContentEditable ? element.innerText : element.value;
    
    console.log('🔍 Filtering processed spans for element:', elementId);
    console.log('📊 Found processed spans:', record.processedSpans.length);
    console.log('⚙️ User preferences:', prefs.replacementDetection);
    
    const filteredSpans = detectedSpans.filter(span => {
      const spanText = span.text.trim();
      
      // Check if this span matches any of our processed content
      const isProcessed = record.processedSpans.some(processed => {
        // Check if the detected span matches replaced/removed content
        const shouldFilter = ReplacementTracker.shouldFilterProcessedContent(
          spanText, 
          processed, 
          prefs.replacementDetection
        );
        
        if (shouldFilter) {
          console.log(`🚫 Filtering out processed content: "${spanText}" (${processed.action}ed as ${processed.label})`);
          return true;
        }
        
        return false;
      });
      
      return !isProcessed;
    });

    if (filteredSpans.length !== detectedSpans.length) {
      console.log(`✅ Filtered ${detectedSpans.length - filteredSpans.length} already-processed spans`);
    }
    
    return filteredSpans;
  },

  /**
   * Determine if processed content should be filtered based on user preferences
   */
  shouldFilterProcessedContent: (detectedText, processedRecord, preferences) => {
    const detected = detectedText.toLowerCase().trim();
    const original = processedRecord.originalText.toLowerCase().trim();
    
    // If action was 'remove', check user preference for removed areas
    if (processedRecord.action === 'remove') {
      if (!preferences.detectRemovedAreas && detected === original) {
        return true; // Filter out - user doesn't want to detect in removed areas
      }
      return false; // Allow detection - user wants to detect in removed areas
    }
    
    // If action was 'replace', check user preference for replaced data
    if (processedRecord.action === 'replace') {
      // Check if this is our fake replacement data
      const isFakeData = ReplacementTracker.isFakeDataForCategory(detected, processedRecord.label);
      if (isFakeData && !preferences.detectReplacedData) {
        return true; // Filter out - user doesn't want to detect replaced data
      }
      
      // Check if the original text is being detected again (user undid the replacement)
      if (detected === original) {
        console.log(`🔄 Original content restored: "${detected}" - allowing re-detection`);
        return false; // Always allow re-detection if user restored original content
      }
      
      // If it's fake data but user wants to detect it, allow it
      if (isFakeData && preferences.detectReplacedData) {
        return false; // Allow detection - user wants to detect replaced data
      }
    }
    
    return false; // Default: don't filter
  },

  /**
   * Check if text looks like fake data for a given category
   */
  isFakeDataForCategory: (text, category) => {
    const lowerText = text.toLowerCase();
    
    switch (category) {
      case 'EMAIL':
        return lowerText.includes('example.com') || 
               lowerText.includes('test.com') || 
               lowerText.includes('placeholder');
      
      case 'NAME':
        // Common fake names
        return lowerText.includes('john doe') || 
               lowerText.includes('jane doe') || 
               lowerText.includes('jordan avery') ||
               lowerText.includes('alex smith');
      
      case 'SG_PHONE':
      case 'PHONE':
        return lowerText.includes('555') || text.startsWith('+1 555');
      
      case 'CARD':
      case 'CREDIT_CARD':
        return text.includes('4111-1111-1111-1111') || 
               text.includes('4111111111111111');
      
      case 'ADDRESS':
        return lowerText.includes('baker street') || 
               lowerText.includes('main street') ||
               lowerText.includes('placeholder address');
      
      case 'NRIC':
        return text.match(/^[STG]\d{7}[A-Z]$/) && text.startsWith('S1234567');
      
      default:
        return false;
    }
  },

  /**
   * Clear processed content for an element (when user starts fresh)
   */
  clearElementHistory: (element) => {
    const elementId = ReplacementTracker.getElementId(element);
    ReplacementTracker.processedContent.delete(elementId);
    console.log('🧹 Cleared processing history for element:', elementId);
  },

  /**
   * Clean up old records to prevent memory leaks
   */
  cleanup: () => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [elementId, record] of ReplacementTracker.processedContent.entries()) {
      if (now - record.timestamp > maxAge) {
        ReplacementTracker.processedContent.delete(elementId);
        console.log('🧹 Cleaned up old processed content record:', elementId);
      }
    }
  },

  /**
   * Get debug information about processed content
   */
  getDebugInfo: (element) => {
    const elementId = ReplacementTracker.getElementId(element);
    const record = ReplacementTracker.processedContent.get(elementId);
    
    return {
      elementId,
      hasRecord: !!record,
      processedCount: record ? record.processedSpans.length : 0,
      processedSpans: record ? record.processedSpans.map(s => ({
        originalText: s.originalText,
        label: s.label,
        action: s.action,
        ago: Date.now() - s.timestamp
      })) : []
    };
  }
};

// Clean up old records periodically
setInterval(() => {
  ReplacementTracker.cleanup();
}, 5 * 60 * 1000); // Every 5 minutes
