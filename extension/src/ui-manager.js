/**
 * UI Management for Privately Extension
 */

const TooltipManager = {
  currentTooltip: null,
  currentElement: null,

  /**
   * Remove all existing tooltips
   */
  removeAllTooltips: () => {
    document.querySelectorAll('.pg-tip').forEach(tooltip => tooltip.remove());
    TooltipManager.currentTooltip = null;
    TooltipManager.currentElement = null;
  },

  /**
   * Remove existing tooltip for an element
   */
  removeTooltip: (element) => {
    if (!element) {
      console.warn('⚠️ Attempted to remove tooltip for null element');
      return;
    }
    
    try {
      const elementId = UtilityHelpers.generateElementId(element);
      document.querySelectorAll(`.pg-tip[data-for="${elementId}"]`)
        .forEach(tooltip => tooltip.remove());
      
      // Clear references if this was the current tooltip
      if (TooltipManager.currentElement === element) {
        TooltipManager.currentTooltip = null;
        TooltipManager.currentElement = null;
      }
    } catch (error) {
      console.error('❌ Error removing tooltip:', error);
      // Fallback: remove all tooltips
      TooltipManager.removeAllTooltips();
    }
  },

  /**
   * Create and attach tooltip to element - handles violations one by one
   */
  attachTooltip: (element, detectedSpans, isBackendEnhanced = false) => {
    // Remove any existing tooltips first
    TooltipManager.removeAllTooltips();
    
    if (!detectedSpans.length) return;

    // Sort spans by their position (left to right, top to bottom)
    const sortedSpans = [...detectedSpans].sort((a, b) => a.start - b.start);
    
    // Initialize or get current violation index
    if (!element.dataset.currentViolationIndex) {
      element.dataset.currentViolationIndex = "0";
    }
    
    const currentIndex = parseInt(element.dataset.currentViolationIndex);
    const currentSpan = sortedSpans[currentIndex];
    
    if (!currentSpan) {
      // All violations have been processed
      console.log('✅ All violations processed');
      delete element.dataset.currentViolationIndex;
      return;
    }

    const elementRect = element.getBoundingClientRect();
    const tooltip = document.createElement('div');
    
    tooltip.className = 'pg-tip';
    tooltip.dataset.for = UtilityHelpers.generateElementId(element);

    // Create tooltip for the current single violation
    const riskCount = currentIndex + 1; // Current violation number
    const totalCount = sortedSpans.length;
    const label = currentSpan.label;

    // Select appropriate template based on data source
    tooltip.innerHTML = isBackendEnhanced 
      ? tooltipTemplateSingle(currentSpan, riskCount, totalCount)
      : tooltipTemplateSingleLocal(currentSpan, riskCount, totalCount);

    console.log(`🏷️ Created tooltip for violation ${riskCount}/${totalCount}:`, currentSpan);

    // Position tooltip relative to the input field
    TooltipManager.positionTooltip(tooltip, elementRect);
    document.body.appendChild(tooltip);
    
    // Store references
    TooltipManager.currentTooltip = tooltip;
    TooltipManager.currentElement = element;
    TooltipManager.currentSpans = sortedSpans;
    TooltipManager.currentSpanIndex = currentIndex;
    
    console.log('📍 Tooltip positioned and added to DOM');

    // Attach event handlers for single violation
    tooltip.addEventListener('click', (event) => {
      console.log('🖱️ Tooltip clicked:', event.target);
      console.log('🎯 Target action:', event.target?.dataset?.act);
      TooltipManager.handleSingleViolationAction(event, element, currentSpan, sortedSpans, currentIndex);
    });

    // Set up global click handler to close tooltip when clicking outside
    TooltipManager.setupGlobalClickHandler();
  },

  /**
   * Setup global click handler to close tooltips when clicking outside
   */
  setupGlobalClickHandler: () => {
    // Remove any existing handler first
    document.removeEventListener('click', TooltipManager.globalClickHandler, true);
    
    // Add new handler
    document.addEventListener('click', TooltipManager.globalClickHandler, true);
  },

  /**
   * Global click handler to manage tooltip visibility
   */
  globalClickHandler: (event) => {
    if (!TooltipManager.currentTooltip || !TooltipManager.currentElement) {
      return;
    }

    const clickedElement = event.target;
    const tooltip = TooltipManager.currentTooltip;
    const currentElement = TooltipManager.currentElement;

    // Don't close if clicking on the tooltip itself
    if (tooltip.contains(clickedElement)) {
      return;
    }

    // Don't close if clicking on category selector
    if (clickedElement.closest('.pg-category-selector')) {
      return;
    }

    // Don't close if clicking on the current input field
    if (currentElement.contains(clickedElement) || currentElement === clickedElement) {
      return;
    }

    // Don't close if clicking on inline violation underlines
    if (clickedElement.closest('.pg-underline')) {
      return;
    }

    // Close tooltip if clicking anywhere else
    console.log('🖱️ Clicked outside tooltip, closing...');
    TooltipManager.removeAllTooltips();
    CategorySelectionManager.removeAllSelectors();
  },

  /**
   * Position tooltip relative to target element
   */
  positionTooltip: (tooltip, targetRect) => {
    const margin = 12;
    const tooltipWidth = 300;
    const tooltipHeight = 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top, left;
    const position = CONFIG.TOOLTIP_POSITION;
    
    // Calculate positions based on preference
    switch (position) {
      case 'left':
        top = window.scrollY + targetRect.top - 8;
        left = window.scrollX + targetRect.left - tooltipWidth - margin;
        break;
        
      case 'top':
        top = window.scrollY + targetRect.top - tooltipHeight - margin;
        left = window.scrollX + targetRect.left + (targetRect.width - tooltipWidth) / 2;
        break;
        
      case 'bottom':
        top = window.scrollY + targetRect.top + targetRect.height + margin;
        left = window.scrollX + targetRect.left + (targetRect.width - tooltipWidth) / 2;
        break;
        
      case 'right':
        top = window.scrollY + targetRect.top - 8;
        left = window.scrollX + targetRect.left + targetRect.width + margin;
        break;
        
      case 'auto':
      default:
        // Smart positioning that avoids viewport edges
        top = window.scrollY + targetRect.top - 8;
        left = window.scrollX + targetRect.left + targetRect.width + margin;
        
        // Check if tooltip would go off the right edge
        if (left + tooltipWidth > viewportWidth) {
          left = window.scrollX + targetRect.left - tooltipWidth - margin;
        }
        
        // If still off-screen to the left, try top/bottom
        if (left < 0) {
          left = window.scrollX + targetRect.left + (targetRect.width - tooltipWidth) / 2;
          
          // Try positioning above
          if (targetRect.top > tooltipHeight + margin) {
            top = window.scrollY + targetRect.top - tooltipHeight - margin;
          } else {
            // Position below
            top = window.scrollY + targetRect.top + targetRect.height + margin;
          }
        }
        
        // Final viewport edge checks
        if (top + tooltipHeight > window.scrollY + viewportHeight) {
          top = window.scrollY + viewportHeight - tooltipHeight - margin;
        }
        if (top < window.scrollY) {
          top = window.scrollY + margin;
        }
        if (left < 0) {
          left = margin;
        }
        if (left + tooltipWidth > viewportWidth) {
          left = viewportWidth - tooltipWidth - margin;
        }
        break;
    }
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.maxWidth = `${tooltipWidth}px`;
    tooltip.style.zIndex = '2147483647';
    tooltip.style.position = 'absolute';
    
    console.log(`📍 Positioned tooltip at (${left}, ${top}) using ${position} strategy`);
  },

  /**
   * Handle tooltip button clicks
   */
  handleTooltipAction: (event, element, spans) => {
    const action = event.target?.dataset?.act;
    console.log('🎬 Handling tooltip action:', action);
    console.log('🎯 Element:', element);
    console.log('📊 Spans:', spans);
    
    if (!action) {
      console.log('❌ No action found on target');
      return;
    }

    switch (action) {
      case 'replace':
        console.log('🔄 Starting replacement...');
        
        // Check for ambiguous spans that need user input
        const ambiguousSpans = spans.filter(span => span.needsUserInput);
        
        if (ambiguousSpans.length > 0) {
          console.log('🤔 Found ambiguous spans, showing category selector');
          TooltipManager.removeTooltip(element);
          // Show category selector for first ambiguous span
          CategorySelectionManager.showCategorySelector(element, ambiguousSpans[0], spans, 'replace');
        } else {
          // Proceed with normal replacement
          DataReplacementManager.replaceSensitiveData(element, spans);
          TooltipManager.removeTooltip(element);
        }
        break;
      case 'remove':
        console.log('�️ Starting removal...');
        
        // Check for ambiguous spans that need user input
        const ambiguousRemoveSpans = spans.filter(span => span.needsUserInput);
        
        if (ambiguousRemoveSpans.length > 0) {
          console.log('🤔 Found ambiguous spans, showing category selector for removal');
          TooltipManager.removeTooltip(element);
          // Show category selector for first ambiguous span
          CategorySelectionManager.showCategorySelector(element, ambiguousRemoveSpans[0], spans, 'remove');
        } else {
          // Proceed with normal removal
          DataReplacementManager.removeSensitiveData(element, spans);
          TooltipManager.removeTooltip(element);
        }
        break;
      case 'ignore':
        console.log('🚫 Ignoring detection');
        TooltipManager.removeTooltip(element);
        break;
      default:
        console.warn('❓ Unknown tooltip action:', action);
    }
  },

  /**
   * Handle single violation action and move to next violation
   */
  handleSingleViolationAction: (event, element, currentSpan, allSpans, currentIndex) => {
    const action = event.target?.dataset?.act;
    console.log('🎬 Handling single violation action:', action);
    console.log('🎯 Current span:', currentSpan);
    console.log('📊 Index:', currentIndex + 1, 'of', allSpans.length);
    
    if (!action) {
      console.log('❌ No action found on target');
      return;
    }

    // Process the current violation
    switch (action) {
      case 'replace':
        console.log('🔄 Replacing current violation...');
        
        // Check if current span needs user input for category selection
        if (currentSpan.needsUserInput) {
          console.log('🤔 Current span is ambiguous, showing category selector');
          TooltipManager.removeTooltip(element);
          CategorySelectionManager.showCategorySelector(element, currentSpan, [currentSpan], 'replace');
          return; // Category selector will handle moving to next violation
        } else {
          // Replace this single violation
          DataReplacementManager.replaceSensitiveData(element, [currentSpan]);
        }
        break;
        
      case 'remove':
        console.log('🗑️ Removing current violation...');
        
        // Check if current span needs user input for category selection
        if (currentSpan.needsUserInput) {
          console.log('🤔 Current span is ambiguous, showing category selector');
          TooltipManager.removeTooltip(element);
          CategorySelectionManager.showCategorySelector(element, currentSpan, [currentSpan], 'remove');
          return; // Category selector will handle moving to next violation
        } else {
          // Remove this single violation
          DataReplacementManager.removeSensitiveData(element, [currentSpan]);
        }
        break;
        
      case 'ignore':
        console.log('🚫 Ignoring current violation');
        break;
        
      case 'skip':
        console.log('⏭️ Skipping current violation');
        break;
        
      default:
        console.warn('❓ Unknown single violation action:', action);
        return;
    }

    // Move to next violation
    TooltipManager.moveToNextViolation(element, allSpans, currentIndex);
  },

  /**
   * Move to the next violation in the sequence
   */
  moveToNextViolation: (element, allSpans, currentIndex) => {
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= allSpans.length) {
      // All violations processed
      console.log('✅ All violations have been processed');
      delete element.dataset.currentViolationIndex;
      TooltipManager.removeTooltip(element);
      
      // Re-analyze the element to detect any remaining violations
      setTimeout(() => {
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
      }, 100);
    } else {
      // Move to next violation
      element.dataset.currentViolationIndex = nextIndex.toString();
      console.log(`➡️ Moving to violation ${nextIndex + 1}/${allSpans.length}`);
      
      // Remove current tooltip and show next
      TooltipManager.removeTooltip(element);
      
      // Short delay to ensure smooth transition
      setTimeout(() => {
        TooltipManager.attachTooltip(element, allSpans, false);
      }, 100);
    }
  }
};

