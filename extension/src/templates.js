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
      <button data-act="ignore">Ignore</button>
      <button data-act="allow">Trust Site</button>
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
      <button data-act="ignore">Ignore</button>
      <button data-act="allow">Trust Site</button>
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
