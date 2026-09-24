# TappyAI — G1 Growth Completion: Remaining Free Technical Acquisition Features

**Date:** 2026-09-18 · **Worktree:** `.worktrees/g1-completion` · **Branch:** `feat/g1-completion` from the verified RC `rc/web-uat @ b0896e7` (RC worktree untouched)
**End state:** CODE BUILT · TESTS VERIFIED · WORKTREE CLEAN · NO PUSH · NO DEPLOY · NO PRODUCTION MIGRATION · NO REAL USERS · Zalo boundary untouched · no TGDĐ · no ads · no paid API.

Companions: `G1_GROWTH_ARCHITECTURE.md`, `G1_GROWTH_IMPACT_REPORT.md`, `G1_GROWTH_BUILD_REPORT.md`, `DISTRIBUTION.md`, **`BROWSER_EXTENSION.md`**, **`SEARCH_DISCOVERY.md`** (both new).

---

## A. Executive summary

G1 already had the loop (share-out → `/r/<slug>` → follow-up → signup, with the measurement spine) and the discovery surfaces (five hubs, sitemap/robots, OG, QR, Share Target, Android share-out). This phase closed the **free technical surfaces that were still missing or half-done**, without rebuilding anything:

1. **Browser extension (MV3)** — built, tested, documented, *not published*. Selection / link / page → `/chat?q=` or `/scam-shield?url=` with `src=browser_extension`. Permissions: `activeTab`, `contextMenus`, `storage` — nothing else, enforced by a test.
2. **Google Search technical audit** — 16 findings; 7 fixed in code (home canonical, Scam Shield metadata, one Organization entity, BreadcrumbList, `/startup` in sitemap, two private paths disallowed, `/about`), hreflang documented as *not applicable* rather than faked, one **PARTIAL** (Home carries no HTML link to hubs/About — owner-locked surface).
3. **AI-search readiness** — per-engine, no appearance claims: shared Organization `@id`, `/about` entity page, `/llms.txt`, Bing split out as its own source; explicitly **no `google_ai` source** because it is not measurable.
4. **Additional free surfaces** — Android Process-Text ("select text in any app → TappyAI"), PWA home-screen shortcuts, Scam Shield deep-link prefill. iOS remains doc-only (no macOS).
5. **Share-loop completion** — verified end-to-end (re-share, ancestry, caps); added **multi-generation attribution** (`byGeneration`, `maxGeneration`) and **first queries by source** to `computeGrowthMetrics`. No rewards, points or gamification.

**Cost:** new recurring cost = **$0**. No LLM on any new or public path, no new storage, no new infrastructure, no paid API, `package.json` unchanged.
**Tests:** web **13,609 pass / 0 fail / 68 skipped** (RC baseline 13,568 / 0 / 68 → +41), Android **742 / 0** (baseline 739 → +3), tsc 0, lint 0 errors (42 warnings = baseline), architecture 14/14, sql-grants 0 errors.

---

## B. Channel inventory

Classes: **TRUE** = reaches someone unaware of Tappy · **ASSISTED** = distributes Tappy but needs an existing user / placement / indexing · **RETENTION** = post-install utility · **FUTURE** = needs platform access, credentials, hardware or an owner decision.

