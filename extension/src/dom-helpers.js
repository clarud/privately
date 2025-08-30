/**
 * DOM Manipulation & Highlighting for Privately Extension
 */

const DOMHelpers = {
  /**
   * Clear all highlights from contenteditable elements
   */
  clearHighlights: (rootElement) => {
    if (!rootElement) return;
    
    console.log('🧹 Clearing contenteditable highlights for:', rootElement?.tagName);
    
    // Use stored cleanup function if available
    if (rootElement._pgCleanupOverlay) {
      rootElement._pgCleanupOverlay();
      rootElement._pgCleanupOverlay = null;
      console.log('✅ Used cleanup function to remove contenteditable overlay');
    }
    
    // Remove overlay reference
    if (rootElement._pgOverlay) {
      rootElement._pgOverlay = null;
    }
    
    // Clean up any orphaned contenteditable overlays
    const orphanedOverlays = document.body.querySelectorAll('.pg-contenteditable-overlay');
    orphanedOverlays?.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        console.log('✅ Cleaned up orphaned contenteditable overlay');
      }
    });
    
    // Also clean up old span-based highlights if any
    const highlights = rootElement.querySelectorAll('span.pg-underline');
    highlights.forEach(span => {
      const textNode = document.createTextNode(span.textContent || '');
      span.replaceWith(textNode);
    });
  },

  /**
   * Add visual highlights to detected sensitive data in contenteditable elements using overlay technique
   */
  highlightContentEditable: (rootElement, spans) => {
    try {
      if (!rootElement || !spans?.length) {
        console.log('🚫 No root element or spans to highlight');
        DOMHelpers.clearHighlights(rootElement);
        return;
      }

      console.log('🎨 Highlighting ALL spans in contenteditable using Grammarly-style overlay:', spans);

      // Clear existing highlights first
      DOMHelpers.clearHighlights(rootElement);

      // Validate element is still in DOM
      if (!document.contains(rootElement)) {
        console.warn('⚠️ Root element not in DOM, skipping highlight');
        return;
      }

      // Create invisible overlay container
      let overlay = document.createElement('div');
      overlay.className = 'pg-contenteditable-overlay';
      overlay.style.cssText = `
        position: fixed !important;
        pointer-events: none !important;
        z-index: 999999 !important;
        background: transparent !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      `;

      // Add to document body safely
      try {
        document.body.appendChild(overlay);
      } catch (e) {
        console.error('❌ Failed to add overlay to body:', e);
        return;
      }

      const textContent = rootElement.textContent || rootElement.innerText || '';
      const computedStyle = window.getComputedStyle(rootElement);
      const rootRect = rootElement.getBoundingClientRect();
      
      // Position overlay to match contenteditable exactly
      overlay.style.left = rootRect.left + 'px';
      overlay.style.top = rootRect.top + 'px';
      overlay.style.width = rootRect.width + 'px';
      overlay.style.height = rootRect.height + 'px';

      console.log('📍 ContentEditable overlay positioned for all violations');

      // Create text measurer with same styling as contenteditable
      const measurer = document.createElement('div');
      measurer.style.cssText = `
        visibility: hidden !important;
        position: absolute !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        font-family: ${computedStyle.fontFamily} !important;
        font-size: ${computedStyle.fontSize} !important;
        font-weight: ${computedStyle.fontWeight} !important;
        line-height: ${computedStyle.lineHeight} !important;
        letter-spacing: ${computedStyle.letterSpacing} !important;
        padding: ${computedStyle.padding} !important;
        margin: 0 !important;
        border: none !important;
        width: ${rootRect.width}px !important;
      `;
      
      try {
        document.body.appendChild(measurer);
      } catch (e) {
        console.error('❌ Failed to add measurer to body:', e);
        // Clean up overlay if measurer fails
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        return;
      }

      try {
        const paddingLeft = parseInt(computedStyle.paddingLeft, 10) || 0;
        const paddingTop = parseInt(computedStyle.paddingTop, 10) || 0;
        const paddingRight = parseInt(computedStyle.paddingRight, 10) || 0;
        const lineHeight = parseInt(computedStyle.lineHeight, 10) || parseInt(computedStyle.fontSize, 10);
        const maxContentWidth = rootRect.width - paddingLeft - paddingRight;

        // Create underlines for ALL violations
        spans.forEach((span, index) => {
          try {
            if (span.start >= 0 && span.end <= textContent.length) {
              const beforeText = textContent.substring(0, span.start);
              const spanText = textContent.substring(span.start, span.end);
              
              // Simple text measurement approach
              measurer.textContent = beforeText;
              const startX = measurer.offsetWidth || 0;
              
              measurer.textContent = beforeText + spanText;
              const endX = measurer.offsetWidth || 0;
              
              // Calculate positioning within bounds
              const underlineLeft = Math.max(0, Math.min(startX, maxContentWidth - 10)) + paddingLeft;
              const availableWidth = Math.max(0, maxContentWidth - (startX - paddingLeft));
              const underlineWidth = Math.max(1, Math.min(endX - startX, availableWidth));
              const underlineTop = paddingTop + lineHeight - 2;
              
              // Create Grammarly-style underline
              const underline = document.createElement('div');
              underline.className = 'pg-contenteditable-underline';
              underline.style.cssText = `
                position: absolute !important;
                left: ${underlineLeft}px !important;
                top: ${underlineTop}px !important;
                width: ${underlineWidth}px !important;
                height: 2px !important;
                background-color: ${DOMHelpers.getViolationColor(span.label)} !important;
                border-radius: 1px !important;
                z-index: 1000001 !important;
                pointer-events: auto !important;
                cursor: pointer !important;
                transition: opacity 0.2s ease !important;
              `;
              underline.setAttribute('data-label', span.label);
              underline.setAttribute('data-span-start', span.start.toString());
              underline.setAttribute('data-span-end', span.end.toString());
              
              // Add click handler for tooltip
              underline.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🖱️ Clicked contenteditable violation:', span.label, span.text);
                DOMHelpers.showInlineTooltip(underline, { label: span.label, text: span.text });
              });
              
              // Add hover effects
              underline.addEventListener('mouseenter', () => {
                underline.style.opacity = '0.8';
              });
              
              underline.addEventListener('mouseleave', () => {
                underline.style.opacity = '1';
              });
              
              overlay.appendChild(underline);
              console.log(`✅ Added contenteditable underline ${index + 1}/${spans.length} for "${spanText}"`);
            }
          } catch (spanError) {
            console.error(`❌ Error processing span ${index}:`, spanError, span);
          }
        });

      } finally {
        // Always clean up measurer
        try {
          if (measurer.parentNode) {
            document.body.removeChild(measurer);
          }
        } catch (cleanupError) {
          console.error('❌ Error cleaning up measurer:', cleanupError);
        }
      }
      
      // Store reference for cleanup
      rootElement._pgOverlay = overlay;
      rootElement._pgCleanupOverlay = () => {
        try {
          if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
            console.log('🧹 Cleaned up contenteditable overlay with all underlines');
          }
        } catch (cleanupError) {
          console.error('❌ Error during overlay cleanup:', cleanupError);
        }
      };
      
    } catch (error) {
      console.error('❌ Error in highlightContentEditable:', error);
      // Try to clean up any partial state
      DOMHelpers.clearHighlights(rootElement);
    }
  },

  /**
   * Add visual highlights to detected sensitive data in regular input fields using overlay technique
   */
  highlightInputField: (inputElement, spans) => {
    try {
      if (!inputElement || !spans?.length) {
        console.log('🚫 No input element or spans to highlight');
        DOMHelpers.clearInputHighlights(inputElement);
        return;
      }

      console.log('🎨 Highlighting ALL spans in input field using Grammarly-style overlay:', spans);

      // Clear existing highlights first
      DOMHelpers.clearInputHighlights(inputElement);

      // Validate element is still in DOM
      if (!document.contains(inputElement)) {
        console.warn('⚠️ Input element not in DOM, skipping highlight');
        return;
      }

      // Create invisible overlay container
      let overlay = document.createElement('div');
      overlay.className = 'pg-input-overlay';
      overlay.style.cssText = `
        position: fixed !important;
        pointer-events: none !important;
        z-index: 999999 !important;
        background: transparent !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      `;

      // Add to document body safely
      try {
        document.body.appendChild(overlay);
      } catch (e) {
        console.error('❌ Failed to add input overlay to body:', e);
        return;
      }

      const text = inputElement.value || '';
      const computedStyle = window.getComputedStyle(inputElement);
      const inputRect = inputElement.getBoundingClientRect();
      
      // Position overlay to match input exactly
      overlay.style.left = inputRect.left + 'px';
      overlay.style.top = inputRect.top + 'px';
      overlay.style.width = inputRect.width + 'px';
      overlay.style.height = inputRect.height + 'px';

      console.log('📍 Overlay positioned for all violations');

      // Create text measurer
      const measurer = document.createElement('span');
      measurer.style.cssText = `
        visibility: hidden !important;
        position: absolute !important;
        white-space: pre !important;
        font-family: ${computedStyle.fontFamily} !important;
        font-size: ${computedStyle.fontSize} !important;
        font-weight: ${computedStyle.fontWeight} !important;
        line-height: ${computedStyle.lineHeight} !important;
        letter-spacing: ${computedStyle.letterSpacing} !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
      `;
      
      try {
        document.body.appendChild(measurer);
      } catch (e) {
        console.error('❌ Failed to add input measurer to body:', e);
        // Clean up overlay if measurer fails
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        return;
      }

      try {
        const paddingLeft = parseInt(computedStyle.paddingLeft, 10) || 0;
        const paddingTop = parseInt(computedStyle.paddingTop, 10) || 0;
        const paddingRight = parseInt(computedStyle.paddingRight, 10) || 0;
        const lineHeight = parseInt(computedStyle.lineHeight, 10) || parseInt(computedStyle.fontSize, 10);
        const maxContentWidth = inputRect.width - paddingLeft - paddingRight;

        // Create underlines for ALL violations
        spans.forEach((span, index) => {
          try {
            if (span.start >= 0 && span.end <= text.length) {
              const beforeText = text.substring(0, span.start);
              const spanText = text.substring(span.start, span.end);
              
              measurer.textContent = beforeText;
              const startX = measurer.offsetWidth || 0;
              
              measurer.textContent = beforeText + spanText;
              const endX = measurer.offsetWidth || 0;
              
              // Calculate positioning within bounds
              const underlineLeft = Math.max(0, Math.min(startX, maxContentWidth - 10)) + paddingLeft;
              const availableWidth = Math.max(0, maxContentWidth - (startX - paddingLeft));
              const underlineWidth = Math.max(1, Math.min(endX - startX, availableWidth));
              const underlineTop = paddingTop + lineHeight - 2;
              
              // Create Grammarly-style underline
              const underline = document.createElement('div');
              underline.className = 'pg-input-underline';
              underline.style.cssText = `
                position: absolute !important;
                left: ${underlineLeft}px !important;
                top: ${underlineTop}px !important;
                width: ${underlineWidth}px !important;
                height: 2px !important;
                background-color: ${DOMHelpers.getViolationColor(span.label)} !important;
                border-radius: 1px !important;
                z-index: 1000001 !important;
                pointer-events: auto !important;
                cursor: pointer !important;
                transition: opacity 0.2s ease !important;
              `;
              underline.setAttribute('data-label', span.label);
              underline.setAttribute('data-span-start', span.start.toString());
              underline.setAttribute('data-span-end', span.end.toString());
              
              // Add click handler for tooltip
              underline.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🖱️ Clicked violation underline:', span.label, span.text);
                DOMHelpers.showInlineTooltip(underline, { label: span.label, text: span.text });
              });
              
              // Add hover effects
              underline.addEventListener('mouseenter', () => {
                underline.style.opacity = '0.8';
              });
              
              underline.addEventListener('mouseleave', () => {
                underline.style.opacity = '1';
              });
              
              overlay.appendChild(underline);
              console.log(`✅ Added underline ${index + 1}/${spans.length} for "${spanText}"`);
            }
          } catch (spanError) {
            console.error(`❌ Error processing input span ${index}:`, spanError, span);
          }
        });

      } finally {
        // Always clean up measurer
        try {
          if (measurer.parentNode) {
            document.body.removeChild(measurer);
          }
        } catch (cleanupError) {
          console.error('❌ Error cleaning up input measurer:', cleanupError);
        }
      }
      
      // Store reference for cleanup
      inputElement._pgOverlay = overlay;
      inputElement._pgCleanupOverlay = () => {
        try {
          if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
            console.log('🧹 Cleaned up overlay with all underlines');
          }
        } catch (cleanupError) {
          console.error('❌ Error during input overlay cleanup:', cleanupError);
        }
      };
      
    } catch (error) {
      console.error('❌ Error in highlightInputField:', error);
      // Try to clean up any partial state
      DOMHelpers.clearInputHighlights(inputElement);
    }
  },

  /**
   * Clear input field highlights and overlay
   */
  clearInputHighlights: (inputElement) => {
    console.log('🧹 Clearing input highlights for:', inputElement?.tagName);
    
    // Remove overlay using cleanup function
    if (inputElement && inputElement._pgCleanupOverlay) {
      inputElement._pgCleanupOverlay();
      inputElement._pgCleanupOverlay = null;
    }
    
    // Remove overlay directly if it exists
    if (inputElement && inputElement._pgOverlay) {
      if (inputElement._pgOverlay.parentNode) {
        inputElement._pgOverlay.parentNode.removeChild(inputElement._pgOverlay);
      }
      inputElement._pgOverlay = null;
    }
    
    // Also look for any orphaned overlays with our class
    const orphanedOverlays = document.querySelectorAll('.pg-input-overlay');
    orphanedOverlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        console.log('🗑️ Removed orphaned overlay');
      }
    });
    
    // Clear old background-based highlights if any
    if (inputElement) {
      inputElement.style.backgroundImage = '';
      inputElement.style.backgroundSize = '';
      inputElement.style.backgroundRepeat = '';
      inputElement.style.backgroundPosition = '';
      inputElement.classList.remove('pg-input-highlighted');
    }
    
    console.log('✅ Input highlights cleared');
  },

  /**
   * Highlight the current violation being settled (one-by-one mode)
   */
  highlightCurrentViolation: (inputElement, currentSpan, allSpans = []) => {
    if (!inputElement || !currentSpan) {
      console.log('🚫 No input element or current span to highlight');
      return;
    }

    console.log('🎯 Highlighting current violation:', currentSpan);
    console.log('� All spans:', allSpans.map(s => `${s.label}(${s.start}-${s.end}): "${s.text}"`));
    console.log('�📝 Element type check:', {
      isContentEditable: inputElement.isContentEditable,
      tagName: inputElement.tagName,
      type: inputElement.type,
      currentViolationIndex: inputElement.dataset.currentViolationIndex
    });

    if (inputElement.isContentEditable) {
      console.log('🌟 Using contenteditable highlighting');
      // For contenteditable, clear all and highlight only current
      DOMHelpers.clearHighlights(inputElement);
      DOMHelpers.highlightContentEditable(inputElement, [currentSpan]);
    } else {
      console.log('🎨 Using input field overlay highlighting');
      // Always clear previous highlights first
      DOMHelpers.clearInputHighlights(inputElement);
      // Create new overlay for current violation
      DOMHelpers.highlightCurrentInputViolation(inputElement, currentSpan, allSpans);
    }
  },

  /**
   * Highlight current violation in regular input field with special emphasis
   */
  highlightCurrentInputViolation: (inputElement, currentSpan, allSpans = []) => {
    console.log('🎯 Highlighting current input violation:', currentSpan);
    console.log('🔍 Input element details:', {
      tagName: inputElement.tagName,
      type: inputElement.type,
      value: inputElement.value,
      isContentEditable: inputElement.isContentEditable,
      parentNode: inputElement.parentNode
    });

    // Clear existing highlights
    DOMHelpers.clearInputHighlights(inputElement);

    // Ensure the input element has a parent and is in the DOM
    if (!inputElement.parentNode) {
      console.error('❌ Input element has no parent node');
      return;
    }

    // Create overlay container - invisible, just for positioning
    let overlay = document.createElement('div');
    overlay.className = 'pg-input-overlay';
    overlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      z-index: 999999 !important;
      background: transparent !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    `;

    // Add to document body
    document.body.appendChild(overlay);
    console.log('✅ Invisible overlay added to document body');

    const text = inputElement.value || '';
    const computedStyle = window.getComputedStyle(inputElement);
    const inputRect = inputElement.getBoundingClientRect();
    
    console.log('📏 Input rect:', inputRect);
    
    // Position overlay to match input exactly (invisible container)
    overlay.style.left = inputRect.left + 'px';
    overlay.style.top = inputRect.top + 'px';
    overlay.style.width = inputRect.width + 'px';
    overlay.style.height = inputRect.height + 'px';
    overlay.style.overflow = 'hidden'; // Ensure underlines don't go outside
    
    console.log('📍 Overlay positioned invisibly:', {
      left: overlay.style.left,
      top: overlay.style.top,
      width: overlay.style.width,
      height: overlay.style.height
    });

    // Create real underlines for the violations directly inline with text
    if (text && currentSpan) {
      // Create text measurer to get precise positions
      const measurer = document.createElement('span');
      measurer.style.cssText = `
        visibility: hidden !important;
        position: absolute !important;
        white-space: pre !important;
        font-family: ${computedStyle.fontFamily} !important;
        font-size: ${computedStyle.fontSize} !important;
        font-weight: ${computedStyle.fontWeight} !important;
        line-height: ${computedStyle.lineHeight} !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        letter-spacing: ${computedStyle.letterSpacing} !important;
      `;
      document.body.appendChild(measurer);

      try {
        // Get input field's text positioning details
        const paddingLeft = parseInt(computedStyle.paddingLeft, 10) || 0;
        const paddingTop = parseInt(computedStyle.paddingTop, 10) || 0;
        const paddingRight = parseInt(computedStyle.paddingRight, 10) || 0;
        const lineHeight = parseInt(computedStyle.lineHeight, 10) || parseInt(computedStyle.fontSize, 10);
        const maxWidth = inputRect.width - paddingLeft - paddingRight; // Don't exceed input width
        
        console.log('📐 Layout details:', { paddingLeft, paddingTop, lineHeight, maxWidth });
        
        // Calculate position for current violation
        const beforeText = text.substring(0, currentSpan.start);
        const spanText = text.substring(currentSpan.start, currentSpan.end);
        
        console.log('🎯 Current violation text:', { beforeText, spanText, span: currentSpan });
        
        measurer.textContent = beforeText;
        const startX = measurer.offsetWidth;
        
        measurer.textContent = beforeText + spanText;
        const endX = measurer.offsetWidth;
        
        // Ensure underline doesn't exceed input field bounds
        const maxContentWidth = inputRect.width - paddingLeft - paddingRight;
        const underlineLeft = Math.max(0, Math.min(startX, maxContentWidth - 10)) + paddingLeft;
        const availableWidth = Math.max(0, maxContentWidth - (startX - paddingLeft));
        const underlineWidth = Math.max(1, Math.min(endX - startX, availableWidth));
        const underlineTop = paddingTop + lineHeight - 2;
        
        console.log('📏 Calculated positions:', { 
          startX, endX, 
          underlineLeft, underlineWidth, underlineTop,
          maxContentWidth, availableWidth
        });
        
        // Create inline underline for current violation
        const violationUnderline = document.createElement('div');
        violationUnderline.className = 'pg-current-violation-underline';
        violationUnderline.style.cssText = `
          position: absolute !important;
          left: ${underlineLeft}px !important;
          top: ${underlineTop}px !important;
          width: ${underlineWidth}px !important;
          height: 3px !important;
          background-color: #ff4444 !important;
          border-radius: 1px !important;
          z-index: 1000002 !important;
          animation: pg-pulse 2s infinite !important;
          box-shadow: 0 0 6px rgba(255, 68, 68, 0.6) !important;
          pointer-events: auto !important;
          cursor: pointer !important;
        `;
        violationUnderline.setAttribute('data-label', currentSpan.label);
        violationUnderline.setAttribute('data-span-start', currentSpan.start.toString());
        violationUnderline.setAttribute('data-span-end', currentSpan.end.toString());
        
        // Add click handler
        violationUnderline.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🖱️ Clicked current violation:', currentSpan.label, currentSpan.text);
        });
        
        overlay.appendChild(violationUnderline);
        console.log('✨ Added current violation inline underline:', {
          left: violationUnderline.style.left,
          top: violationUnderline.style.top,
          width: violationUnderline.style.width,
          spanText: spanText
        });

        // Add other violations with reduced emphasis
        allSpans.forEach(span => {
          if (span !== currentSpan && span.start >= 0 && span.end <= text.length) {
            const otherBeforeText = text.substring(0, span.start);
            const otherSpanText = text.substring(span.start, span.end);
            
            measurer.textContent = otherBeforeText;
            const otherStartX = measurer.offsetWidth;
            
            measurer.textContent = otherBeforeText + otherSpanText;
            const otherEndX = measurer.offsetWidth;
            
            const otherUnderline = document.createElement('div');
            otherUnderline.style.cssText = `
              position: absolute !important;
              left: ${otherStartX + paddingLeft}px !important;
              top: ${paddingTop + lineHeight - 2}px !important;
              width: ${otherEndX - otherStartX}px !important;
              height: 2px !important;
              background-color: ${DOMHelpers.getViolationColor(span.label)} !important;
              border-radius: 1px !important;
              z-index: 1000001 !important;
              opacity: 0.4 !important;
              pointer-events: auto !important;
              cursor: pointer !important;
            `;
            otherUnderline.setAttribute('data-label', span.label);
            
            overlay.appendChild(otherUnderline);
          }
        });

      } finally {
        document.body.removeChild(measurer);
      }
    }

    // Store reference for cleanup
    inputElement._pgOverlay = overlay;
    
    // Also store a cleanup function that works
    inputElement._pgCleanupOverlay = () => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        console.log('🧹 Cleaned up overlay');
      }
    };
  },

  /**
   * Create underline element for a span
   */
  createUnderlineElement: (span, text, measurer, computedStyle, isCurrent = false) => {
    const beforeText = text.substring(0, span.start);
    const spanText = text.substring(span.start, span.end);
    
    measurer.textContent = beforeText;
    const startX = measurer.offsetWidth;
    
    measurer.textContent = beforeText + spanText;
    const endX = measurer.offsetWidth;
    
    const underline = document.createElement('div');
    underline.className = isCurrent ? 'pg-input-underline pg-current-violation' : 'pg-input-underline';
    underline.setAttribute('data-label', span.label);
    
    const paddingLeft = parseInt(computedStyle.paddingLeft, 10) || 0;
    const paddingTop = parseInt(computedStyle.paddingTop, 10) || 0;
    const lineHeight = parseInt(computedStyle.lineHeight, 10) || parseInt(computedStyle.fontSize, 10);
    
    underline.style.position = 'absolute';
    underline.style.left = (startX + paddingLeft) + 'px';
    underline.style.top = (paddingTop + lineHeight - 3) + 'px';
    underline.style.width = (endX - startX) + 'px';
    underline.style.height = '3px';
    underline.style.backgroundColor = DOMHelpers.getViolationColor(span.label);
    underline.style.borderRadius = '1px';
    underline.style.pointerEvents = 'auto';
    underline.style.cursor = 'pointer';
    underline.style.zIndex = '1000000';
    
    if (isCurrent) {
      underline.style.backgroundColor = '#ff4444'; // Red for current violation
    }
    
    return underline;
  },

  /**
   * Get color for violation type
   */
  getViolationColor: (label) => {
    const colors = {
      'EMAIL': 'rgba(255, 193, 7, 0.8)',     // Yellow
      'SG_PHONE': 'rgba(255, 87, 51, 0.8)',  // Orange
      'NAME': 'rgba(40, 167, 69, 0.8)',      // Green
      'ADDRESS': 'rgba(23, 162, 184, 0.8)',  // Cyan
      'NRIC': 'rgba(220, 53, 69, 0.8)',      // Red
      'CARD': 'rgba(220, 53, 69, 0.8)',      // Red
      'URL': 'rgba(108, 117, 125, 0.8)',     // Gray
      'IP': 'rgba(111, 66, 193, 0.8)',       // Purple
      'JWT': 'rgba(255, 193, 7, 0.8)',       // Yellow
      'SECRET': 'rgba(220, 53, 69, 0.8)',    // Red
    };
    return colors[label] || 'rgba(220, 53, 69, 0.8)'; // Default red
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
