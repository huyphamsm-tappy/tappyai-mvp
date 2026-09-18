# TappyAI Growth — Distribution surfaces (Android · Web · iOS · QR)

**Date:** 2026-09-18 · **Status:** technical build, not deployed, not user-tested.
Companion to `G1_GROWTH_ARCHITECTURE.md` (loop + measurement) and `G1_GROWTH_BUILD_REPORT.md` (this phase).

## Classification used everywhere

| Class | Meaning |
|---|---|
| **A — True acquisition** | can expose Tappy to someone who does not know it |
| **B — Assisted acquisition** | distributes Tappy but needs an existing user, a placement, indexing or another trigger |
| **C — Retention / re-entry** | useful after install/use; does not reach unaware users |
| **D — Future / blocked** | needs platform access, hardware, credentials or a partnership |

## Android

| Mechanism | Class | Implemented | Notes |
|---|---|---|---|
| **Share-out of a chat result → public `/r/<slug>`** | B (→ A for the recipient) | **Yes (this phase)** | `SharedResultApi/Repository`, `SharePublicDialog`, `ChatViewModel.onSharePublic`. Preview → confirm → system share sheet with the public URL. Signed-in accounts; anonymous sessions are told to sign in (`account_required`). |
| Receiving `ACTION_SEND text/plain` (Direct Share inbound) | C | Yes (G1) | `IncomingShareParser` → chat prefill. Images not claimed. |
| System sharesheet for review media | C | Pre-existing | `ReviewShareSheet`. |
| Custom-scheme deep links (`tappyai://auth-callback`, `tappyai://group/{id}`) | C | Pre-existing | No domain verification. |
| **App Links for `https://www.tappyai.com/r/*`** | D | **Prepared server-side only** | `GET /.well-known/assetlinks.json` serves the statement once `ANDROID_APP_LINKS_SHA256` is set; the app manifest deliberately does NOT yet claim https links (no native public-result screen exists — a link must keep opening the web page, which is the acquisition surface). |
| Sharing Shortcuts (Tappy in the share sheet's top row) | C | No | Would need `shortcuts.xml` + `ShortcutManagerCompat`; re-entry only; deferred. |
| Widgets / Quick Settings / launcher shortcuts / notifications | C | No (notifications pre-exist) | Re-entry surfaces; not acquisition. |
| Install referrer attribution | D | No | Needs Play Install Referrer + a release build; deferred. |

## Web / browser

| Mechanism | Class | Implemented | Notes |
|---|---|---|---|
| Public result pages `/r/<slug>` + OG card + JSON-LD | A (via a share or an index) | Yes (G1) | ISR, no LLM. |
| **Scam-verdict share-out** (`POST /api/scam-shield/share`) | **A** | **Yes (this phase)** | Anonymous-callable; server-generated payload; `share.scam.*` UI on `/scam-shield`. |
| **Second-generation sharing from the public page** | B (→ A) | **Yes (this phase)** | Anonymous child shares with `parentSlug`; noindex + unlisted until the owner signs up. |
| Web Share API (ShareMenu: Facebook, Zalo, copy, OS sheet; now with `text`) | B | Yes | |
| Web Share Target (`/share-target`) | C | Yes (G1) | Installed PWA only. |
| PWA install prompt | C | No | Retention; deferred. |
| GEO hubs `/food … /spa` (vi+en), sitemap, robots, referrer attribution | A (after indexing) | Yes (G1) | `/scam-shield` now in the sitemap. |
| **WebSite `SearchAction` + Organization JSON-LD on `/`** | A (enabler) | **Yes (this phase)** | Points engines at `/chat?q=`. |
| Canonical URLs, Twitter cards | A (enabler) | Yes | |
| Email / SMS share targets | B | No | The ShareMenu target set is an owner-pinned contract; the OS sheet already covers both. |

## iOS / App Clip (no macOS available — architecture only)

| Mechanism | Class | Status | What exists now |
|---|---|---|---|
| Universal Links for `/r/*` and hubs | D | Prepared server-side | `GET /.well-known/apple-app-site-association` serves `applinks` once `IOS_UNIVERSAL_LINKS_APP_ID` (`TEAMID.bundle`) is set. Requires the Associated Domains entitlement in the iOS project (needs Xcode). |
| App Clip (QR / public result → instant experience) | D | Not built | Needs an App Clip target, `appclips` block in the AASA, App Store Connect experience config. The public JSON `GET /api/shared-results/<slug>` is the data source an App Clip would consume — no new backend needed. |
| Share extension (receive URLs/text into Tappy) | C | Not built | Mirror of Android Direct Share; needs Xcode. |
| iOS share sheet from Tappy (share-out) | B | Not built | Same API as Android (`/api/shared-results/preview`, `/api/shared-results`). |
| Widgets / App Intents / Siri | C | Not built | Re-entry. |

## QR / physical

`/api/qr/entry?path=/food` renders a deterministic SVG QR encoding `https://www.tappyai.com/food?src=qr_pos` (allow-listed entries: `/`, five hubs). **Class B** — becomes acquisition only when printed and placed. No placement is made in this phase. Contexts it is ready for: restaurant table, merchant counter, receipt, poster, packaging, creator bio — all through the same `qr_pos` attribution.

## Owner actions to activate the D-class surfaces (not part of this phase)

1. Android App Links: publish the release cert SHA-256 → `ANDROID_APP_LINKS_SHA256`; then add an `autoVerify` https intent-filter and a native handler (or Custom Tab) for `/r/*` in the app.
2. iOS: `IOS_UNIVERSAL_LINKS_APP_ID`, Associated Domains entitlement, App Clip target (Xcode/macOS required).
3. Zalo Mini App: unchanged from G1 — untouched in this phase by instruction.