| # | Channel / surface | Class | Priority | Status | Tracked as | Where |
|---|---|---|---|---|---|---|
| 1 | Share-out → `/r/<slug>` (web + Android) | ASSISTED → TRUE for the recipient | P0 | DONE (G1) | `share_out`, `zalo_link` | `lib/share/*`, `/r/[slug]` |
| 2 | Scam-verdict share-out | TRUE | P0 | DONE (build phase) | `wedge_scam` + share | `/api/scam-shield/share` |
| 3 | Second-/N-th-generation sharing | ASSISTED | P0 | DONE + **generation metrics (this phase)** | `parent_share_id` chain | `sharePolicy.ts`, `growthMetrics.ts` |
| 4 | Google Search (hubs, results, Scam Shield, About) | TRUE after indexing | P0 | **DONE (audit + fixes); PARTIAL (Home links)** | `geo_google` | `SEARCH_DISCOVERY.md` |
| 5 | Bing / Copilot | TRUE after indexing | P1 | **DONE — `bing_search` split (this phase)** | `bing_search`, `geo_chatgpt` | `attribution.ts` |
| 6 | Google AI Overviews / AI Mode | TRUE after indexing | P1 | DONE (readiness); **appearance unclaimable, not separately trackable** | `geo_google` (same referrer) | `SEARCH_DISCOVERY.md` §3 |
| 7 | ChatGPT Search / Perplexity / Claude / Gemini | TRUE after crawl | P1 | DONE (readiness: robots allow, `/about`, `/llms.txt`) | `geo_chatgpt` | `llmsTxt.ts` |
| 8 | **Browser extension** | ASSISTED | P1 | **DONE — built, not published** | `browser_extension` | `extensions/browser/` |
| 9 | Scam Shield deep link `?url=` (prefill only) | ASSISTED (enabler) | P1 | **DONE (this phase)** | inherits `?src=` | `lib/scam-shield/deepLink.ts` |
| 10 | QR / POS entry | ASSISTED (needs placement) | P1 | DONE (G1); no placement | `qr_pos` | `/api/qr/entry` |
| 11 | Web Share Target (installed PWA) | RETENTION | P2 | DONE (G1) | `web_share_target` | `/share-target` |
| 12 | **PWA home-screen shortcuts** | RETENTION | P2 | **DONE (this phase)** | `pwa_shortcut` | `public/manifest.json` |
| 13 | Android Direct Share inbound | RETENTION | P2 | DONE (G1) | — (native emits no G1 events) | `IncomingShareParser` |
| 14 | **Android Process Text (selection toolbar)** | RETENTION | P2 | **DONE (this phase)** | — (native emits no G1 events) | `AndroidManifest.xml`, `IncomingShareParser` |
| 15 | Android App Links `/r/*` | FUTURE | P2 | server prepared (env-gated); app does not claim https | — | `.well-known/assetlinks.json` |
| 16 | iOS Universal Links / App Clip / Share Extension | FUTURE | P3 | doc-only (no macOS) | — | `DISTRIBUTION.md` |
| 17 | Zalo Mini App | FUTURE / BLOCKED (owner) | — | boundary only, untouched | `zalo_mini` | `ZALO_MINI_APP.md` |
| 18 | TGDĐ / partnerships | BLOCKED (out of scope) | — | not built; `tgdd` reserved | `tgdd` | — |
| 19 | Ads / paid acquisition | BLOCKED (forbidden) | — | not built | — | — |

---

## C. Browser extension

See `BROWSER_EXTENSION.md` for the full description. Summary of what was built and verified:

- `extensions/browser/` — `manifest.json` (MV3, `default_locale: vi`, module service worker, popup), `background.js`, `popup.html/js/css`, `src/links.js` (pure URL builders), `src/menu.js` (pure click→destination), `src/settings.js` (one stored key: language), `_locales/{vi,en}`, `icons/` (16/32/48/128 resized from the existing brand logo with the `sharp` already in `node_modules`).
- **Permissions:** `["activeTab","contextMenus","storage"]`, `host_permissions: []`, no content scripts. The test fails on `tabs`, `history`, `webNavigation`, `webRequest`, `scripting`, `<all_urls>` or any `chrome.history`/`fetch(`/`localStorage` in the code. **The extension cannot monitor browsing.**
- **URL handling:** http(s) only; `chrome://`, `file://`, `about:`, `javascript:`, `data:`, extension pages and localhost are refused; credentials, query and fragment stripped; selection capped at 1 000 chars, control chars removed.
- **Deep links:** `/chat?q=…&src=browser_extension`, `/scam-shield?url=…&src=browser_extension` (prefill, never auto-check), `/?src=browser_extension`. The web side accepts `browser_extension` in `ANALYTICS_SOURCES`, and `ScamShieldView` prefills from `?url=` (new `readScamShieldPrefill`).
- **Public-result generation:** not from the extension. Creating a public result stays a signed-in, previewed action on the web page; the extension takes the person there. Honest classification: **ASSISTED** (installed by people who already know Tappy; it shortens their loop and feeds the share loop).
- **Not done, deliberately:** store submission / listing / any claim of installs; Firefox packaging; page-content extraction.
- **Tests:** 15 (`browserExtension.test.ts`) + 3 (`deepLink.test.ts`) + the Scam Shield import-boundary guard extended for `deepLink`.

---

## D. Google Search discovery

Full audit in `SEARCH_DISCOVERY.md` (§1 surface table, §2 findings S1–S16). Code changes:

