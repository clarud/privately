/**
 * HTML Templates for Privately
 * Global template functions for Chrome extension content script
 */

// Template for backend-enhanced detection
function tooltipTemplate(riskCount, detectedLabels) {
  return `
    <div class="pg-tip-header">
      <div class="pg-tip-logo"></div>
      Privately
    </div>
    <div class="pg-tip-content">
      <strong>${riskCount} sensitive item${riskCount > 1 ? 's' : ''} detected:</strong><br>
      ${detectedLabels.join(', ')}<br><br>
      <small>Your data might be at risk if shared on this site.</small>
    </div>
    <div class="pg-tip-actions">
      <button data-act="replace">Replace</button>
      <button data-act="remove">Remove</button>
      <button data-act="ignore">Ignore</button>
    </div>
  `;
}

// Template for local-only detection
function tooltipTemplateLocal(riskCount, detectedLabels) {
  return `
    <div class="pg-tip-header">
      <div class="pg-tip-logo"></div>
      Privately (Local)
    </div>
    <div class="pg-tip-content">
      <strong>${riskCount} potential issue${riskCount > 1 ? 's' : ''} detected:</strong><br>
      ${detectedLabels.join(', ')}<br><br>
      <small>Local pattern matching detected sensitive data.</small>
    </div>
    <div class="pg-tip-actions">
      <button data-act="replace">Replace</button>
      <button data-act="remove">Remove</button>
      <button data-act="ignore">Ignore</button>
    </div>
  `;
}

// Template for single violation (backend-enhanced)
function tooltipTemplateSingle(span, currentNumber, totalCount) {
  const displayName = SmartCategorizer.getCategoryDisplayName(span.label);
  const description = SmartCategorizer.getCategoryDescription(span.label);
  const icon = SmartCategorizer.getCategoryIcon(span.label);
  
  return `
    <div class="pg-tip-header">
      <div class="pg-tip-logo"></div>
      Privately
    </div>
    <div class="pg-tip-content">
      <div class="pg-violation-progress">
        <strong>Violation ${currentNumber} of ${totalCount}</strong>
      </div>
      <div class="pg-violation-details">
        <span class="pg-category-icon">${icon}</span>
        <div class="pg-violation-info">
          <strong>${displayName}</strong><br>
          <span class="pg-violation-text">"${span.text}"</span><br>
          <small>${description}</small>
        </div>
      </div>
    </div>
    <div class="pg-tip-actions">
      <button data-act="replace">Replace</button>
      <button data-act="remove">Remove</button>
      <button data-act="skip">Skip</button>
      <button data-act="ignore">Ignore All</button>
    </div>
  `;
}

// Template for single violation (local-only)
function tooltipTemplateSingleLocal(span, currentNumber, totalCount) {
  const displayName = SmartCategorizer.getCategoryDisplayName(span.label);
  const description = SmartCategorizer.getCategoryDescription(span.label);
  const icon = SmartCategorizer.getCategoryIcon(span.label);
  
  return `
    <div class="pg-tip-header">
      <div class="pg-tip-logo"></div>
      Privately (Local)
    </div>
    <div class="pg-tip-content">
      <div class="pg-violation-progress">
        <strong>Violation ${currentNumber} of ${totalCount}</strong>
      </div>
      <div class="pg-violation-details">
        <span class="pg-category-icon">${icon}</span>
        <div class="pg-violation-info">
          <strong>${displayName}</strong><br>
          <span class="pg-violation-text">"${span.text}"</span><br>
          <small>${description}</small>
        </div>
      </div>
    </div>
    <div class="pg-tip-actions">
      <button data-act="replace">Replace</button>
      <button data-act="remove">Remove</button>
      <button data-act="skip">Skip</button>
      <button data-act="ignore">Ignore All</button>
    </div>
  `;
}

// Template for error states
function tooltipTemplateError() {
  return `
    <div class="pg-tip-header">
      <div class="pg-tip-logo"></div>
      Privately
    </div>
    <div class="pg-tip-content">
      <strong>Connection Error</strong><br>
      Unable to analyze text with backend service.<br><br>
      <small>Using local detection only.</small>
    </div>
    <div class="pg-tip-actions">
      <button data-act="ignore">Dismiss</button>
    </div>
  `;
}
