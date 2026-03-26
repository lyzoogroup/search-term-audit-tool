# PPC Search Term Audit Tool

A **100% client-side** PPC search term audit tool that runs entirely in your browser. No backend, no database, no sign-up. Just upload your search term report and get instant, actionable insights.

## Features

- **Platform Auto-Detection** — Automatically detects Amazon SP, Amazon SB, Google Ads, Microsoft Ads
- **14 Analysis Modules** — Campaign summary, match type analysis, n-gram analysis, brand filtering, ACOS/CVR distribution, wasted spend detection, conversion funnel, and more
- **Keyword Classification** — Efficient Winners, Profitable, High Potential, Wasteful, Scaling Opportunities
- **Strategic Action Items** — Prioritized recommendations with implementation roadmap
- **Full Export** — Download any table as CSV, or export the complete classified audit

## Supported File Formats

| Format | Extensions |
|--------|-----------|
| CSV | `.csv` |
| Excel | `.xlsx`, `.xls` |
| TSV | `.tsv` |

## Supported Platforms

| Platform | Auto-detected |
|----------|:---:|
| Amazon Sponsored Products | ✅ |
| Amazon Sponsored Brands | ✅ |
| Google Ads Search Terms | ✅ |
| Microsoft Ads | ✅ |
| Custom CSV | Manual mapping |

## Tech Stack

- **HTML5 + CSS3 + Vanilla JavaScript** — No frameworks, no build step
- **Papa Parse** (CDN) — CSV/TSV parsing
- **SheetJS** (CDN) — Excel file parsing
- **Zero dependencies to install** — Everything loaded from CDN

## Deploy to GitHub Pages

1. **Fork or clone** this repository
2. Go to **Settings → Pages**
3. Under "Source", select **Deploy from a branch**
4. Choose `main` branch, `/ (root)` folder
5. Click **Save**
6. Your tool will be live at `https://yourusername.github.io/ppc-audit-tool/`

That's it. No build step needed.

## Local Development

Just open `index.html` in a browser:

```bash
# Option 1: Direct open
open index.html

# Option 2: Simple server (if you have Python)
python -m http.server 8000

# Option 3: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

## How to Use

1. **Download** your search term report from your ad platform (Amazon, Google, etc.)
2. **Open** the tool in your browser
3. **Upload** the CSV/Excel file (drag & drop or click to browse)
4. **(Optional)** Adjust target ACOS, ROAS, CTR, CVR in Settings
5. **(Optional)** Enter brand names for branded vs. non-branded analysis
6. **Review** the complete audit dashboard
7. **Export** tables as CSV for further action

## Project Structure

```
ppc-audit-tool/
├── index.html          # Main page (upload + dashboard)
├── css/
│   └── style.css       # All styling (dark theme)
├── js/
│   ├── parser.js       # File parsing + column auto-detection
│   ├── engine.js       # Core audit engine (14 analysis modules)
│   ├── ui.js           # Dashboard rendering
│   └── app.js          # Main orchestrator
└── README.md
```

## Privacy

**All processing happens in your browser.** Your data never leaves your device. No server calls, no tracking, no cookies.

## License

MIT