| Change | File |
|---|---|
| Home page canonical `/` + explicit index (on the page, not the layout) | `src/app/(home)/page.tsx` |
| Scam Shield: title (bilingual via `ROUTE_TITLES`), description (dictionary), canonical, OG, BreadcrumbList | `src/app/scam-shield/page.tsx`, `lib/share/openGraph.ts`, `lib/i18n/discovery.ts` |
| One Organization node (`@id …/#organization`) on `/`, `/about`, `/startup`; WebSite `publisher` → it | `lib/discovery/siteJsonLd.ts`, `app/startup/page.tsx` |
| BreadcrumbList on hubs (Home › hub) and listed results (Home › hub › result); none for noindex shares | `(discovery)/[domain]/page.tsx`, `r/[slug]/page.tsx` |
| `/about` entity page (vi+en, SSR, client-reconciled), linked from every hub header | `app/about/*`, `HubBody.tsx` |
| Sitemap: `+ /about`, `+ /startup` (was an orphan); priorities | `app/sitemap.ts` |
| Robots: `+ /age-check`, `+ /controller` | `app/robots.ts` |
| hreflang: **not applicable** — no per-language URLs; documented instead of faked (`inLanguage`, bilingual FAQPage, `og:locale:alternate` are what exists) | `SEARCH_DISCOVERY.md` S8 |
| Intent structures: **five hub templates + Scam Shield + About**. No location pages, no mass pages, nothing generated. | — |
| Search → Tappy without forced signup: verified on every indexable page (hub examples → `/chat?q=` anonymous; `/r/*` follow-up; `/scam-shield` anonymous; About → `/chat`). | — |
| Public views LLM-free: `publicResultNoLlm.test.ts` guard still green; `/about`, hubs, `/llms.txt` import only dictionary/constants. | — |

**PARTIAL:** the Home page has no HTML link to the hubs or `/about` (reachable from `/` only via `sitemap.xml`). Home is the owner-locked V3 surface with a pinned shell nav — a crawlable footer row is recorded as an **owner UI decision**, not added.

---

## E. AI Search discovery — per engine

| Engine | Readiness provided | Attribution | What is NOT claimed |
|---|---|---|---|
| Google AI Overviews / AI Mode | Same index as Search: entity `@id`, FAQPage/QAPage, SearchAction, robots allow `*`. | `geo_google` — an Overview click is indistinguishable from a blue link; **no `google_ai` source** | appearance, ranking |
| ChatGPT Search | robots allow (`OAI-SearchBot`), `/about`, `/llms.txt`, Bing index (below) | `geo_chatgpt` (`chatgpt.com`) | appearance; no "GEO API" |
| Bing / Copilot | same crawlable surface; **`bing_search` now separate** | `bing_search` (bing.com), `geo_chatgpt` (copilot.microsoft.com) | Webmaster Tools / IndexNow (owner credentials) |
| Perplexity / Claude / Gemini | allowed; `/llms.txt` | `geo_chatgpt` | appearance |

`/llms.txt` (`src/app/llms.txt/route.ts` ← `lib/discovery/llmsTxt.ts`) is a static, deterministic index built from the same dictionary as the pages; its test asserts it lists only allowed public pages and no query strings. It is a convention, not a contract with any engine.

---

## F. Share loop — status per step

```
[1] Result in chat (web / Android)            DONE   (G1)
      │  Share → preview (sanitized) → confirm
      ▼
[2] Public result /r/<slug> + OG + QAPage      DONE   (G1)  · ISR · no LLM · BreadcrumbList (this phase, listed only)
      │  viewer: share_viewed (per share/session, distinct viewer in metrics)
      ▼
[3] Viewer acts                                DONE   outbound_* / follow_up (capped 3/day/identity)
      │
      ├─▶ [4a] Re-share (child)                DONE   anonymous: child-of-public only, 3/day, noindex+unlisted until owner signs up
      │          └─▶ [4b] grand-child…         DONE   parent must be public; chain walked → byGeneration / maxGeneration (this phase)
      │
      ├─▶ [5] Signup                           DONE   first_source / first_share_id; anon→user stitched
      │
      └─▶ [6] New entry surfaces into [1]      DONE   extension (this phase) · PWA shortcuts (this phase) · Process Text (this phase) · Share Target · Direct Share · QR · hubs · About
Attribution across generations                 DONE   share_created.parent_share_id → generation depth; acquisition.firstQueriesBySource
Rewards / points / gamification                NOT BUILT — by rule
```

---

## G. Cost report

| Item | New recurring cost | Evidence |
|---|---|---|
| Browser extension | **$0** — no backend, no network from the extension; opens existing pages | `background.js`, `popup.js`; forbidden-API test |
| `/about`, `/llms.txt`, breadcrumbs, metadata, Organization | **$0** — static/ISR bytes from constants; no fetch, no model | `seoSurfaces.test.tsx`, `llmsTxt.test.ts` |
| Scam Shield prefill | **$0** — prefill only; a check still costs exactly what a manual check costs and only when pressed | `deepLink.ts` |
| PWA shortcuts, Android Process Text | **$0** — land on existing chat with existing quota | manifest, `IncomingShareParser` |
| Metrics additions | **$0** — pure computation over events already ingested | `growthMetrics.ts` |
| LLM on public views | **none** — guard test unchanged and green | `publicResultNoLlm.test.ts` |
| Storage / bandwidth | no new table, no new column, no new upload; ~45 KB of extension icons in the repo only | `git diff --stat` |
| Paid APIs / SaaS / infra | **none added** — `package.json` unchanged (`sharp` used once at build time from existing `node_modules` to resize icons) | — |

