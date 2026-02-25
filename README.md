# Visa Sponsorship Detector

A Chrome Extension (Manifest V3) that automatically detects visa/sponsorship restrictions on job application pages and shows a warning when sponsorship is NOT provided.

## Features

- **Automatic detection** on any job board or application page
- **Keyword scanning** for phrases like "no sponsorship", "US citizen only", "no visa support", etc.
- **Dynamic content support** via MutationObserver (works with LinkedIn, Greenhouse, Lever, Workday, and other SPAs)
- **Non-intrusive banner** in the top-right corner
- **Dismissible** popup with optional list of matched phrases
- **Enable/disable** via toolbar icon popup
- **Optional highlight** of matched text on the page

## How to Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `visa-sponsorship-detector` folder
5. The extension icon will appear in the toolbar

## Usage

- The extension runs automatically on all pages
- When restriction keywords are found, a yellow warning banner appears in the top-right
- Click the **×** to dismiss the banner
- Click the extension icon to enable/disable detection or toggle text highlighting

## File Structure

```
visa-sponsorship-detector/
├── manifest.json   # Extension config (Manifest V3)
├── content.js      # DOM scanning, MutationObserver, banner logic
├── styles.css      # Banner and highlight styles
├── popup.html      # Toolbar popup UI
├── popup.js        # Popup logic (enable/disable, highlight toggle)
└── README.md
```

## Extending the Keyword List

Edit the `RESTRICTION_KEYWORDS` array in `content.js`. Add new phrases (lowercase) to detect additional restriction patterns.
