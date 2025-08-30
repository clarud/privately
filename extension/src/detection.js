/**
 * Detection Engine for Privately Extension
 */

const DetectionEngine = {
  /**
   * Check if text contains NAME or ADDRESS patterns that can be detected by regex
   * to avoid redundant ONNX processing
   */
  hasRegexNameOrAddressPattern: (text) => {
    // Simple patterns that might indicate names or addresses
    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/;
    const addressPattern = /\b\d+\s+[A-Z][a-z]+(?:\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl))\b/i;
    
    const hasNamePattern = namePattern.test(text);
    const hasAddressPattern = addressPattern.test(text);
    
    console.log('🔍 Regex pattern check:', {
      text: text.substring(0, 50) + '...',
      hasNamePattern,
      hasAddressPattern
    });
    
    return { hasNamePattern, hasAddressPattern };
  },

  /**
   * Main detection function that scans text for sensitive information
   */
  detectSensitiveData: (text) => {
    console.log('🔍 Starting detection for text:', text);
    const detectedSpans = [];
    const prefs = getUserPreferences();

    for (const [detectorKey, config] of Object.entries(DETECTORS)) {
      const outputLabel = config.label || detectorKey;
      
      // Check if this category is enabled in user preferences
      if (prefs.categories && prefs.categories[outputLabel] === false) {
        continue;
      }

      // Create regex with proper flags - ensure global flag is preserved
      const regex = new RegExp(config.rx.source, config.rx.flags);
      console.log(`🧪 Testing ${detectorKey} (${outputLabel}) with pattern:`, regex);
      
      let match;
      let matchCount = 0;

      while ((match = regex.exec(text)) !== null) {
        matchCount++;
        const matchedText = match[0];
        console.log(`✅ ${detectorKey} match #${matchCount}:`, matchedText, 'at position', match.index);

        // Apply validation if specified
        if (config.validate) {
          const isValid = config.validate(matchedText, match[2], match, text);
          console.log(`🔬 Validation for ${detectorKey}:`, isValid);
          if (!isValid) {
            console.log(`❌ Validation failed for ${detectorKey}:`, matchedText);
            continue;
          }
        }

        let finalLabel = outputLabel;

        // Special handling for IP addresses (upgrade to private if applicable)
        if (outputLabel === 'IP' && window.__pg_last_ip_private) {
          finalLabel = 'IP_PRIVATE';
        }

        const span = {
          start: match.index,
          end: match.index + matchedText.length,
          label: finalLabel,
          confidence: 0.95,
          text: matchedText
        };
        
        console.log(`📍 Adding span for ${finalLabel}:`, span);
        detectedSpans.push(span);
        
        // Prevent infinite loops on zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
      
      if (matchCount === 0) {
        console.log(`❌ No matches for ${detectorKey}`);
      }
    }

    console.log('🎯 Final detection results:', detectedSpans);
    return detectedSpans;
  },

  /**
   * Analyze text using local ONNX model for NAME and ADDRESS detection
   */
  analyzeWithONNX: async (text) => {
    try {
      console.log('🤖 Starting ONNX analysis for:', text);
      const prefs = getUserPreferences();
      
      // Check if NAME or ADDRESS categories are enabled
      const needsNameDetection = prefs.categories && prefs.categories['NAME'] !== false;
      const needsAddressDetection = prefs.categories && prefs.categories['ADDRESS'] !== false;
      
      if (!needsNameDetection && !needsAddressDetection) {
        console.log('🚫 NAME and ADDRESS detection disabled in preferences');
        return [];
      }
      
      // Check if regex can already detect names/addresses
      const regexCheck = DetectionEngine.hasRegexNameOrAddressPattern(text);
      
      // Skip ONNX if regex can detect the patterns
      if ((regexCheck.hasNamePattern && needsNameDetection) || 
          (regexCheck.hasAddressPattern && needsAddressDetection)) {
        console.log('⚡ Skipping ONNX - regex patterns detected. Using fallback instead.');
        
        // Use fallback detection but apply confidence threshold
        const fallbackSpans = await ONNXInference.fallbackDetection(text);
        return fallbackSpans.filter(span => span.confidence >= CONFIG.ONNX_CONFIDENCE_THRESHOLD);
      }
      
      // Run ONNX inference
      const spans = await ONNXInference.predict(text);
      
      // Apply confidence threshold and filter based on user preferences
      const filteredSpans = spans.filter(span => {
        const meetsConfidence = span.confidence >= CONFIG.ONNX_CONFIDENCE_THRESHOLD;
        const isEnabled = (span.label === 'NAME' && needsNameDetection) ||
                         (span.label === 'ADDRESS' && needsAddressDetection);
        
        if (!meetsConfidence) {
          console.log(`🎯 Rejected ${span.label} prediction: confidence ${span.confidence.toFixed(3)} < ${CONFIG.ONNX_CONFIDENCE_THRESHOLD}`);
        }
        
        return meetsConfidence && isEnabled;
      });
      
      console.log('🎯 ONNX analysis results (>60% confidence):', filteredSpans);
      return filteredSpans;
    } catch (error) {
      console.error('❌ ONNX analysis failed:', error);
      return [];
    }
  },
};
