/**
 * ONNX Model Inference for Local NER Detection
 * Matches the exact flow from the working FastAPI server
 */

const ONNXInference = {
  session: null,
  tokenizer: null,
  labels: null,
  isLoaded: false,
  
  /**
   * Initialize the ONNX model, tokenizer, and labels (matching server approach)
   */
  async initialize() {
    try {
      console.log('🤖 Loading ONNX model and tokenizer...');
      
      const modelUrl = chrome.runtime.getURL('assets/model.onnx');
      const tokenizerUrl = chrome.runtime.getURL('assets/tokenizer.json');
      const configUrl = chrome.runtime.getURL('assets/config.json');
      
      console.log('📍 Model URL:', modelUrl);
      console.log('📍 Tokenizer URL:', tokenizerUrl);
      console.log('📍 Config URL:', configUrl);
      
      // Load config.json first to get labels (matching server approach)
      try {
        const configResponse = await fetch(configUrl);
        if (!configResponse.ok) {
          throw new Error(`Config file not found: ${configResponse.status}`);
        }
        const cfg = await configResponse.json();
        console.log('✅ Config loaded successfully');
        
        // Extract labels exactly like server: cfg.get("id2label")
        const id2label = cfg.id2label;
        if (typeof id2label === 'object' && !Array.isArray(id2label)) {
          // keys like "0","1",... - convert to array
          this.labels = [];
          for (let i = 0; i < Object.keys(id2label).length; i++) {
            this.labels[i] = id2label[i.toString()];
          }
        } else if (Array.isArray(id2label)) {
          this.labels = id2label;
        } else {
          // fallback exactly like server
          this.labels = ["O", "B-NAME", "I-NAME", "B-ADDR", "I-ADDR"];
        }
        console.log('✅ Labels extracted from config:', this.labels);
      } catch (configError) {
        this.labels = ["O", "B-NAME", "I-NAME", "B-ADDR", "I-ADDR"];
        console.log('⚠️ Failed to load config, using fallback labels:', configError);
      }
      
      // Load tokenizer.json (matching server's AutoTokenizer.from_pretrained)
      try {
        const tokenizerResponse = await fetch(tokenizerUrl);
        if (!tokenizerResponse.ok) {
          throw new Error(`Tokenizer file not found: ${tokenizerResponse.status}`);
        }
        this.tokenizer = await tokenizerResponse.json();
        console.log('✅ Tokenizer loaded successfully');
        console.log('📊 Vocab size:', Object.keys(this.tokenizer.model.vocab).length);
      } catch (tokenizerError) {
        console.warn('⚠️ Failed to load tokenizer, using fallback detection:', tokenizerError);
        this.isLoaded = false;
        return;
      }
      
      // Load and create ONNX session
      try {
        const modelResponse = await fetch(modelUrl);
        if (!modelResponse.ok) {
          throw new Error(`Model file not found: ${modelResponse.status}`);
        }
        console.log('✅ Model file found');
        
        // Set up ONNX Runtime environment (matching server's session options)
        if (typeof ort !== 'undefined') {
          ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
          ort.env.wasm.simd = true;
          // Match server's thread settings: intra_op_num_threads = 1, inter_op_num_threads = 1
          ort.env.wasm.numThreads = 1;
          
          const modelArrayBuffer = await modelResponse.arrayBuffer();
          this.session = await ort.InferenceSession.create(modelArrayBuffer, {
            executionProviders: ['wasm'], // equivalent to CPUExecutionProvider
            intraOpNumThreads: 1,         // match server's so.intra_op_num_threads = 1
            interOpNumThreads: 1          // match server's so.inter_op_num_threads = 1
          });
          this.isLoaded = true;
          
          console.log('✅ ONNX model loaded successfully');
          console.log('📊 Model inputs:', this.session.inputNames);
          console.log('📊 Model outputs:', this.session.outputNames);
          console.log('📊 Active provider:', this.session.executionProviders);
          
        } else {
          throw new Error('ONNX Runtime not available');
        }
        
      } catch (modelError) {
        console.warn('⚠️ Failed to load ONNX model, using fallback detection:', modelError);
        this.isLoaded = false;
        return;
      }
      
    } catch (error) {
      console.warn('⚠️ Failed to initialize ONNX inference, using fallback detection:', error);
      this.isLoaded = false;
    }
  },

  /**
   * Softmax function - exactly like server's np_softmax
   */
  softmax(logits) {
    // x = x - np.max(x, axis=axis, keepdims=True)
    const maxLogit = Math.max(...logits);
    const shifted = logits.map(x => x - maxLogit);
    
    // e = np.exp(x)
    const expLogits = shifted.map(x => Math.exp(x));
    
    // return e / np.sum(e, axis=axis, keepdims=True)
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map(x => x / sumExp);
  },

  /**
   * Tokenize text using the loaded tokenizer.json (matching AutoTokenizer behavior)
   * Equivalent to: tok(text, return_offsets_mapping=True, return_tensors="np", truncation=True, max_length=max_len)
   */
  tokenize(text, maxLength = 256) {
    if (!this.tokenizer) {
      throw new Error('Tokenizer not loaded');
    }
    
    // Get vocab and special tokens from tokenizer
    const vocab = this.tokenizer.model.vocab;
    const clsToken = this.tokenizer.cls_token || '[CLS]';
    const sepToken = this.tokenizer.sep_token || '[SEP]';
    const padToken = this.tokenizer.pad_token || '[PAD]';
    const unkToken = this.tokenizer.unk_token || '[UNK]';
    
    // Get special token IDs
    const clsId = vocab[clsToken] || 101;
    const sepId = vocab[sepToken] || 102;
    const padId = vocab[padToken] || 0;
    const unkId = vocab[unkToken] || 100;
    
    // Tokenize with proper offset mapping
    const tokens = [clsToken];
    const inputIds = [clsId];
    const offsetMapping = [[0, 0]]; // CLS has no offset
    
    // Simple word-level tokenization with vocab lookup
    // Note: Real AutoTokenizer uses BPE/WordPiece, this is simplified but functional
    const words = text.match(/\S+/g) || [];
    let currentPos = 0;
    
    for (const word of words) {
      // Find word position in original text
      const wordStart = text.indexOf(word, currentPos);
      if (wordStart === -1) continue;
      
      // Convert word to lowercase for vocab lookup
      const normalizedWord = word.toLowerCase();
      
      // Try exact match first, then fallback to UNK
      let tokenId = vocab[normalizedWord];
      if (tokenId === undefined) {
        // Try with ## prefix for subwords
        tokenId = vocab[`##${normalizedWord}`];
        if (tokenId === undefined) {
          tokenId = unkId;
        }
      }
      
      tokens.push(normalizedWord);
      inputIds.push(tokenId);
      offsetMapping.push([wordStart, wordStart + word.length]);
      
      currentPos = wordStart + word.length;
      
      // Respect max length (leaving room for [SEP])
      if (inputIds.length >= maxLength - 1) break;
    }
    
    // Add SEP token
    tokens.push(sepToken);
    inputIds.push(sepId);
    offsetMapping.push([0, 0]); // SEP has no offset
    
    // Create attention mask (1 for real tokens, 0 for padding)
    const attentionMask = new Array(inputIds.length).fill(1);
    
    // Pad to maxLength
    while (inputIds.length < maxLength) {
      tokens.push(padToken);
      inputIds.push(padId);
      attentionMask.push(0);
      offsetMapping.push([0, 0]);
    }
    
    // Return in numpy-like format to match server
    return {
      input_ids: inputIds,
      attention_mask: attentionMask,
      offset_mapping: offsetMapping
    };
  },

  /**
   * Decode chunk - exactly like server's decode_chunk function
   */
  async decodeChunk(text, threshold, perType, maxLen) {
    // Equivalent to: enc = tok(text, return_offsets_mapping=True, return_tensors="np", truncation=True, max_length=max_len)
    const enc = this.tokenize(text, maxLen);
    
    console.log('🔤 Tokenized:', {
      inputLength: text.length,
      tokenCount: enc.input_ids.length,
      firstTokens: enc.input_ids.slice(0, 10),
      firstOffsets: enc.offset_mapping.slice(0, 10)
    });
    
    // Prepare inputs exactly like server
    // inputs = {"input_ids": enc["input_ids"].astype(np.int64), "attention_mask": enc["attention_mask"].astype(np.int64)}
    const inputIds = new BigInt64Array(enc.input_ids.map(id => BigInt(id)));
    const attentionMask = new BigInt64Array(enc.attention_mask.map(mask => BigInt(mask)));
    
    const inputs = {
      input_ids: new ort.Tensor('int64', inputIds, [1, enc.input_ids.length]),
      attention_mask: new ort.Tensor('int64', attentionMask, [1, enc.attention_mask.length])
    };
    
    // Add token_type_ids if expected (some models need this)
    // if "token_type_ids" in enc: inputs["token_type_ids"] = enc["token_type_ids"].astype(np.int64)
    // For DistilBERT, token_type_ids are usually not needed, but we can add zeros if required
    
    // Run inference - equivalent to: outputs = sess.run(None, inputs)
    const outputs = await this.session.run(inputs);
    let logits = outputs[this.session.outputNames[0]].data; // outputs[0]
    
    // Handle batch dimension - equivalent to: if logits.ndim == 3: logits = logits[0]
    const outputShape = outputs[this.session.outputNames[0]].dims;
    if (outputShape.length === 3) {
      // Remove batch dimension: convert from [1, seq, num_labels] to [seq, num_labels]
      const seqLen = outputShape[1];
      const numLabels = outputShape[2];
      const newLogits = new Float32Array(seqLen * numLabels);
      for (let i = 0; i < seqLen * numLabels; i++) {
        newLogits[i] = logits[i];
      }
      logits = newLogits;
    }
    
    const seqLen = enc.input_ids.length;
    const numLabels = this.labels.length;
    
    // Convert to probabilities - equivalent to: probs = np_softmax(logits, axis=-1)
    const probs = [];
    const ids = [];
    
    for (let i = 0; i < seqLen; i++) {
      const tokenLogits = [];
      for (let j = 0; j < numLabels; j++) {
        tokenLogits.push(logits[i * numLabels + j] || 0);
      }
      
      const tokenProbs = this.softmax(tokenLogits);
      const maxIdx = tokenProbs.indexOf(Math.max(...tokenProbs));
      
      probs.push(tokenProbs);
      ids.push(maxIdx);
    }
    
    // Get offset mapping - equivalent to: offs = enc["offset_mapping"][0]
    const offs = enc.offset_mapping;
    
    // Process spans exactly like server
    const spans = [];
    let cur = null;
    
    // chosen = probs[np.arange(len(ids)), ids] - get max probability for each prediction
    const chosen = ids.map((id, i) => probs[i][id]);
    
    // for i, (lab_id, p) in enumerate(zip(ids, chosen)):
    for (let i = 0; i < ids.length; i++) {
      const labId = ids[i];
      const p = chosen[i];
      const [s, e] = offs[i].map(x => parseInt(x)); // map(int, offs[i])
      
      // if (s == 0 and e == 0) or e <= s: continue
      if ((s === 0 && e === 0) || e <= s) {
        continue;
      }
      
      const lab = this.labels[parseInt(labId)] || 'O';
      
      // if lab == "O":
      if (lab === 'O') {
        if (cur) {
          spans.push(cur);
          cur = null;
        }
        continue;
      }
      
      // typ = lab.split("-", 1)[1] if "-" in lab else lab
      const typ = lab.includes('-') ? lab.split('-', 2)[1] : lab;
      const thr = perType[typ] || threshold; // thr = per_type.get(typ, threshold)
      
      // if p < thr:
      if (p < thr) {
        if (cur) {
          spans.push(cur);
          cur = null;
        }
        continue;
      }
      
      // start_new = (cur is None) or (typ != cur["label"]) or lab.startswith("B-")
      const startNew = !cur || (typ !== cur.label) || lab.startsWith('B-');
      
      if (startNew) {
        if (cur) {
          spans.push(cur);
        }
        cur = { start: s, end: e, label: typ, score: parseFloat(p) };
      } else {
        // cur["end"] = max(cur["end"], e)
        cur.end = Math.max(cur.end, e);
        // cur["score"] = max(cur["score"], float(p))
        cur.score = Math.max(cur.score, parseFloat(p));
      }
    }
    
    // if cur: spans.append(cur)
    if (cur) {
      spans.push(cur);
    }
    
    // for s in spans: s["text"] = text[s["start"]:s["end"]]
    for (const s of spans) {
      s.text = text.substring(s.start, s.end);
      s.confidence = s.score; // Match our interface
      s.source = 'onnx-tokenizer';
    }
    
    console.log('📊 Decoded spans:', spans);
    return spans;
  },

  /**
   * Detect function - equivalent to server's detect function
   */
  async detect(text, threshold = 0.65, perLabelThreshold = null, maxLen = 256, strideChars = 512) {
    // defaults for your two classes; caller can override - equivalent to server's per_type setup
    // per_type = {"NAME": threshold, "ADDR": max(threshold, 0.70)}
    const perType = { 
      "NAME": threshold, 
      "ADDR": Math.max(threshold, 0.70) 
    };
    
    if (perLabelThreshold) {
      // per_type.update(per_label_threshold)
      Object.assign(perType, perLabelThreshold);
    }
    
    console.log('🎯 Detection thresholds:', perType);
    
    // Fast path: short input - equivalent to: if len(tok(text)["input_ids"]) <= max_len:
    try {
      const quickTokens = this.tokenize(text, maxLen);
      if (quickTokens.input_ids.filter(id => id !== 0).length <= maxLen) { // count non-padding tokens
        return await this.decodeChunk(text, threshold, perType, maxLen);
      }
    } catch (e) {
      console.log('⚠️ Quick tokenization failed, proceeding with chunking');
    }
    
    // Long input: slide over chars, then merge overlapping spans
    // This matches the server's chunking logic exactly
    const spansAll = [];
    let i = 0;
    const CHUNK = 2000; // char window; tokenizer will clamp to max_len
    const n = text.length;
    
    while (i < n) {
      const piece = text.substring(i, i + CHUNK); // text[i:i + CHUNK]
      const spans = await this.decodeChunk(piece, threshold, perType, maxLen);
      
      // Adjust offsets for global position
      for (const s of spans) {
        s.start += i;
        s.end += i;
        s.text = text.substring(s.start, s.end); // text[s["start"]:s["end"]]
      }
      spansAll.push(...spans); // spans_all.extend(spans)
      
      const step = Math.max(CHUNK - strideChars, 1); // step = max(CHUNK - stride_chars, 1)
      i += step;
    }
    
    // Sort spans - spans_all.sort(key=lambda x: (x["start"], x["end"]))
    spansAll.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
    
    // Merge overlapping spans of same label
    const merged = [];
    for (const s of spansAll) {
      if (merged.length === 0) {
        merged.push(s);
        continue;
      }
      
      const m = merged[merged.length - 1];
      // if s["label"] == m["label"] and s["start"] <= m["end"]:
      if (s.label === m.label && s.start <= m.end) {
        // m["end"] = max(m["end"], s["end"])
        m.end = Math.max(m.end, s.end);
        // m["score"] = max(m["score"], s["score"])
        m.score = Math.max(m.score, s.score);
        // m["text"] = text[m["start"]:m["end"]]
        m.text = text.substring(m.start, m.end);
        m.confidence = m.score;
      } else {
        merged.push(s);
      }
    }
    
    return merged;
  },

  /**
   * Main predict function - matches the server API exactly
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
      console.log('🤖 Running ONNX inference on:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
      
      // Use the exact same flow as the server with same default parameters
      const spans = await this.detect(
        text, 
        CONFIG.ONNX_CONFIDENCE_THRESHOLD,  // threshold = 0.65 (from config)
        null,  // per_label_threshold = None
        256,   // max_len = 256
        512    // stride_chars = 512
      );
      
      console.log('📊 Final ONNX spans:', spans);
      
      // Convert to our standard format
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
      console.error('❌ ONNX inference failed:', error);
      console.log('🔄 Falling back to regex detection');
      return this.fallbackDetection(text);
    }
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
      /\bBlk\s+\d+[A-Za-z]?\s+[A-Za-z\s]+(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Lane|Ln)\s*\d*/gi,  // Singapore block format
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
        if (match[0].toLowerCase().includes('blk')) {
          confidence = 0.9; // Higher confidence for Singapore block format
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

    console.log('🔄 Fallback detection found spans:', spans);
    return spans;
  }
};

// Initialize the model when the script loads
ONNXInference.initialize();

// Export for other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ONNXInference;
}
