/**
 * Detection Engine for Privately Extension
 */

const DetectionEngine = {
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
   * Analyze text using backend service
   * TEMPORARILY DISABLED - AI model not connected yet
   */
  analyzeWithBackend: async (text) => {
    // TODO: Re-enable when AI backend is properly set up
    return null;
    
    /* COMMENTED OUT UNTIL AI BACKEND IS READY
    try {
      const prefs = getUserPreferences();
      
      const response = await fetch(CONFIG.BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          threshold: 0.65,
          per_label_threshold: { "PER": 0.65, "ADDR": 0.70, "ORG": 0.75 },
          max_len: 256,
          stride_chars: 512
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Backend analysis successful:', data);

        return data.spans
          .map(span => ({
            start: span.start,
            end: span.end,
            label: span.label === 'PER' ? 'NAME' : 
                   span.label === 'ADDR' ? 'ADDRESS' : 
                   span.label,
            confidence: span.score,
            text: span.text
          }))
          .filter(span => {
            // Filter out disabled categories
            return prefs.categories && prefs.categories[span.label] !== false;
          });
      }
    } catch (error) {
      console.error('Backend analysis failed:', error);
    }

    return null;
    */
  }
};
