/**
 * ONNX Model Inference for Local NER Detection
 */

const ONNXInference = {
  session: null,
  isLoaded: false,
  
  /**
   * Initialize the ONNX model
   */
  async initialize() {
    try {
      console.log('🤖 Loading ONNX model...');
      
      const modelUrl = chrome.runtime.getURL('assets/model.onnx');
      console.log('📍 Model URL:', modelUrl);
      
      // Check if model file exists
      try {
        const response = await fetch(modelUrl);
        if (!response.ok) {
          throw new Error(`Model file not found: ${response.status}`);
        }
        console.log('✅ Model file found');
      } catch (fetchError) {
        console.warn('⚠️ Model file not found, will use fallback detection');
        this.isLoaded = false;
        return;
      }
      
      this.session = await ort.InferenceSession.create(modelUrl);
      this.isLoaded = true;
      
      console.log('✅ ONNX model loaded successfully');
      console.log('📊 Model inputs:', this.session.inputNames);
      console.log('📊 Model outputs:', this.session.outputNames);
      
    } catch (error) {
      console.warn('⚠️ Failed to load ONNX model, using fallback detection:', error);
      this.isLoaded = false;
    }
  },
  
  /**
   * Simple tokenizer - splits text into words
   */
  tokenize(text) {
    // Simple whitespace tokenization
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return words;
  },
  
  /**
   * Convert tokens to input format expected by the model
   */
  prepareInputs(tokens, maxLength = 128) {
    // This is a simplified approach - you may need to adjust based on your model
    // Most NER models expect input_ids, attention_mask, etc.
    
    // Simple character-level encoding (adjust based on your model's requirements)
    const inputIds = tokens.map(token => {
      // Convert each character to a simple numeric representation
      return Array.from(token).map(char => char.charCodeAt(0) % 1000);
    }).flat();
    
    // Pad or truncate to maxLength
    const paddedIds = inputIds.slice(0, maxLength);
    while (paddedIds.length < maxLength) {
      paddedIds.push(0);
    }
    
    return {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(paddedIds.map(id => BigInt(id))), [1, maxLength]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(paddedIds.map(id => id > 0 ? BigInt(1) : BigInt(0))), [1, maxLength])
    };
  },
  
  /**
   * Convert model predictions to entity spans
   */
  postprocessPredictions(predictions, tokens, originalText) {
    const spans = [];
    
    try {
      // Extract predictions (adjust based on your model output format)
      const logits = predictions[this.session.outputNames[0]];
      const data = logits.data;
      
      // Convert to probabilities and get predicted labels
      const numTokens = Math.min(tokens.length, data.length / CONFIG.ONNX_MODEL_LABELS.length);
      
      let currentEntity = null;
      let currentStart = 0;
      
      for (let i = 0; i < numTokens; i++) {
        // Get the prediction for this token
        const startIdx = i * CONFIG.ONNX_MODEL_LABELS.length;
        const tokenPredictions = Array.from(data.slice(startIdx, startIdx + CONFIG.ONNX_MODEL_LABELS.length));
        
        // Get the label with highest probability
        const maxIdx = tokenPredictions.indexOf(Math.max(...tokenPredictions));
        const predictedLabel = CONFIG.ONNX_MODEL_LABELS[maxIdx];
        
        // Process BIO tags
        if (predictedLabel.startsWith('B-')) {
          // Beginning of new entity
          if (currentEntity) {
            // Finish previous entity
            spans.push(this.createSpan(currentEntity, currentStart, i - 1, tokens, originalText));
          }
          
          currentEntity = {
            type: predictedLabel.substring(2), // Remove 'B-' prefix
            confidence: Math.max(...tokenPredictions)
          };
          currentStart = i;
          
        } else if (predictedLabel.startsWith('I-') && currentEntity) {
          // Inside entity - continue current entity
          const entityType = predictedLabel.substring(2); // Remove 'I-' prefix
          if (entityType === currentEntity.type) {
            // Update confidence (average)
            currentEntity.confidence = (currentEntity.confidence + Math.max(...tokenPredictions)) / 2;
          } else {
            // Different entity type, finish current and start new
            spans.push(this.createSpan(currentEntity, currentStart, i - 1, tokens, originalText));
            currentEntity = {
              type: entityType,
              confidence: Math.max(...tokenPredictions)
            };
            currentStart = i;
          }
          
        } else {
          // Outside entity or 'O' tag
          if (currentEntity) {
            spans.push(this.createSpan(currentEntity, currentStart, i - 1, tokens, originalText));
            currentEntity = null;
          }
        }
      }
      
      // Handle any remaining entity
      if (currentEntity) {
        spans.push(this.createSpan(currentEntity, currentStart, numTokens - 1, tokens, originalText));
      }
      
    } catch (error) {
      console.error('❌ Error processing ONNX predictions:', error);
    }

    // Filter spans by confidence threshold
    const filteredSpans = spans.filter(span => {
      const meetsThreshold = span.confidence >= CONFIG.ONNX_CONFIDENCE_THRESHOLD;
      if (!meetsThreshold) {
        console.log(`🎯 Filtered out ${span.label} prediction: confidence ${span.confidence.toFixed(3)} < ${CONFIG.ONNX_CONFIDENCE_THRESHOLD}`);
      }
      return meetsThreshold;
    });
    
    console.log(`🎯 ONNX predictions after confidence filtering: ${filteredSpans.length}/${spans.length} kept`);
    return filteredSpans;
  },
  
  /**
   * Create a span object from entity information
   */
  createSpan(entity, startTokenIdx, endTokenIdx, tokens, originalText) {
    // Find the character positions in the original text
    const entityTokens = tokens.slice(startTokenIdx, endTokenIdx + 1);
    const entityText = entityTokens.join(' ');
    
    // Find the position in original text
    const start = originalText.indexOf(entityText);
    const end = start + entityText.length;
    
    // Map entity types to our labels
    const labelMap = {
      'PER': 'NAME',
      'ADDR': 'ADDRESS'
    };
    
    const label = labelMap[entity.type] || entity.type;
    
    return {
      start: start >= 0 ? start : 0,
      end: end >= 0 ? end : entityText.length,
      label: label,
      confidence: entity.confidence,
      text: entityText
    };
  },
  
  /**
   * Fallback detection using simple regex patterns when ONNX model is not available
   */
  fallbackDetection(text) {
    const spans = [];
    
    // Enhanced name detection patterns
    const namePatterns = [
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,  // First Last Name format
      /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,  // With titles
      /\b[A-Z][a-z]+(?:\s+[A-Z]\.?\s*)+[A-Z][a-z]+\b/g  // First Middle Last
    ];
    
    // Enhanced address detection patterns  
    const addressPatterns = [
      /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Circle|Cir|Way|Plaza|Place|Pl)\b/gi,
      /\b[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g,  // City, State ZIP
      /\b\d+\s+[A-Za-z0-9\s#-]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g  // Full address
    ];
    
    // Apply name patterns
    namePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Apply confidence scoring based on pattern complexity
        let confidence = 0.7; // Base confidence for fallback
        if (match[0].includes('Mr.') || match[0].includes('Mrs.') || match[0].includes('Dr.')) {
          confidence = 0.85; // Higher confidence for titles
        }
        if (match[0].split(' ').length >= 3) {
          confidence = Math.min(confidence + 0.1, 0.95); // Boost for full names
        }
        
        // Only include if meets confidence threshold
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
    
    // Apply address patterns
    addressPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Apply confidence scoring
        let confidence = 0.75; // Base confidence for addresses
        if (match[0].includes(',') && /\d{5}/.test(match[0])) {
          confidence = 0.9; // Higher confidence for complete addresses with ZIP
        }
        
        // Only include if meets confidence threshold
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

    console.log('🔄 Fallback detection found (>60% confidence):', spans);
    return spans;
  },
  
  /**
   * Run inference on text
   */
  async predict(text) {
    if (!this.isLoaded) {
      console.log('🤖 Model not loaded, attempting to initialize...');
      await this.initialize();
    }
    
    if (!this.isLoaded) {
      console.log('🔄 ONNX model not available, using fallback detection');
      return this.fallbackDetection(text);
    }
    
    try {
      console.log('🤖 Running ONNX inference on:', text);
      
      // Tokenize input text
      const tokens = this.tokenize(text);
      console.log('🔤 Tokens:', tokens);
      
      // Prepare model inputs
      const inputs = this.prepareInputs(tokens);
      console.log('📥 Model inputs prepared');
      
      // Run inference
      const results = await this.session.run(inputs);
      console.log('🎯 ONNX inference results:', results);
      
      // Post-process predictions
      const spans = this.postprocessPredictions(results, tokens, text);
      console.log('📊 Extracted spans:', spans);
      
      return spans;
      
    } catch (error) {
      console.error('❌ ONNX inference failed:', error);
      return [];
    }
  }
};

// Initialize the model when the script loads
ONNXInference.initialize();
