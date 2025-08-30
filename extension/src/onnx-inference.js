/**
 * FastAPI Server Integration for NER Detection
 * Connects to backend server instead of using local ONNX model
 */

const ONNXInference = {
  labels: null,
  isLoaded: false,
  serverUrl: 'http://127.0.0.1:8000', // FastAPI server URL
  
  /**
   * Initialize connection to FastAPI server
   */
  async initialize() {
    try {
      console.log('🌐 Connecting to FastAPI server...');
      
      // Test server connectivity with health endpoint
      const healthResponse = await fetch(`${this.serverUrl}/health`);
      if (!healthResponse.ok) {
        throw new Error(`Server health check failed: ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      console.log('✅ Server connection successful:', healthData);
      
      // Extract labels from server response
      this.labels = healthData.labels || ["O", "B-NAME", "I-NAME", "B-ADDR", "I-ADDR"];
      this.isLoaded = true;
      
      console.log('✅ FastAPI server initialized successfully');
      console.log('📊 Available labels:', this.labels);
      console.log('📊 Active provider:', healthData.provider);
      
    } catch (error) {
      console.warn('⚠️ Failed to connect to FastAPI server, using fallback detection:', error);
      this.isLoaded = false;
    }
  },

  /**
   * Call FastAPI server's /detect endpoint
   */
  async callServerDetect(text, threshold = 0.65, perLabelThreshold = null, maxLen = 256, strideChars = 512) {
    try {
      const requestBody = {
        text: text,
        threshold: threshold,
        max_len: maxLen,
        stride_chars: strideChars
      };

      // Add per_label_threshold if provided
      if (perLabelThreshold) {
        requestBody.per_label_threshold = perLabelThreshold;
      }

      console.log('🌐 Calling FastAPI /detect endpoint:', {
        url: `${this.serverUrl}/detect`,
        textLength: text.length,
        threshold: threshold,
        maxLen: maxLen,
        strideChars: strideChars
      });

      const response = await fetch(`${this.serverUrl}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Server request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Server response received:', {
        spanCount: result.spans.length,
        provider: result.provider,
        labels: result.labels
      });

      return result.spans.map(span => ({
        start: span.start,
        end: span.end,
        label: span.label,
        score: span.score,
        confidence: span.score,
        text: span.text,
        source: 'fastapi-server'
      }));

    } catch (error) {
      console.error('❌ FastAPI server request failed:', error);
      throw error;
    }
  },

  /**
   * Main predict function - calls FastAPI server
   */
  async predict(text) {
    if (!this.isLoaded) {
      console.log('🌐 Server not connected, attempting to initialize...');
      await this.initialize();
    }
    
    if (!this.isLoaded) {
      console.log('🔄 FastAPI server not available, using fallback detection');
      return this.fallbackDetection(text);
    }
    
    try {
      console.log('🌐 Calling FastAPI server for inference on:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
      
      // Call the FastAPI server
      const spans = await this.callServerDetect(
        text, 
        CONFIG.ONNX_CONFIDENCE_THRESHOLD,
        null,
        256,
        512
      );
      
      console.log('📊 FastAPI server returned spans:', spans);
      
      // Convert server labels to extension format
      return spans.map(span => ({
        start: span.start,
        end: span.end,
        label: span.label === 'NAME' ? 'NAME' : 
               span.label === 'ADDR' ? 'ADDRESS' : span.label,
        confidence: span.confidence,
        text: span.text,
        source: span.source
      }));
      
    } catch (error) {
      console.error('❌ FastAPI server inference failed:', error);
      console.log('🔄 Falling back to regex detection');
      return this.fallbackDetection(text);
    }
  },

  /**
   * Fallback detection using regex patterns when server is unavailable
   */
  fallbackDetection(text) {
    const spans = [];
    
    // Name detection patterns
    const namePatterns = [
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
      /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
      /\b[A-Z][a-z]+(?:\s+[A-Z]\.?\s*)+[A-Z][a-z]+\b/g
    ];
    
    // Address detection patterns  
    const addressPatterns = [
      /\bBlk\s+\d+[A-Za-z]?\s+[A-Za-z\s]+(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Lane|Ln)\s*\d*/gi,
      /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Circle|Cir|Way|Plaza|Place|Pl)\b/gi,
      /\b[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g,
      /\b\d+\s+[A-Za-z0-9\s#-]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g
    ];
    
    // Process name patterns
    namePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let confidence = 0.7;
        if (match[0].includes('Mr.') || match[0].includes('Mrs.') || match[0].includes('Dr.')) {
          confidence = 0.85;
        }
        if (match[0].split(' ').length >= 3) {
          confidence = Math.min(confidence + 0.1, 0.95);
        }
        
        if (confidence >= CONFIG.ONNX_CONFIDENCE_THRESHOLD) {
          spans.push({
            start: match.index,
            end: match.index + match[0].length,
            label: 'NAME',
            confidence: confidence,
            text: match[0],
            source: 'fallback-regex'
          });
        }
      }
    });
    
    // Process address patterns
    addressPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let confidence = 0.75;
        if (match[0].includes(',') && /\d{5}/.test(match[0])) {
          confidence = 0.9;
        }
        if (match[0].toLowerCase().includes('blk')) {
          confidence = 0.9;
        }
        
        if (confidence >= CONFIG.ONNX_CONFIDENCE_THRESHOLD) {
          spans.push({
            start: match.index,
            end: match.index + match[0].length,
            label: 'ADDRESS', 
            confidence: confidence,
            text: match[0],
            source: 'fallback-regex'
          });
        }
      }
    });

    console.log('🔄 Fallback detection found spans:', spans);
    return spans;
  }
};

// Initialize the server connection when the script loads
ONNXInference.initialize();