const DataReplacementManager = {
  /**
   * Replace detected sensitive data with fake alternatives
   */
  replaceSensitiveData: (element, spans) => {
    console.log('Starting replacement for:', spans);
    
    // Store original text before replacement
    const originalText = element.isContentEditable ? element.innerText : element.value;
    
    // Sort spans in reverse order to maintain correct indices during replacement
    const sortedSpans = [...spans].sort((a, b) => b.start - a.start);
    console.log('Sorted spans:', sortedSpans);

    if (element.isContentEditable) {
      DataReplacementManager.replaceInContentEditable(element, sortedSpans);
    } else {
      DataReplacementManager.replaceInInputField(element, sortedSpans);
    }
    
    // Record that this content has been processed
    ReplacementTracker.recordProcessedContent(element, originalText, spans, 'replace');
  },

  /**
   * Remove detected sensitive data completely
   */
  removeSensitiveData: (element, spans) => {
    console.log('Starting removal for:', spans);
    
    // Store original text before removal
    const originalText = element.isContentEditable ? element.innerText : element.value;
    
    // Sort spans in reverse order to maintain correct indices during removal
    const sortedSpans = [...spans].sort((a, b) => b.start - a.start);
    console.log('Sorted spans for removal:', sortedSpans);

    if (element.isContentEditable) {
      DataReplacementManager.removeInContentEditable(element, sortedSpans);
    } else {
      DataReplacementManager.removeInInputField(element, sortedSpans);
    }
    
    // Record that this content has been processed
    ReplacementTracker.recordProcessedContent(element, originalText, spans, 'remove');
  },

  /**
   * Replace data in contenteditable elements
   */
  replaceInContentEditable: (element, spans) => {
    console.log('📝 Replacing in contenteditable element');
    console.log('📝 Original text:', element.innerText);
    console.log('📝 Spans to replace:', spans);
    
    let text = element.innerText;
    
    // Since spans are sorted in reverse order (highest start index first),
    // we can safely replace without worrying about shifting indices
    spans.forEach((span, index) => {
      const replacement = UtilityHelpers.getFakeData(span.label);
      console.log(`📝 Replacement ${index + 1}: "${span.text}" (${span.start}-${span.end}) → "${replacement}"`);
      console.log('📝 Text before replacement:', text);
      
      text = text.slice(0, span.start) + replacement + text.slice(span.end);
      console.log('📝 Text after replacement:', text);
    });
    
    element.innerText = text;
    console.log('📝 Final text set to element:', element.innerText);
    
    // Trigger input event to notify other listeners
    element.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('📝 Input event dispatched');
  },

  /**
   * Replace data in regular input fields
   */
  replaceInInputField: (element, spans) => {
    console.log('📝 Replacing in input field');
    console.log('📝 Original value:', element.value);
    console.log('📝 Spans to replace:', spans);
    
    let value = element.value;
    
    // Since spans are sorted in reverse order (highest start index first),
    // we can safely replace without worrying about shifting indices
    spans.forEach((span, index) => {
      const replacement = UtilityHelpers.getFakeData(span.label);
      console.log(`📝 Replacement ${index + 1}: "${span.text}" (${span.start}-${span.end}) → "${replacement}"`);
      console.log('📝 Value before replacement:', value);
      
      value = value.slice(0, span.start) + replacement + value.slice(span.end);
      console.log('📝 Value after replacement:', value);
    });
    
    element.value = value;
    console.log('📝 Final value set to element:', element.value);
    
    // Trigger input event to notify other listeners
    element.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('📝 Input event dispatched');
  },

  /**
   * Remove data in contenteditable elements
   */
  removeInContentEditable: (element, spans) => {
    console.log('🗑️ Removing in contenteditable element');
    console.log('🗑️ Original text:', element.innerText);
    console.log('🗑️ Spans to remove:', spans);
    
    let text = element.innerText;
    
    // Since spans are sorted in reverse order (highest start index first),
    // we can safely remove without worrying about shifting indices
    spans.forEach((span, index) => {
      console.log(`🗑️ Removal ${index + 1}: "${span.text}" (${span.start}-${span.end})`);
      console.log('🗑️ Text before removal:', text);
      
      // Remove the text completely, preserving spacing if needed
      const beforeText = text.slice(0, span.start);
      const afterText = text.slice(span.end);
      
      // Check if we need to clean up extra spaces
      let cleanedText = beforeText + afterText;
      
      // Remove double spaces that might result from removal
      cleanedText = cleanedText.replace(/\s{2,}/g, ' ');
      
      text = cleanedText;
      console.log('🗑️ Text after removal:', text);
    });
    
    element.innerText = text;
    console.log('🗑️ Final text set to element:', element.innerText);
    
    // Trigger input event to notify other listeners
    element.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('🗑️ Input event dispatched');
  },

  /**
   * Remove data in regular input fields
   */
  removeInInputField: (element, spans) => {
    console.log('🗑️ Removing in input field');
    console.log('🗑️ Original value:', element.value);
    console.log('🗑️ Spans to remove:', spans);
    
    let value = element.value;
    
    // Since spans are sorted in reverse order (highest start index first),
    // we can safely remove without worrying about shifting indices
    spans.forEach((span, index) => {
      console.log(`🗑️ Removal ${index + 1}: "${span.text}" (${span.start}-${span.end})`);
      console.log('🗑️ Value before removal:', value);
      
      // Remove the text completely, preserving spacing if needed
      const beforeText = value.slice(0, span.start);
      const afterText = value.slice(span.end);
      
      // Check if we need to clean up extra spaces
      let cleanedValue = beforeText + afterText;
      
      // Remove double spaces that might result from removal
      cleanedValue = cleanedValue.replace(/\s{2,}/g, ' ');
      
      value = cleanedValue;
      console.log('🗑️ Value after removal:', value);
    });
    
    element.value = value;
    console.log('🗑️ Final value set to element:', element.value);
    
    // Trigger input event to notify other listeners
    element.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('🗑️ Input event dispatched');
  }
};

