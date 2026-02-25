/**
 * Visa Sponsorship Detector - Popup Script
 * Handles enable/disable and highlight toggle via Chrome storage.
 */

const STORAGE_KEY_ENABLED = 'visaDetectorEnabled';
const STORAGE_KEY_HIGHLIGHT = 'visaDetectorHighlight';

document.addEventListener('DOMContentLoaded', async () => {
  const enabledCheckbox = document.getElementById('enabled');
  const highlightCheckbox = document.getElementById('highlight');

  // Load saved state
  const result = await chrome.storage.sync.get([STORAGE_KEY_ENABLED, STORAGE_KEY_HIGHLIGHT]);
  enabledCheckbox.checked = result[STORAGE_KEY_ENABLED] !== false;
  highlightCheckbox.checked = result[STORAGE_KEY_HIGHLIGHT] === true;

  // Save on change
  enabledCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ [STORAGE_KEY_ENABLED]: enabledCheckbox.checked });
  });

  highlightCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ [STORAGE_KEY_HIGHLIGHT]: highlightCheckbox.checked });
  });
});
