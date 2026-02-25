/**
 * Visa Sponsorship Detector - Content Script
 * Scans job pages for visa/sponsorship restrictions and displays a warning when found.
 * Supports SPAs and dynamically loaded content via MutationObserver.
 */

// ============================================================================
// CONFIGURATION - Easy to extend keyword list
// ============================================================================

// Phrases that clearly indicate no sponsorship / citizenship restriction.
// Excluded: "must have work authorization" (appears on almost all jobs, incl. those that sponsor)
const RESTRICTION_KEYWORDS = [
  'no sponsorship',
  'does not provide sponsorship',
  'without visa sponsorship',
  'must be a citizen',
  'us citizen only',
  'u.s. citizen only',
  'u.s. citizenship is required',
  'us citizenship is required',
  'only u.s. citizens are eligible',
  'only us citizens are eligible',
  'gc holders only',
  'no visa support',
  'not eligible for sponsorship',
  'authorized to work without sponsorship',
  'we do not sponsor visas',
  'sponsorship is not available',
  'no h1b sponsorship',
  'no h-1b sponsorship',
  'does not sponsor',
  'will not sponsor',
  'cannot sponsor',
  'unable to sponsor',
  'sponsorship not provided',
  'no work authorization support',
  'no visa sponsorship',
  'citizen or permanent resident only',
  'us permanent resident only',
  'green card holders only',
  'no sponsorship available',
  'sponsorship unavailable',
];

// ============================================================================
// STATE
// ============================================================================

const BANNER_ID = 'visa-sponsorship-detector-banner';
const SCAN_DEBOUNCE_MS = 500;
const STORAGE_KEY_ENABLED = 'visaDetectorEnabled';
const STORAGE_KEY_HIGHLIGHT = 'visaDetectorHighlight';

let scanTimeout = null;
let lastScannedText = '';
let isExtensionEnabled = true;
let highlightMatches = false;

// ============================================================================
// DOM SCANNING
// ============================================================================

/**
 * Extracts visible text from the page.
 * Uses innerText (most reliable for rendered content) with TreeWalker fallback.
 */
function getPageText() {
  if (!document.body) return '';

  // innerText returns exactly what the user sees - handles visibility, layout, iframes
  const inner = document.body.innerText;
  if (inner && inner.length > 50) {
    return inner.toLowerCase();
  }

  // Fallback: TreeWalker for pages where innerText is sparse
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tagName = parent.tagName?.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const chunks = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text && text.length > 5) chunks.push(text);
  }
  return chunks.join(' ').toLowerCase();
}

/**
 * Scans text for restriction keywords (phrases only - no individual words
 * to avoid false positives like "visa" or "sponsorship" on jobs that DO sponsor).
 */
function scanForRestrictions(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matches = [];

  for (const keyword of RESTRICTION_KEYWORDS) {
    if (lower.includes(keyword)) matches.push(keyword);
  }

  return [...new Set(matches)]; // Deduplicate
}

/**
 * Performs a full page scan and shows/hides the banner accordingly.
 */
function performScan() {
  if (!isExtensionEnabled) {
    removeBanner();
    return;
  }

  const text = getPageText();

  // Avoid re-scanning identical content (reduces flicker)
  if (text === lastScannedText) return;
  lastScannedText = text;

  const matches = scanForRestrictions(text);

  if (matches.length > 0) {
    showBanner(matches);

    // Optional: highlight matched text on page
    if (highlightMatches) {
      highlightMatchedText(matches);
    }
  } else {
    removeBanner();
  }
}

/**
 * Debounced scan - prevents excessive scanning during rapid DOM updates.
 */
function debouncedScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(performScan, SCAN_DEBOUNCE_MS);
}

// ============================================================================
// BANNER UI
// ============================================================================

