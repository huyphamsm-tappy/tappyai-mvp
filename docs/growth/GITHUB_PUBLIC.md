# GitHub — public discovery surface (prepared; nothing published)

**Rule:** no proprietary application source is published for traffic. The only code that is safe and *useful* to publish is the browser extension: `extensions/browser/` is self-contained plain JavaScript (no build, no secrets, no API — it opens `https://www.tappyai.com/...` URLs). Store reviewers, privacy-minded users and search engines can read it; nothing in it exposes the web app, Supabase, keys, prompts or algorithms (verified: `grep -ri "supabase\|api_key\|secret\|sk-\|token" extensions/browser` → none; the test `browserExtension.test.ts` forbids `fetch(`/network code).

Repository audit: this repository is **private** (`git@github.com:huyphamsm-tappy/tappyai-mvp.git`); no public repo, org profile or GitHub Pages exists. Creating one needs the owner's GitHub session — **owner action**. Everything below is ready to paste.

## A. Public repository: `tappyai-extension`

**Create:** GitHub → New repository → owner: the TappyAI org (create `github.com/tappyai` if free; else the founder account) → name `tappyai-extension` → Public → no template.
**Contents:** copy `extensions/browser/` (excluding `dist/`) + the README below + `LICENSE` (owner decision — MIT recommended for a store-listed extension; not added here because a licence is a legal choice). Keep this repo in sync from the main repo's `extensions/browser/` on every extension release (manual copy; `npm run extension:package` builds the identical zip from either location).
**Topics:** `browser-extension`, `chrome-extension`, `edge-extension`, `firefox-addon`, `manifest-v3`, `vietnam`, `ai-assistant`, `scam-detection`.
**About:** "Ask TappyAI about any page · check links with Scam Shield — privacy-first browser extension (activeTab · contextMenus · storage only)" · website `https://www.tappyai.com/extension`.

**README.md (paste verbatim):**

```markdown
# TappyAI browser extension

Ask [TappyAI](https://www.tappyai.com) about any page, and check suspicious links with Scam Shield — right from your browser.

- Select text → right-click → **Ask Tappy about “…”**
- Right-click a page → **Ask Tappy about this page**
- Right-click a link → **Check this link with Scam Shield** (prefilled; you press Check)
- Toolbar popup: quick ask · ask about the open page · check the page · open TappyAI

TappyAI is a Vietnamese-first AI assistant for food, shopping, travel, entertainment and beauty, plus Scam Shield for fraud checks — [what it is and how it answers](https://www.tappyai.com/about).

## Privacy — by construction

Manifest V3. Permissions: `activeTab`, `contextMenus`, `storage`. **No host permissions, no content scripts, no history access, no network calls of its own.** The extension only receives what you explicitly act on (the selection, the link, the open tab while the popup is open), builds a `https://www.tappyai.com/...` URL with parameters and credentials stripped, and opens it in a tab — the same as typing the address. It stores one preference (question language). Nothing is tracked.

Full policy: https://www.tappyai.com/extension/privacy

## Install

- Chrome Web Store / Edge Add-ons / Firefox Add-ons: links at https://www.tappyai.com/extension once each listing is live.
- Unpacked (developers): `chrome://extensions` → Developer mode → Load unpacked → this folder.

## Files

`manifest.json` · `background.js` (service worker: context menus) · `popup.html/js/css` · `src/links.js` (URL builders) · `src/menu.js` · `src/settings.js` · `_locales/{vi,en}` · `icons/`

## Reporting

Bugs and privacy questions: support@tappyai.com
```

## B. Organization profile (optional, free)

If `github.com/tappyai` is created: a `.github` repo with `profile/README.md` — two lines: what TappyAI is (the `/about` one-liner) and links to `https://www.tappyai.com`, `/about`, `/extension`. Then add `https://github.com/tappyai` to `ORGANIZATION_SAME_AS`.

## C. What is NOT published

The web app, Android app, iOS app, Supabase schema/migrations, prompts, provenance guards, growth analytics, any `.env*`, `docs/audit/*`, keys or fingerprints. GitHub Pages is not used (the public site is `www.tappyai.com`; a second host would split canonicals).
