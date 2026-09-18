# TappyAI Browser Extension (Manifest V3)

**Location:** `extensions/browser/` · **Status:** built, tested, NOT published · **Classification:** ASSISTED (post-install utility), not pure acquisition
**Store listing / promotion:** none. This document makes no claim about Chrome Web Store approval, installs or reach.

## What it is

A minimal Chrome / Chromium / Edge extension that turns three things the person is already looking at into a TappyAI question, in one click:

| Surface | Trigger | Opens |
|---|---|---|
| Context menu on **selected text** | right-click → *Hỏi Tappy về “…”* | `https://www.tappyai.com/chat?q=<selection>&src=browser_extension` |
| Context menu on the **page** | right-click → *Hỏi Tappy về trang này* | `/chat?q=Cho mình biết về: <title>\n<url>&src=browser_extension` |
| Context menu on a **link** / the page | right-click → *Kiểm tra … với Scam Shield* | `https://www.tappyai.com/scam-shield?url=<link>&src=browser_extension` (prefill only; the person presses Check) |
| Toolbar **popup** | click the icon | free-text ask · ask about this page · check this page · open TappyAI |

Everything lands on surfaces that already exist (`/chat?q=`, `/scam-shield`). The extension has no backend, makes no network request of its own, and creates nothing on the server: the web app does what it does for any visitor.

## Why it is ASSISTED, not acquisition

Only someone who already knows TappyAI installs an extension. What it does is shorten the loop for that person (fewer steps from "I'm reading this" to "Tappy, what about this?") and — through the ordinary share-out flow on the resulting answer — feed the share loop. It is instrumented as its own source (`browser_extension`) so its real contribution to first queries, shares and signups will be visible in `computeGrowthMetrics().acquisition.firstQueriesBySource`, not assumed.

## Permission model (the whole allow-list)

```json
"permissions": ["activeTab", "contextMenus", "storage"],
"host_permissions": []
```

| Permission | Why | What it does NOT grant |
|---|---|---|
| `activeTab` | The popup needs the current tab's URL/title, **only while the person has the popup open** (Chrome grants it on the click that opens the popup). | No access to any other tab, no access when the popup is closed, no history. |
| `contextMenus` | Registers the four right-click entries. Chrome hands the click handler the selection / link / page URL for that one click. | Nothing before or after the click. |
| `storage` | One key, `tappy_settings`: the question language (`vi`/`en`). `chrome.storage.sync`. | Never a URL, never a selection, never an identifier. |

No `tabs`, no `history`, no `webNavigation`, no `webRequest`, no `scripting`, no content scripts, no `<all_urls>`. The extension **cannot** observe browsing. `src/lib/growth/browserExtension.test.ts` fails if any of that ever appears in the manifest or the code (`chrome.history`, `tabs.onUpdated`, `fetch(`, `localStorage`, … are all forbidden tokens).

## Privacy rules enforced in code (`extensions/browser/src/links.js`)

- Only `http:`/`https:` page URLs are forwarded. `chrome://`, `edge://`, `file://`, `about:`, extension pages, `javascript:`, `data:`, `localhost` → nothing is opened.
- A forwarded URL is stripped of credentials, query string and fragment. It identifies a page, never a session.
- Selected text is capped at 1 000 characters and control characters are removed.
- Nothing is stored. A URL is built, opened in a new tab, and forgotten.
- A Scam Shield deep link **prefills** the input; the check runs only when the person presses Check (`src/lib/scam-shield/deepLink.ts`). A crafted link cannot spend a visitor's quota.

## Acquisition chain (added by the free-acquisition phase)

`/extension` (indexable landing, SoftwareApplication JSON-LD, env-gated store buttons) → store listing (owner publishes; `store/LISTING.md` has every field) → install → `/extension/welcome?src=browser_extension` opened once by `onInstalled(reason: "install")` → first query. `computeGrowthMetrics().extension` reports new-install landings, first queries attributed `browser_extension`, and install→first-query — with no telemetry in the extension. `/extension/privacy` is the store-required policy. Store buttons appear only once `NEXT_PUBLIC_EXTENSION_URL_CHROME` / `_EDGE` / `_FIREFOX` hold real store URLs. See `FREE_ACQUISITION_RESEARCH.md` §3.

## Files

```
extensions/browser/
  manifest.json          MV3, default_locale vi
  background.js          service worker: context menus → one tab
  popup.html/.js/.css    toolbar popup
  src/links.js           PURE URL builders — the contract with the web app (tested)
  src/menu.js            PURE click → destination decision (tested)
  src/settings.js        the one stored key (tested)
  _locales/vi, _locales/en
  icons/                 16/32/48/128 px, resized from public/branding/otter-logo.png
  store/LISTING.md       store submission kit (copy, justifications, disclosure, packaging)
```

## Installing an unpacked build (development / UAT)

1. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**.
2. **Load unpacked** → choose the `extensions/browser/` folder.
3. Right-click any selection on any http(s) page → *Hỏi Tappy về “…”*.

To point it at a local or staging build during UAT, set `tappy_settings.origin` to an `https://` origin in `chrome.storage.sync` from the extension's service-worker console (the popup never sets it; `normalizeSettings` refuses anything that is not `https://`).

## What is deliberately NOT built

- No store submission, listing, screenshots, or promotion — an owner decision, and store review is not something this repo can claim.
- No Firefox *listing* yet; the manifest now carries `browser_specific_settings.gecko` so the same zip can be submitted to AMO (free).
- No "generate a public result" from inside the extension: creating a public result requires a signed-in account (share policy) and happens on the web page where the person can see the preview — the extension takes them there.
- No page-content extraction (would need `scripting`/content scripts). The extension sends what Chrome hands it — selection, link, page URL/title — and nothing else.

## Tests

`src/lib/growth/browserExtension.test.ts` (16 tests): manifest/permission guard · forbidden-API scan · locale table parity · deep-link contract vs the web analytics contract (`browser_extension`, `src`) · URL handling (schemes, credentials, query/fragment, length, control chars) · context-menu decisions · settings coercion.
`src/lib/scam-shield/deepLink.test.ts` (3 tests): the web side of the `?url=` prefill.
