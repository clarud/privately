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

        // Use smart categorizer to analyze potential ambiguity
        const categorization = SmartCategorizer.analyzeDetection(matchedText, finalLabel, 0.95);

        const span = {
          start: match.index,
          end: match.index + matchedText.length,
          label: finalLabel,
          confidence: categorization.confidence,
          text: matchedText,
          possibleCategories: categorization.possibleCategories,
          needsUserInput: categorization.needsUserInput,
          reasoning: categorization.reasoning,
          suggestions: SmartCategorizer.createCategorySuggestions(categorization)
        };
        
        console.log(`📍 Adding span for ${finalLabel}:`, span);
        if (categorization.needsUserInput) {
          console.log(`🤔 User input needed for ambiguous detection:`, categorization.possibleCategories);
        }
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
   * Analyze text using server ONNX model for NAME and ADDRESS detection
   * @param {string} text - Text to analyze
   * @param {Array} existingSpans - Already detected spans to avoid overlapping
   */
  analyzeWithONNX: async (text, existingSpans = []) => {
    try {
      console.log('🤖 Starting ONNX analysis for:', text);
      console.log('🎯 Existing spans to avoid:', existingSpans.map(s => ({ text: s.text, label: s.label, start: s.start, end: s.end })));
      
      const prefs = getUserPreferences();
      
      // Check if NAME or ADDRESS categories are enabled
      const needsNameDetection = prefs.categories && prefs.categories['NAME'] !== false;
      const needsAddressDetection = prefs.categories && prefs.categories['ADDRESS'] !== false;
      
      if (!needsNameDetection && !needsAddressDetection) {
        console.log('🚫 NAME and ADDRESS detection disabled in preferences');
        return [];
      }
      
      // Check if existing regex spans already cover specific categories
      const hasNameSpan = existingSpans.some(span => span.label === 'NAME');
      const hasAddressSpan = existingSpans.some(span => span.label === 'ADDRESS');
      
      // Skip ONNX entirely if regex already found what we need
      if ((hasNameSpan || !needsNameDetection) && (hasAddressSpan || !needsAddressDetection)) {
        console.log('⚡ Skipping ONNX - regex already detected needed categories or categories disabled', {
          hasNameSpan,
          hasAddressSpan,
          needsNameDetection,
          needsAddressDetection
        });
        return [];
      }
      
      // Quick check: if text only contains obvious non-NAME/ADDRESS patterns, skip ONNX
      const isOnlyObviousPatterns = text.length < 50 && 
        (/@/.test(text) || /\d{4}-?\d{4}-?\d{4}-?\d{4}/.test(text) || /^\+?\d+$/.test(text.trim()));
      
      if (isOnlyObviousPatterns && existingSpans.length > 0) {
        console.log('⚡ Skipping ONNX - text contains only obvious non-NAME/ADDRESS patterns');
        return [];
      }
      
      // Create masked text to avoid analyzing already-detected regions
      let maskedText = text;
      let offsetMapping = []; // Track position changes due to masking
      
      // Sort existing spans by start position (descending) to avoid offset issues
      const sortedSpans = [...existingSpans].sort((a, b) => b.start - a.start);
      
      // Replace detected spans with placeholder text of same length
      for (const span of sortedSpans) {
        const spanLength = span.end - span.start;
        const placeholder = 'X'.repeat(spanLength); // Same length placeholder
        maskedText = maskedText.substring(0, span.start) + placeholder + maskedText.substring(span.end);
        console.log(`🎭 Masked span "${span.text}" (${span.start}-${span.end}) with "${placeholder}"`);
      }
      
      console.log(`🎭 Sending masked text to server: "${maskedText}"`);
      
      // Run ONNX inference on masked text
      const spans = await ONNXInference.predict(maskedText);
      
      // Filter spans based on what we actually need and haven't found yet
      const filteredSpans = spans.filter(span => {
        const meetsConfidence = span.confidence >= CONFIG.ONNX_CONFIDENCE_THRESHOLD;
        
        // Only include if category is enabled and not already found by regex
        const shouldInclude = (span.label === 'NAME' && needsNameDetection && !hasNameSpan) ||
                             (span.label === 'ADDRESS' && needsAddressDetection && !hasAddressSpan);
        
        // Check if span falls within a masked region (contains only X characters)
        const spanText = maskedText.substring(span.start, span.end);
        const isMaskedRegion = /^X+$/.test(spanText);
        
        if (isMaskedRegion) {
          console.log(`🎭 Rejecting span in masked region: "${spanText}" (${span.start}-${span.end})`);
          return false;
        }
        
        if (!meetsConfidence) {
          console.log(`🎯 Rejected ${span.label} prediction: confidence ${span.confidence.toFixed(3)} < ${CONFIG.ONNX_CONFIDENCE_THRESHOLD}`);
        }
        
        if (!shouldInclude && meetsConfidence) {
          console.log(`🚫 Skipping ${span.label} - ${hasNameSpan || hasAddressSpan ? 'already found by regex' : 'category disabled'}`);
        }
        
        return meetsConfidence && shouldInclude;
      }).filter(span => {
        // Remove spans that overlap with existing regex detections (additional safety check)
        const isOverlapping = existingSpans.some(existingSpan => {
          return DetectionEngine.spansOverlap(span, existingSpan);
        });
        
        if (isOverlapping) {
          console.log(`🚫 Removing overlapping ONNX span: "${span.text}" (${span.start}-${span.end}) overlaps with regex detection`);
        }
        
        return !isOverlapping;
      }).map(span => {
        // Map span text back to original text (since we used masked text for detection)
        const originalText = text.substring(span.start, span.end);
        
        // Apply smart categorization to ONNX results
        const categorization = SmartCategorizer.analyzeDetection(originalText, span.label, span.confidence);
        
        return {
          ...span,
          text: originalText, // Use original text instead of masked text
          confidence: categorization.confidence,
          possibleCategories: categorization.possibleCategories,
          needsUserInput: categorization.needsUserInput,
          reasoning: categorization.reasoning + ' (AI detected)',
          suggestions: SmartCategorizer.createCategorySuggestions(categorization)
        };
      });
      
      console.log('🎯 ONNX analysis results (after filtering):', filteredSpans);
      return filteredSpans;
    } catch (error) {
      console.error('❌ ONNX analysis failed:', error);
      return [];
    }
  },

  /**
   * Check if two spans overlap
   */
  spansOverlap: (span1, span2) => {
    return !(span1.end <= span2.start || span2.end <= span1.start);
  },
};
