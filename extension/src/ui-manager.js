/**
 * UI Management for Privately Extension
 */

const TooltipManager = {
  /**
   * Remove existing tooltip for an element
   */
  removeTooltip: (element) => {
    const elementId = UtilityHelpers.generateElementId(element);
    document.querySelectorAll(`.pg-tip[data-for="${elementId}"]`)
      .forEach(tooltip => tooltip.remove());
  },

  /**
   * Create and attach tooltip to element
   */
  attachTooltip: (element, detectedSpans, isBackendEnhanced = false) => {
    TooltipManager.removeTooltip(element);
    if (!detectedSpans.length) return;

    const elementRect = element.getBoundingClientRect();
    const tooltip = document.createElement('div');
    
    tooltip.className = 'pg-tip';
    tooltip.dataset.for = UtilityHelpers.generateElementId(element);

    const uniqueLabels = [...new Set(detectedSpans.map(span => span.label))];
    const riskCount = detectedSpans.length;

    // Select appropriate template based on data source
    tooltip.innerHTML = isBackendEnhanced 
      ? tooltipTemplate(riskCount, uniqueLabels)
      : tooltipTemplateLocal(riskCount, uniqueLabels);

    console.log('🏷️ Created tooltip HTML:', tooltip.innerHTML);

    // Position tooltip relative to the input field
    TooltipManager.positionTooltip(tooltip, elementRect);
    document.body.appendChild(tooltip);
    
    console.log('📍 Tooltip positioned and added to DOM');

    // Attach event handlers
    tooltip.addEventListener('click', (event) => {
      console.log('🖱️ Tooltip clicked:', event.target);
      console.log('🎯 Target action:', event.target?.dataset?.act);
      console.log('📊 Detected spans:', detectedSpans);
      TooltipManager.handleTooltipAction(event, element, detectedSpans);
    });

    // Update usage statistics
    StatisticsManager.updateDetectionStats(uniqueLabels);
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
        DataReplacementManager.replaceSensitiveData(element, spans);
        TooltipManager.removeTooltip(element);
        break;
      case 'ignore':
        console.log('🚫 Ignoring detection');
        TooltipManager.removeTooltip(element);
        break;
      case 'allow':
        console.log('✅ Adding site to allowlist');
        AllowlistManager.addCurrentSiteToAllowlist();
        TooltipManager.removeTooltip(element);
        break;
      default:
        console.warn('❓ Unknown tooltip action:', action);
    }
  }
};

const DataReplacementManager = {
  /**
   * Replace detected sensitive data with fake alternatives
   */
  replaceSensitiveData: (element, spans) => {
    console.log('Starting replacement for:', spans);
    
    // Sort spans in reverse order to maintain correct indices during replacement
    const sortedSpans = [...spans].sort((a, b) => b.start - a.start);
    console.log('Sorted spans:', sortedSpans);

    if (element.isContentEditable) {
      DataReplacementManager.replaceInContentEditable(element, sortedSpans);
    } else {
      DataReplacementManager.replaceInInputField(element, sortedSpans);
    }
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
  }
};

const AllowlistManager = {
  /**
   * Add current site to user's allowlist
   */
  addCurrentSiteToAllowlist: () => {
    const prefs = getUserPreferences();
    prefs.allowlist[location.host] = true;
    updateUserPreferences(prefs);
    console.log(`Added ${location.host} to allowlist`);
  },

  /**
   * Check if current site is in allowlist
   */
  isCurrentSiteAllowed: () => {
    const prefs = getUserPreferences();
    return prefs.allowlist[location.host] === true;
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
