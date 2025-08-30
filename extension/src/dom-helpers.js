/**
 * DOM Manipulation & Highlighting for Privately Extension
 */

const DOMHelpers = {
  /**
   * Clear all highlights from contenteditable elements
   */
  clearHighlights: (rootElement) => {
    if (!rootElement) return;
    
    const highlights = rootElement.querySelectorAll('span.pg-underline');
    highlights.forEach(span => {
      const textNode = document.createTextNode(span.textContent || '');
      span.replaceWith(textNode);
    });
  },

  /**
   * Add visual highlights to detected sensitive data in contenteditable elements
   */
  highlightContentEditable: (rootElement, spans) => {
    if (!rootElement || !spans?.length) {
      console.log('🚫 No root element or spans to highlight');
      return;
    }

    console.log('🎨 Highlighting spans in contenteditable:', spans);

    // Clear existing highlights first
    DOMHelpers.clearHighlights(rootElement);

    // Get the text content
    const textContent = rootElement.textContent || rootElement.innerText || '';
    console.log('📝 Text content to highlight:', textContent);

    // Simple approach: find and wrap each span
    spans.forEach((span, index) => {
      console.log(`🔍 Processing span ${index + 1}:`, span);
      
      if (span.start >= 0 && span.end <= textContent.length) {
        const result = DOMHelpers.wrapTextRange(rootElement, span.start, span.end, span.label);
        if (!result) {
          console.warn('⚠️ Failed to wrap span:', span);
        }
      } else {
        console.warn('⚠️ Span out of bounds:', span, 'Text length:', textContent.length);
      }
    });
  },

  /**
   * Wrap a text range with highlighting span
   */
  wrapTextRange: (rootElement, start, end, label) => {
    try {
      const textContent = rootElement.textContent || rootElement.innerText || '';
      const textToHighlight = textContent.substring(start, end);
      
      console.log(`🎯 Wrapping "${textToHighlight}" (${start}-${end}) with label ${label}`);
      
      // Find the text node and position
      const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let currentPos = 0;
      let node = walker.nextNode();
      
      while (node) {
        const nodeLength = node.textContent.length;
        const nodeEnd = currentPos + nodeLength;
        
        // Check if this node contains the start of our span
        if (currentPos <= start && start < nodeEnd) {
          const startOffset = start - currentPos;
          let endOffset;
          let endNode = node;
          
          // Check if the end is in the same node
          if (end <= nodeEnd) {
            endOffset = end - currentPos;
          } else {
            // Span crosses multiple nodes - for simplicity, just highlight first node
            endOffset = nodeLength;
            console.warn('⚠️ Span crosses multiple nodes, highlighting first part only');
          }
          
          // Create the range and highlight
          if (startOffset < endOffset) {
            const range = document.createRange();
            range.setStart(node, startOffset);
            range.setEnd(endNode, endOffset);
            
            const highlight = document.createElement('span');
            highlight.className = 'pg-underline';
            highlight.setAttribute('data-label', label);
            highlight.setAttribute('title', `Privacy violation: ${label}`);
            
            // Add event listeners
            highlight.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('🖱️ Clicked violation:', label, textToHighlight);
              
              // Close any existing main tooltips when showing inline tooltip
              if (typeof TooltipManager !== 'undefined' && TooltipManager.removeAllTooltips) {
                TooltipManager.removeAllTooltips();
              }
              
              DOMHelpers.showInlineTooltip(highlight, { label, text: textToHighlight });
            });
            
            highlight.addEventListener('mouseenter', (e) => {
              console.log('🔍 Hovering over violation:', label);
              DOMHelpers.showQuickPreview(highlight, { label, text: textToHighlight });
            });
            
            highlight.addEventListener('mouseleave', (e) => {
              DOMHelpers.hideQuickPreview();
            });
            
            try {
              range.surroundContents(highlight);
              console.log('✅ Successfully created highlight for:', textToHighlight);
              return true;
            } catch (rangeError) {
              console.warn('⚠️ Range error:', rangeError);
              return false;
            }
          }
          break;
        }
        
        currentPos = nodeEnd;
        node = walker.nextNode();
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error in wrapTextRange:', error);
      return false;
    }
  },

  /**
   * Show a quick preview tooltip on hover (like Grammarly)
   */
  showQuickPreview: (element, span) => {
    // Remove any existing preview
    DOMHelpers.hideQuickPreview();
    
    const preview = document.createElement('div');
    preview.className = 'pg-quick-preview';
    preview.innerHTML = `
      <div class="pg-preview-header">
        <span class="pg-preview-icon">🔒</span>
        <strong>${span.label}</strong> detected
      </div>
      <div class="pg-preview-text">${element.textContent}</div>
    `;
    
    // Position the preview
    const rect = element.getBoundingClientRect();
    preview.style.position = 'absolute';
    preview.style.left = `${rect.left + window.scrollX}px`;
    preview.style.top = `${rect.bottom + window.scrollY + 5}px`;
    preview.style.zIndex = '2147483647';
    
    document.body.appendChild(preview);
    
    // Auto-hide after 3 seconds
    setTimeout(() => DOMHelpers.hideQuickPreview(), 3000);
  },

  /**
   * Hide quick preview tooltip
   */
  hideQuickPreview: () => {
    const existing = document.querySelector('.pg-quick-preview');
    if (existing) {
      existing.remove();
    }
  },

  /**
   * Show inline tooltip when violation is clicked (like Grammarly suggestions)
   */
  showInlineTooltip: (element, span) => {
    // Use the existing tip system but position it near the violation
    const rect = element.getBoundingClientRect();
    
    // Get preferences if available, otherwise use default replacement
    let replacement = `[${span.label} REDACTED]`;
    try {
      if (typeof getUserPreferences === 'function') {
        const prefs = getUserPreferences();
        replacement = prefs.customReplacements?.[span.label] || replacement;
      }
    } catch (error) {
      console.log('📝 Using default replacement for', span.label);
    }
    
    // Create tip content for this specific violation
    const tipData = {
      originalText: element.textContent,
      label: span.label,
      replacement: replacement,
      position: {
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 10
      }
    };
    
    // Show tip with replacement options
    DOMHelpers.showViolationTip(element, tipData);
  },

  /**
   * Show violation-specific tip with replacement actions
   */
  showViolationTip: (element, tipData) => {
    // Remove any existing tips (both main tooltips and inline tips)
    const existingTip = document.querySelector('.pg-tip');
    if (existingTip) {
      existingTip.remove();
    }
    
    // Also remove any quick previews
    DOMHelpers.hideQuickPreview();
    
    const tip = document.createElement('div');
    tip.className = 'pg-tip pg-inline-tip';
    tip.innerHTML = `
      <div class="pg-tip-header">
        <div class="pg-tip-logo"></div>
        Privacy Violation: ${tipData.label}
      </div>
      <div class="pg-tip-content">
        <strong>Detected:</strong> "${tipData.originalText}"<br>
        <small>Click an action below to handle this violation</small>
      </div>
      <div class="pg-tip-actions">
        <button data-act="replace">Replace</button>
        <button data-act="allow">Allow Once</button>
        <button data-act="ignore">Ignore</button>
      </div>
    `;
    
    // Position the tip
    tip.style.position = 'absolute';
    tip.style.left = `${tipData.position.x}px`;
    tip.style.top = `${tipData.position.y}px`;
    tip.style.zIndex = '2147483647';
    
    // Add action handlers
    tip.querySelector('[data-act="replace"]').addEventListener('click', () => {
      element.textContent = tipData.replacement;
      element.classList.add('pg-replaced');
      tip.remove();
    });
    
    tip.querySelector('[data-act="allow"]').addEventListener('click', () => {
      element.classList.add('pg-allowed');
      element.style.borderBottom = 'none';
      tip.remove();
    });
    
    tip.querySelector('[data-act="ignore"]').addEventListener('click', () => {
      element.classList.add('pg-ignored');
      element.style.borderBottom = 'none';
      tip.remove();
    });
    
    document.body.appendChild(tip);
    
    // Auto-hide after 10 seconds
    const autoHideTimeout = setTimeout(() => {
      if (tip.parentNode) {
        tip.remove();
      }
    }, 10000);
    
    // Hide when clicking elsewhere (use global click handler approach)
    const hideOnClick = (e) => {
      if (!tip.contains(e.target) && !element.contains(e.target)) {
        tip.remove();
        clearTimeout(autoHideTimeout);
        document.removeEventListener('click', hideOnClick, true);
      }
    };
    
    // Add delay to prevent immediate closure from the click that opened this
    setTimeout(() => {
      document.addEventListener('click', hideOnClick, true);
    }, 100);
  },

  /**
   * Calculate total text length of an element
   */
  calculateTextLength: (element) => {
    let length = 0;
    const iterator = document.createNodeIterator(element, NodeFilter.SHOW_TEXT);
    let node;
    
    while ((node = iterator.nextNode())) {
      length += node.nodeValue?.length || 0;
    }
    
    return length;
  }
};