**New recurring cost = $0.**

---

## H. Test report

| Check | Result | Baseline (RC `b0896e7`) |
|---|---|---|
| `npm test` (vitest app + db + required-suites gate) | **715 files pass, 10 skipped · 13,609 tests pass / 0 fail / 68 skipped** · 48/48 required suites ran | 13,568 / 0 / 68 |
| Android `:app:testDebugUnitTest` | **742 / 0 failures / 0 errors** | 739 / 0 |
| `tsc --noEmit` | 0 errors | 0 |
| `next lint` | 0 errors, 42 warnings | 0 / 42 |
| `architecture:check` | 14/14 rules pass | 14/14 |
| `check:sql-grants` | 0 errors | 0 |

New / extended suites (+41 web, +3 Android):
- `src/lib/growth/browserExtension.test.ts` — manifest & permission model, forbidden APIs, locale parity, deep-link contract, URL handling (schemes / credentials / query / length / control chars), context-menu decisions, settings coercion.
- `src/lib/scam-shield/deepLink.test.ts` — `?url=` prefill parser; `scamShieldV3.test.tsx` boundary guard extended.
- `src/lib/discovery/seoSurfaces.test.tsx` — entity `@id` across pages, `/about` render (vi SSR → en), metadata/canonicals, hub breadcrumb render, result-trail rule, robots, sitemap.
- `src/lib/discovery/llmsTxt.test.ts` — shape, allowed pages only, determinism, route headers.
- `analytics-contract.test.ts`, `attribution.test.ts` — three new sources; Bing split; `?src=` precedence over referrer.
- `growthMetrics.test.ts` — generation depth (incl. out-of-window parent and self-loop termination), first queries by source.
- `shareTarget.test.ts` — PWA `id` + shortcuts.
- Android `IncomingShareParserTest` — Process Text (selection, URL parity with SEND, empty/non-text).

Not run (no environment): iOS anything; real-browser extension UAT (unpacked load is documented); crawler behaviour (nothing is deployed).

---

## I. Remaining features

| Feature | Status | Note |
|---|---|---|
| Browser extension build + docs + tests | **DONE** | not published (owner) |
| Chrome Web Store listing / review / promotion | **NOT DONE** (by rule) | owner decision; no claims |
| Firefox build | **FUTURE** | needs `browser_specific_settings` + Mozilla listing |
| Google Search technical fixes (S1–S7) | **DONE** | |
| Home → hubs / About HTML links | **PARTIAL** | owner-locked Home; footer row recommended |
| hreflang / EN–VI URL split | **NOT DONE — not applicable** | would be a routing/i18n architecture change (FUTURE) |
| Search Console / Bing Webmaster / IndexNow submission | **BLOCKED** | needs deployment + owner credentials |
| `/about` entity layer, shared Organization, BreadcrumbList, `/llms.txt` | **DONE** | |
| `google_ai` / `chatgpt_search` as separate sources | **NOT DONE — deliberately** | `google_ai` unmeasurable; ChatGPT already `geo_chatgpt` |
| `bing_search`, `browser_extension`, `pwa_shortcut` sources | **DONE** | each set by a real mechanism |
| Multi-generation attribution + acquisition by source | **DONE** | `computeGrowthMetrics` |
| Android Process Text | **DONE** | |
| Android App Links claim in the app | **FUTURE** | needs release cert SHA-256 + native `/r/*` handling |
| iOS Universal Links / App Clip / Share Extension | **FUTURE** (doc-only) | no macOS |
| `android_deep_link` / `ios_*` sources | **NOT DONE — deliberately** | native apps emit no G1 events; nothing would set them |
| Zalo Mini App activation | **BLOCKED** (untouched by rule) | |
| TGDĐ / partnerships / ads | **BLOCKED** (out of scope by rule) | |
| G1 migrations (`20260913_g1_growth_foundation`, `20260918_g1b_share_ancestry`) | **NOT APPLIED** | owner-gated (ADR-014) |
| Deploy / push / real users | **NOT DONE** (by rule) | |

### Constraints honoured
No push · no deploy · no production migration · no real users / campaigns / physical QR · Zalo boundary untouched · no TGDĐ · no ads · no paid API / LLM provider / image generation / infrastructure · no other worktree modified (RC `web-uat-rc` still clean at `b0896e7`) · G1 extended, not rebuilt · one analytics system · public views LLM-free · extension never collects browsing · privacy not weakened · no indexing / AI-appearance / store claims.
