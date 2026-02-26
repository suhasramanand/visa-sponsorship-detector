/**
 * Visa Sponsorship Detector - Content Script
 * Scans job pages for visa/sponsorship restrictions and displays a warning when found.
 * Supports SPAs and dynamically loaded content via MutationObserver.
 */

// ============================================================================
// CONFIGURATION - Full phrase matching (no keyword + context)
// ============================================================================

// All restriction phrases - must match exactly. Excludes negated forms (e.g. "no sponsorship required").
const RESTRICTION_PATTERNS = [
  // Sponsorship/visa
  /\bno\s+(?:visa\s+)?sponsorship\b/i,
  /\b(?:visa\s+)?sponsorship\s+not\s+(?:available|provided|offered|supported)\b/i,
  /\b(?:we\s+)?(?:do|does|will)\s+not\s+sponsor\b/i,
  /\b(?:cannot|unable\s+to)\s+sponsor\b/i,
  /\b(?:do|does)\s+not\s+provide\s+sponsorship\b/i,
  /\bnot\s+eligible\s+for\s+sponsorship\b/i,
  /\bno\s+(?:h-?1b|h1b|visa)\s+sponsor/i,
  /\b(?:we\s+)?(?:do|does)\s+not\s+sponsor\s+visas\b/i,
  // Citizenship / permanent resident (full phrases only - avoids "no citizenship required")
  /\b(?:us|u\.?s\.?)\s+citizenship\s+required\b/i,
  /\bmust\s+be\s+(?:a\s+)?(?:us|u\.?s\.?)\s+citizen\b/i,
  /\b(?:us|u\.?s\.?)\s+citizen(?:s)?\s+only\b/i,
  /\bonly\s+(?:us|u\.?s\.?)\s+citizens?\s+(?:are\s+)?eligible\b/i,
  /\bgreen\s+card\s+holders?\s+only\b/i,
  /\b(?:citizen\s+or\s+)?permanent\s+resident\s+only\b/i,
  /\b(?:us|u\.?s\.?)\s+permanent\s+resident\s+only\b/i,
  /\bauthorized\s+to\s+work\s+without\s+sponsorship\b/i,
  /\bproof\s+of\s+(?:country\s+of\s+)?citizenship\b/i,
  /\bcitizenship\s+verification\b/i,
  /\bapplicants?\s+must\s+be\s+(?:a\s+)?(?:us|u\.?s\.?)\s+citizen/i,
  /\binternational\s+traffic\s+in\s+arms\s+regulations\b/i,
  /\bexport\s+administration\s+regulations\b/i,
];

// Phrases that mean "they sponsor" - skip match if these appear (avoid false positives)
const EXCLUSION_PATTERNS = [
  /\bno\s+[a-z\s]{0,25}(?:citizenship|citizen)\s+required\b/i,
  /\b(?:citizenship|citizen)\s+not\s+required\b/i,
  /\b(?:no|not)\s+[a-z\s]{0,30}(?:visa\s+)?sponsorship\s+(?:required|needed)\b/i,
  /\b(?:visa\s+)?sponsorship\s+not\s+(?:required|needed)\b/i,
  /\b(?:do|does)\s+not\s+require\s+(?:visa\s+)?sponsorship\b/i,
  /\bwith\s+or\s+without\s+(?:visa\s+)?sponsorship\b/i,
  /\b(?:visa\s+)?sponsorship\s+(?:is\s+)?available\b/i,
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
 * Scans text for restriction phrases. Uses full phrase matching only.
 * Excludes matches when page contains "they sponsor" phrases.
 */
function scanForRestrictions(text) {
  if (!text) return [];
  const matches = [];

  // If exclusions match, the page says they sponsor - don't flag
  if (EXCLUSION_PATTERNS.some((p) => p.test(text))) return [];

  for (const pattern of RESTRICTION_PATTERNS) {
    const m = text.match(pattern);
    if (m) matches.push(m[0].toLowerCase());
  }

  return [...new Set(matches)];
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

    const header = document.createElement('div');
    header.className = 'vsd-banner-header';

    const icon = document.createElement('span');
    icon.className = 'vsd-banner-icon';
    icon.textContent = '⚠';
    header.appendChild(icon);

    const titleGroup = document.createElement('div');
    titleGroup.className = 'vsd-banner-title-group';
    const label = document.createElement('div');
    label.className = 'vsd-banner-label';
    label.textContent = 'Restriction Detected';
    const mainText = document.createElement('div');
    mainText.className = 'vsd-banner-title';
    mainText.textContent = 'This job does not provide visa sponsorship';
    titleGroup.appendChild(label);
    titleGroup.appendChild(mainText);
    header.appendChild(titleGroup);

    content.appendChild(header);

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
      li.textContent = phrase;
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

  if (matches.length === 0) return;
  const keyword = matches[0];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tagName = parent.tagName?.toLowerCase();
      if (['script', 'style', 'noscript'].includes(tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Search each text node for the keyword (avoids innerText/TreeWalker position mismatch)
  let node;
  while ((node = walker.nextNode())) {
    const content = node.textContent;
    const lower = content.toLowerCase();
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;

    const endOffset = Math.min(idx + keyword.length, content.length);
    try {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, endOffset);
      const span = document.createElement('span');
      span.className = HIGHLIGHT_CLASS;
      span.textContent = content.slice(idx, endOffset);
      range.surroundContents(span);
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      // surroundContents fails if range crosses element boundaries
    }
    break; // Highlight first occurrence only
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