function showBanner(matchedPhrases) {
  let banner = document.getElementById(BANNER_ID);

  if (!banner) {
    banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'vsd-banner';

    const content = document.createElement('div');
    content.className = 'vsd-banner-content';

    const icon = document.createElement('span');
    icon.className = 'vsd-banner-icon';
    icon.textContent = '⚠️';
    content.appendChild(icon);

    const mainText = document.createElement('div');
    mainText.className = 'vsd-banner-title';
    mainText.textContent = 'This job does NOT provide visa sponsorship';
    content.appendChild(mainText);

    const list = document.createElement('ul');
    list.className = 'vsd-banner-list';
    content.appendChild(list);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'vsd-banner-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => {
      removeBanner();
    });

    banner.appendChild(content);
    banner.appendChild(closeBtn);
    document.body.appendChild(banner);
  }

  // Update matched phrases list
  const list = banner.querySelector('.vsd-banner-list');
  list.innerHTML = '';
  if (matchedPhrases.length > 0) {
    const phrasesToShow = matchedPhrases.slice(0, 5); // Show up to 5
    phrasesToShow.forEach((phrase) => {
      const li = document.createElement('li');
      li.textContent = `"${phrase}"`;
      list.appendChild(li);
    });
    if (matchedPhrases.length > 5) {
      const li = document.createElement('li');
      li.textContent = `+${matchedPhrases.length - 5} more`;
      li.className = 'vsd-banner-more';
      list.appendChild(li);
    }
  }

  banner.classList.add('vsd-banner-visible');
}

function removeBanner() {
  const banner = document.getElementById(BANNER_ID);
  if (banner) {
    banner.classList.remove('vsd-banner-visible');
  }
  removeHighlights();
}

// ============================================================================
// OPTIONAL: HIGHLIGHT MATCHED TEXT
// ============================================================================

const HIGHLIGHT_CLASS = 'vsd-highlight';

function highlightMatchedText(matches) {
  removeHighlights();

  // Highlight first match only (simpler; avoid DOM complexity from multiple wraps)
  if (matches.length === 0) return;
  const keyword = matches[0];
  const text = document.body.innerText;
  if (!text || !text.toLowerCase().includes(keyword)) return;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword);
  if (idx === -1) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node;

  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (pos + len > idx) {
      const offset = idx - pos;
      const endOffset = Math.min(offset + keyword.length, node.textContent.length);
      try {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, endOffset);
        const span = document.createElement('span');
        span.className = HIGHLIGHT_CLASS;
        span.textContent = keyword;
        range.surroundContents(span);
      } catch (e) {
        // surroundContents can fail for split/cross-element text; skip
      }
      break;
    }
    pos += len;
  }
}

function removeHighlights() {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  });
}

// ============================================================================
// MUTATION OBSERVER - For SPAs / Dynamic Content
// ============================================================================

function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    // Only rescan if we have meaningful DOM changes (text or new nodes)
    const hasRelevantChange = mutations.some((m) => {
      if (m.type === 'childList' && m.addedNodes.length > 0) return true;
      if (m.type === 'characterData') return true;
      return false;
    });
    if (hasRelevantChange) {
      debouncedScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
  });
}

// ============================================================================
// STORAGE & INITIALIZATION
// ============================================================================

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([STORAGE_KEY_ENABLED, STORAGE_KEY_HIGHLIGHT]);
    isExtensionEnabled = result[STORAGE_KEY_ENABLED] !== false; // default true
    highlightMatches = result[STORAGE_KEY_HIGHLIGHT] === true; // default false
  } catch (e) {
    isExtensionEnabled = true;
    highlightMatches = false;
  }
}

function onStorageChange(changes, area) {
  // Listen to both sync and local (popup may use either)
  if (area !== 'sync' && area !== 'local') return;

  if (STORAGE_KEY_ENABLED in changes) {
    isExtensionEnabled = changes[STORAGE_KEY_ENABLED].newValue !== false;
    if (!isExtensionEnabled) {
      removeBanner();
    } else {
      debouncedScan();
    }
  }
  if (STORAGE_KEY_HIGHLIGHT in changes) {
    highlightMatches = changes[STORAGE_KEY_HIGHLIGHT].newValue === true;
    if (highlightMatches) {
      debouncedScan();
    } else {
      removeHighlights();
    }
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

async function init() {
  await loadSettings();

  // Initial scan
  debouncedScan();

  // Delayed rescans for slow-loading SPAs (LinkedIn, Workday, etc.)
  setTimeout(debouncedScan, 2000);
  setTimeout(debouncedScan, 5000);

  // Watch for dynamic content (LinkedIn, Greenhouse, Lever, Workday, etc.)
  setupMutationObserver();

  // Listen for navigation in SPAs (e.g., history API)
  window.addEventListener('popstate', () => {
    lastScannedText = '';
    debouncedScan();
  });

  // Listen for storage changes (popup toggle)
  chrome.storage.onChanged.addListener(onStorageChange);

  // Observe URL changes for SPAs that use History API
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastScannedText = '';
      debouncedScan();
    }
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