const CategorySelectionManager = {
  /**
   * Show category selection UI for ambiguous detections
   */
  showCategorySelector: (element, span, allSpans, actionType = 'replace') => {
    console.log('🎯 Showing category selector for:', span);
    console.log('🎯 Action type:', actionType);
    
    if (!span.needsUserInput || !span.suggestions) {
      console.warn('⚠️ Cannot show category selector: no user input needed or no suggestions');
      return;
    }

    // Remove any existing selectors first
    CategorySelectionManager.removeAllSelectors();
    
    const elementRect = element.getBoundingClientRect();
    const selector = document.createElement('div');
    
    selector.className = 'pg-category-selector';
    selector.dataset.for = UtilityHelpers.generateElementId(element);
    selector.innerHTML = CategorySelectionManager.createSelectorHTML(span, actionType);

    // Position selector relative to the element
    CategorySelectionManager.positionSelector(selector, elementRect);
    document.body.appendChild(selector);
    
    // Store context for later use
    selector._pgContext = { element, span, allSpans, actionType };
    
    // Attach event handlers
    selector.addEventListener('click', (event) => {
      CategorySelectionManager.handleCategorySelection(event, element, span, allSpans, actionType);
    });

    console.log('🎯 Category selector created and positioned');
  },

  /**
   * Create HTML for category selector
   */
  createSelectorHTML: (span, actionType) => {
    const suggestions = span.suggestions || [];
    const actionVerb = actionType === 'remove' ? 'remove' : 'replace';
    const actionIcon = actionType === 'remove' ? '🗑️' : '🔄';
    
    return `
      <div class="pg-category-selector-header">
        <h3>${actionIcon} How should we ${actionVerb} "${span.text}"?</h3>
        <p class="pg-reasoning">${span.reasoning}</p>
      </div>
      <div class="pg-category-options">
        ${suggestions.map(suggestion => `
          <button class="pg-category-option" data-category="${suggestion.category}" data-action="select-category">
            <span class="pg-category-icon">${suggestion.icon}</span>
            <div class="pg-category-details">
              <strong>${suggestion.label}</strong>
              <p>${suggestion.description}</p>
            </div>
          </button>
        `).join('')}
      </div>
      <div class="pg-category-actions">
        <button class="pg-btn-secondary" data-action="skip">Skip this one</button>
        <button class="pg-btn-secondary" data-action="cancel">Cancel</button>
      </div>
    `;
  },

  /**
   * Position category selector relative to target element
   */
  positionSelector: (selector, targetRect) => {
    const margin = 16;
    const selectorWidth = 400;
    const viewportWidth = window.innerWidth;
    
    let top = window.scrollY + targetRect.top + targetRect.height + margin;
    let left = window.scrollX + targetRect.left;
    
    // Ensure selector stays within viewport
    if (left + selectorWidth > viewportWidth) {
      left = viewportWidth - selectorWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }
    
    selector.style.top = `${top}px`;
    selector.style.left = `${left}px`;
    selector.style.width = `${selectorWidth}px`;
    selector.style.zIndex = '2147483648'; // Higher than tooltip
    selector.style.position = 'absolute';
    
    console.log(`📍 Positioned category selector at (${left}, ${top})`);
  },

  /**
   * Handle category selection
   */
  handleCategorySelection: (event, element, span, allSpans, actionType) => {
    const action = event.target?.dataset?.action || event.target?.closest('[data-action]')?.dataset?.action;
    
    if (!action) return;
    
    switch (action) {
      case 'select-category':
        const selectedCategory = event.target?.dataset?.category || 
                               event.target?.closest('[data-category]')?.dataset?.category;
        if (selectedCategory) {
          CategorySelectionManager.applySelectedCategory(element, span, allSpans, selectedCategory, actionType);
        }
        break;
      case 'skip':
        console.log('⏭️ User chose to skip category selection');
        CategorySelectionManager.removeAllSelectors();
        break;
      case 'cancel':
        console.log('❌ User cancelled category selection');
        CategorySelectionManager.removeAllSelectors();
        break;
    }
  },

  /**
   * Apply the user's selected category and perform the action
   */
  applySelectedCategory: (element, span, allSpans, selectedCategory, actionType) => {
    console.log(`✅ User selected category: ${selectedCategory} for "${span.text}"`);
    console.log(`🎯 Action type: ${actionType}`);
    
    // Store original text before processing
    const originalText = element.isContentEditable ? element.innerText : element.value;
    
    // Update the span with the selected category
    span.label = selectedCategory;
    span.needsUserInput = false;
    span.confidence = 0.95; // High confidence since user confirmed
    
    // Store user's choice for learning (future enhancement)
    CategorySelectionManager.storeUserChoice(span.text, selectedCategory);
    
    // Remove selector
    CategorySelectionManager.removeAllSelectors();
    
    // Perform the requested action with the categorized span
    if (actionType === 'remove') {
      // Process the span with selected category
      const spanToProcess = { ...span };
      
      if (element.isContentEditable) {
        DataReplacementManager.removeInContentEditable(element, [spanToProcess]);
      } else {
        DataReplacementManager.removeInInputField(element, [spanToProcess]);
      }
      
      CategorySelectionManager.showSuccessNotification(`Removed ${selectedCategory}`);
    } else {
      // Default to replace
      const spanToProcess = { ...span };
      
      if (element.isContentEditable) {
        DataReplacementManager.replaceInContentEditable(element, [spanToProcess]);
      } else {
        DataReplacementManager.replaceInInputField(element, [spanToProcess]);
      }
      
      CategorySelectionManager.showSuccessNotification(`Replaced ${selectedCategory}`);
    }
    
    // Record that this content has been processed
    ReplacementTracker.recordProcessedContent(element, originalText, [span], actionType);
  },

  /**
   * Store user's category choice for future learning
   */
  storeUserChoice: (text, category) => {
    // Store in Chrome storage for future learning
    chrome.storage.local.get({ pg_user_choices: {} }, ({ pg_user_choices }) => {
      const textHash = btoa(text).substring(0, 16); // Simple hash for privacy
      pg_user_choices[textHash] = category;
      chrome.storage.local.set({ pg_user_choices });
      console.log('📚 Stored user choice for future learning');
    });
  },

  /**
   * Show success notification after category selection
   */
  showSuccessNotification: (category) => {
    const notification = document.createElement('div');
    notification.className = 'pg-success-notification';
    notification.innerHTML = `
      <div class="pg-notification-content">
        ✅ Categorized as ${category}
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Position in top-right corner
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '2147483649';
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
  },

  /**
   * Remove all category selectors
   */
  removeAllSelectors: () => {
    document.querySelectorAll('.pg-category-selector').forEach(selector => selector.remove());
  }
};

const StatisticsManager = {
  /**
   * Update detection statistics for analytics
   */
  updateDetectionStats: (detectedLabels) => {
    chrome.storage.local.get({ pg_counts: {} }, ({ pg_counts }) => {
      detectedLabels.forEach(label => {
        pg_counts[label] = (pg_counts[label] || 0) + 1;
      });
      chrome.storage.local.set({ pg_counts });
    });
  }
};
