# TappyAI — Complete Free User Acquisition: discover → filter → master build

**Date:** 2026-09-18 · **Branch:** `feat/g1-completion` (from `79dbaa7`; RC `b0896e7` untouched) · **Release:** next week · **State:** pre-release — no deploy, no push, no migration, no store/directory submission, no real users, no Zalo, no TGDĐ, no ads.

This document is the single inventory. Phase 1 (Parts A–C) was completed before any code was written; Phase 2 (Parts D–I) records what was then built in one pass. Prior research is not repeated — it is referenced: `FREE_ACQUISITION_RESEARCH.md` (per-engine evidence, accessed 2026-09-18), `SEARCH_DISCOVERY.md` (technical SEO audit), `BROWSER_EXTENSION.md`, `DISTRIBUTION.md`, `G1_GROWTH_IMPACT_REPORT.md`.

Acceptance criteria applied to every candidate: **FREE** ($0 acquisition, $0 recurring; one-time publication fees separated) · **REACH USER** (a credible path to someone unaware / actively searching / already in a context where Tappy can appear) · **WE CAN DO IT** (no partnership, paid placement, private API, unavailable hardware/credentials, prohibited automation). Five-way distinction applied: technically possible ≠ reachable ≠ discoverable ≠ actually free ≠ controllable.

Evidence labels: **FACT** (official documentation, URL given) · **OBSERVATION** (seen in this repo / this session) · **HYPOTHESIS** (reasonable, unverified).

---

## PART A — EVERYTHING WE FOUND (complete inventory, 74 mechanisms)

Grouped by category. "Prev." = already built in G1 / completion / free-acquisition phases (not rebuilt).

### A1. Search engines
| # | Mechanism | What we found (evidence) |
|---|---|---|
| 1 | Google Search — crawl/index via sitemap + links; Search Console URL requests | FACT: developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl ("a few days to a few weeks"; no guarantee). Prev. eligibility built. |
| 2 | Google Indexing API | FACT: JobPosting/BroadcastEvent only — not usable. |
| 3 | Google Discover | FACT: developers.google.com/search/docs/appearance/google-discover (2026-03-09): "automatically eligible… if it is indexed… No special tags or structured data are required"; large images "At least 1200 px wide… Enabled by the `max-image-preview:large` setting". Not query-based; "less predictable". **Free, one meta directive — new.** |
| 4 | Bing — Bingbot, Bing Webmaster Tools, IndexNow | FACT: indexnow.org. Prev. IndexNow built (env-gated). |
| 5 | Yahoo Search | FACT (secondary, long-standing): organic results "Powered by Bing" → covered by Bing/IndexNow. |
| 6 | Ecosia | FACT: support.ecosia.org/article/579 — results from "Microsoft Bing, Google and EUSP" depending on country → covered by Bing + Google. |
| 7 | DuckDuckGo | FACT: duckduckgo.com/duckduckgo-help-pages/results/sources — "largely sourced from Bing" + own crawler → covered. |
| 8 | Brave Search | FACT: brave.com/blog/search-independence — own index; no submission; crawl only. |
| 9 | **Cốc Cốc Search (Vietnam #2, "574+ million queries per month")** | FACT: coccoc.com/search/console/en — "Submit individual URLs directly to Cốc Cốc Search's index"; sitemap discovered via the `Sitemap:` directive in robots.txt ("You can add the Sitemap directive to instruct our robots…"); crawler `coccocbot`; no fee stated. OBSERVATION: our robots.txt already emits `Sitemap:` → already discoverable; URL submission = owner (captcha). |
| 10 | Yandex / Naver / Seznam / Yep / Amazon | FACT: IndexNow participants → covered by the same push. |

### A2. AI search / assistants (see `FREE_ACQUISITION_RESEARCH.md` §1 for the full per-engine evidence)
| # | Mechanism | Stage reachable |
|---|---|---|
| 11 | Google AI Overviews / AI Mode | crawl→index→retrieve→cite (FACT: same index, "no additional technical requirements"); recommend = platform-controlled |
| 12 | Gemini app | via Google Search grounding (API FACT; consumer app HYPOTHESIS) |
| 13 | ChatGPT Search | crawl (OAI-SearchBot) →index→retrieve→cite (FACT); Bing as provider (FACT) |
| 14 | Claude | Claude-SearchBot / Claude-User (FACT) |
| 15 | Perplexity | PerplexityBot (FACT); Publishers' Program = partnership |
| 16 | Copilot | Bing index (FACT); AI Performance citation report (FACT) |
| 17 | DeepSeek | no authoritative evidence |
| 18 | Grok | no authoritative evidence |
| 19 | Meta AI | Meta-ExternalAgent / Fetcher (FACT) |
| 20 | Apple Siri/Spotlight/Safari | Applebot (FACT) |

### A3. AI app / tool ecosystems
| # | Mechanism | Available? | Public discovery? | Free? | Tappy can build? | New users? | Approval? | Recurring cost? |
|---|---|---|---|---|---|---|---|---|
| 21 | ChatGPT Apps (Apps SDK, MCP) + in-product directory | yes (FACT: openai.com/index/developers-can-now-submit-apps-to-chatgpt) | yes (directory) | no fee statement found | requires hosting an MCP server = new infrastructure | ASSISTED at best (ChatGPT users) | yes, verified org + review | hosting ≠ $0 |
| 22 | Custom GPTs / GPT Store | yes | yes | creation needs a paid ChatGPT plan (HYPOTHESIS, not verified from an official page) | — | ASSISTED | — | plan fee |
| 23 | Gemini extensions/apps | partner-only for third parties (no open submission found) | — | — | no | — | — | — |
| 24 | Claude integrations (MCP connectors) | yes, user-added by URL; directory is curated | limited | free | needs an MCP server (infra) | utility, not acquisition | — | hosting |
| 25 | Perplexity integrations | no open third-party directory found | — | — | — | — | — | — |
| 26 | Copilot extensions / plugins | Microsoft 365 / Copilot Studio (enterprise) | no consumer directory found | — | no | — | — | — |
| 27 | AI tool directories (There's An AI For That, Futurepedia, …) | yes | yes | free queue tiers exist | listing only | ASSISTED | owner submission | $0 |
| 28 | Public AI catalogs / marketplaces | various | some | mixed | listing only | ASSISTED | owner | $0 |

### A4. Browser ecosystem
| # | Mechanism | Found |
|---|---|---|
| 29 | Chrome Web Store | FACT: one-time registration fee (US$5, secondary); ranking heuristic = ratings + installs vs uninstalls. Prev.: listing kit prepared. **Cốc Cốc browser is Chromium-based and installs Chrome Web Store extensions → one listing covers Vietnam's #2 browser (OBSERVATION/HYPOTHESIS: Cốc Cốc supports CWS extensions per its Chromium base; verify at publication).** |
| 30 | Edge Add-ons | FACT: no registration fee. Kit prepared. |
| 31 | Firefox Add-ons (AMO) | FACT: free. Manifest AMO-ready (prev.). |
| 32 | Safari extensions | requires Xcode/macOS + Apple Developer Program (US$99/yr) → not free, not possible now. |
| 33 | OpenSearch address-bar engine | Prev. built (`/opensearch.xml`). RETENTION. |
| 34 | Context menus / selected text / page actions | Prev. built (extension). |
| 35 | PWA (manifest, shortcuts, share target) | Prev. built. RETENTION. |
| 36 | URL handlers (`protocol_handlers` / `url_handlers` in manifest) | OBSERVATION: no protocol of ours to handle; `web+tappy:` would be retention only → not worth it. |
| 37 | **Extension cross-links from public pages** (a recipient of a `/r/*` link or a hub visitor meets `/extension`) | OBSERVATION: `/extension` is linked only from `/about`; the pages unaware people actually land on (`/r/*`, hubs, scam pages) do not link it. **Free, new.** |

### A5. App stores
| # | Store | Registration | Listing | Organic discovery | Dependency |
|---|---|---|---|---|---|
| 38 | Google Play | US$25 one-time (FACT: support.google.com/googleplay/android-developer/answer/6112435) | free | store search + Google surfaces listings | Android release build + owner account |
| 39 | Apple App Store | US$99/yr (Apple Developer Program) — **not free** | — | — | macOS |
| 40 | Samsung Galaxy Store | Seller Portal sign-up (no fee found; FACT-adjacent: developer.samsung.com/galaxy-store) | free | store search | Android release build |
| 41 | Huawei AppGallery | free developer registration (FACT: developer.huawei.com — "Join Huawei Developer portal for free") | free | store search | Android release build; HMS considerations |
| 42 | Xiaomi GetApps | registration documented; fee not stated | — | store search | Android release build |
| 43 | Sideload/APK aggregator sites | rejected — questionable distribution, no control, malware association |

### A6. Android system surfaces
| # | Surface | Class | Status |
|---|---|---|---|
| 44 | Sharesheet / Direct Share inbound | RETENTION | Prev. built |
| 45 | ACTION_PROCESS_TEXT | RETENTION | Prev. built |
| 46 | App Links (`https://www.tappyai.com/r/*` opens the app) | RETENTION for installed users; server statement prepared | needs release cert SHA-256 + a native `/r/*` handler → owner |
| 47 | Custom-scheme deep links | RETENTION | pre-existing |
| 48 | Static launcher shortcuts (`shortcuts.xml`) | RETENTION | not built (rule: retention is not inflated into acquisition) |
| 49 | Widgets / Quick Settings tile / notifications | RETENTION | not built |
| 50 | App Actions / Assistant / Gemini app integration | FUTURE (Assistant App Actions are being folded into Gemini; third-party app integration is partner-gated) | — |
| 51 | Android search integration (system search of app content) | requires App Links/App Indexing (deprecated Firebase App Indexing) | FUTURE |
| 52 | Voice entry | RETENTION | pre-existing voice input |

### A7. iOS system surfaces (no macOS)
| # | Surface | Status |
|---|---|---|
| 53 | Universal Links | AASA served (env-gated, prev.); entitlement needs Xcode → FUTURE |
| 54 | App Clips (QR → instant experience) | FUTURE (App Clip target, AASA `appclips`, ASC config, Apple fee) |
| 55 | Share Extension / widgets / App Intents / Siri / Spotlight / Safari extension | FUTURE (all need Xcode + paid program) |

### A8. Public web
| # | Surface | Found |
|---|---|---|
| 56 | Public results `/r/*` (answers, plans, shopping, scam verdicts) | Prev. built; user-created; listed pages indexable |
| 57 | Category hubs `/food … /spa` | Prev. built (5 intent templates) |
| 58 | `/about`, `/scam-shield`, `/extension` | Prev. built |
| 59 | **Official scam-scenario pages** — the 25 Bộ Công an 2026 scenarios already in the product (`lib/scam-shield/knowledge`, shown inside the client-rendered `/scam-shield`), each with official text + TappyAI guidance + source link | OBSERVATION: today they are one client-rendered section with no URL of their own → invisible to search. Each scenario is a real, high-intent Vietnamese query ("lừa đảo deepfake", "việc nhẹ lương cao", "giả danh công an"). 25 pages from an authoritative dataset = not thin, not mass-generated, no model. **Strongest new TRUE-acquisition candidate.** |
| 60 | Public calculators / checkers / interactive tools | A public "check this URL" page that runs the engine per crawl = abuse + cost → rejected; the share-out verdict page (`/r/*`, kind `scam_check`) already is the public checker output. |
| 61 | Public comparison / itinerary / local-guide pages generated in bulk | rejected (mass thin pages; model cost). Only user-shared results become public. |
| 62 | Public FAQ | hubs carry FAQPage (prev.) |

### A9. Social discovery
| # | Mechanism | Found |
|---|---|---|
| 63 | OG / Twitter cards on every public page | Prev. built (FACT-level requirement for Facebook/Messenger/Zalo/Telegram/WhatsApp/X/LinkedIn/Reddit previews) |
| 64 | Pinterest Rich Pins (article) | FACT: developers.pinterest.com/docs/rich-pins — Open Graph/schema.org markup; validator at developers.pinterest.com/tools/url-debugger. OBSERVATION: `/r/*` already emits `og:type=article` + `article:published_time` → eligible; validation = owner. |
| 65 | **oEmbed provider for `/r/*`** — WordPress, Ghost, Discourse, Notion, Medium, Slack unfurls etc. auto-embed a pasted link as a rich card | FACT: oembed.com — discovery via `<link rel="alternate" type="application/json+oembed">`; "strongly encouraged" over the registry. Free, deterministic, reads the same frozen row as the page. **New.** |
| 66 | Telegram Instant View / WhatsApp / Messenger / email / SMS | all consume OG cards → covered; share via OS sheet → covered |
| 67 | YouTube / TikTok / Instagram / Reddit / X content | content creation, not code → not "we can do it" technically; OG cards are the technical part (done) |
| 68 | ActivityPub | rejected — not applicable to a product site; content-farm risk |

### A10. Community / developer / directories / entity / Vietnam
| # | Mechanism | Found |
|---|---|---|
| 69 | GitHub public repo for the extension | owner decision (self-contained plain JS; would expose nothing of the web app) → PREPARE |
| 70 | Product Hunt / AlternativeTo / Crunchbase / LinkedIn / HN "Show HN" / Reddit | free tiers; owner submission; kit prev. prepared |
| 71 | npm / public API | rejected — not a developer product; a public API would be new infrastructure and a cost surface |
| 72 | Wikidata / Google Business Profile / Bing Places | FACT: not eligible (Wikidata notability; GBP physical presence) |
| 73 | Vietnam startup/tech directories (e.g. Techfest/NATEC listings, VIC communities, local "startup Việt" catalogs) | free listing tiers exist on several; must be verified individually at submission → owner; added to the kit as "verify" |
| 74 | NFC tags | same URL as the QR (`/food?src=qr_pos` etc.); infrastructure exists; placement = physical → no build |

---

## PART B — STRICT FILTER

| # | Candidate | FREE | REACH USER | WE CAN DO IT | Notes |
|---|---|---|---|---|---|
| 1 | Google crawl/index | YES | YES | YES (eligibility) | prev. built |
| 2 | Google Indexing API | YES | NO (not applicable) | NO | — |
| 3 | Google Discover eligibility | YES | YES (conditional, Google-controlled) | YES | one directive |
| 4 | Bing + IndexNow | YES | YES | YES | prev. built |
| 5–7 | Yahoo / Ecosia / DDG | YES | YES | YES (via Bing/Google) | covered |
| 8 | Brave | YES | YES | YES (crawl) | covered |
| 9 | Cốc Cốc | YES | YES (Vietnam) | YES (sitemap already discoverable); URL submit = owner | PREPARE |
| 10 | IndexNow partners | YES | YES | YES | covered |
| 11–16, 19, 20 | Documented AI engines | YES | YES (conditional) | YES (crawl allowed) | covered |
| 17, 18 | DeepSeek / Grok | YES | UNKNOWN | NO (nothing controllable) | research-only |
| 21 | ChatGPT Apps | NO (MCP hosting) | ASSISTED | NO now | FUTURE |
| 22 | Custom GPTs | NO (plan fee, unverified) | ASSISTED | — | REJECT/FUTURE |
| 23–26 | Gemini/Claude/Perplexity/Copilot integrations | — | — | NO (partner/infra) | FUTURE |
| 27–28 | AI directories | YES (free tiers) | ASSISTED | owner | PREPARE (kit) |
| 29 | Chrome Web Store | one-time $5 (not recurring) | YES | owner | PREPARE |
| 30 | Edge Add-ons | YES | YES | owner | PREPARE |
| 31 | Firefox AMO | YES | YES | owner | PREPARE |
| 32 | Safari extension | NO ($99/yr) | — | NO (Mac) | FUTURE |
| 33–35 | OpenSearch / PWA | YES | NO (retention) | YES | prev. built; RETENTION |
| 36 | URL handlers | YES | NO | YES | REJECT |
| 37 | Extension cross-links on public pages | YES | YES (recipients/visitors are unaware people) | YES | **BUILD** |
| 38 | Google Play | one-time $25 | YES | owner + release build | PREPARE (kit) |
| 39 | App Store | NO | — | NO | FUTURE |
| 40–42 | Galaxy / AppGallery / GetApps | YES | YES | owner + release build | PREPARE (kit) |
| 43 | APK sites | YES | ? | NO (not legitimate) | REJECT |
| 44–49, 52 | Android retention surfaces | YES | NO | YES | RETENTION (no new build) |
| 46 | App Links | YES | NO (retention) | owner cert | PREPARE |
| 50–51 | Assistant / system search | — | — | NO | FUTURE |
| 53–55 | iOS | NO ($99/yr) / — | — | NO (Mac) | FUTURE |
| 56–58, 62 | Public results, hubs, entity pages | YES | YES | YES | prev. built |
| 59 | Official scam-scenario pages | YES | YES (search intent) | YES (dataset exists) | **BUILD** |
| 60 | Public URL checker page | YES | YES | NO (cost/abuse) | REJECT |
| 61 | Bulk comparison/guide pages | NO (model) | — | NO (spam) | REJECT |
| 63 | OG cards | YES | YES | YES | prev. built |
| 64 | Pinterest Rich Pins | YES | YES (Pinterest search) | eligible; validation owner | PREPARE |
| 65 | oEmbed provider | YES | YES (readers of third-party pages) | YES | **BUILD** |
| 66 | Messaging previews | YES | YES | YES | covered |
| 67 | Video/social content | YES | YES | NO (not technical) | REJECT (not code) |
| 68 | ActivityPub | YES | NO | NO | REJECT |
| 69 | GitHub extension repo | YES | ASSISTED | owner | PREPARE |
| 70 | Product Hunt etc. | YES | ASSISTED | owner | PREPARE |
| 71 | npm / public API | NO (infra) | NO | NO | REJECT |
| 72 | Wikidata / GBP | YES | — | NO (ineligible) | REJECT |
| 73 | VN directories | YES (verify) | ASSISTED | owner | PREPARE |
| 74 | NFC | YES | YES (placement) | infra exists | covered |

**Passing all three now (not already built):** #3, #37, #59, #65. Everything else is already built, owner action, retention, future or rejected.

---

## PART C — DEFINITIVE BUILD LIST (Phase 2 scope)

| Item | Mechanism | Acquisition class | Attribution / measurement |
|---|---|---|---|
| **BUILD-1** | **Official scam-scenario public pages**: `/scam-shield/kich-ban` (index of the 25 official scenarios by group) + `/scam-shield/kich-ban/<id>` ×25, static, server-rendered, official text visibly separated from TappyAI guidance, source link to bocongan.gov.vn, `Article` + `BreadcrumbList` JSON-LD, canonical, sitemap, `/llms.txt`, CTA into Scam Shield | **A — TRUE** (search intent) | landing on these pages → `wedge_scam` (existing rule: a session starting on Scam Shield surfaces is a wedge entry) / `geo_google` / `bing_search` by referrer; conversion = query/check |
| **BUILD-2** | **oEmbed provider** `GET /api/oembed?url=<public result URL>` + `<link rel="alternate" type="application/json+oembed">` on `/r/*` | B — ASSISTED | embed click lands on `/r/<slug>` → `share_out` + `share_viewed` (existing) |
| **BUILD-3** | **Google Discover eligibility**: `max-image-preview: large` on `/r/*`, hubs, scam pages, `/about`, `/extension` | B — ASSISTED (Google-controlled) | `geo_google` (Discover referrer is google.com/googleapis) |
| **BUILD-4** | **Extension discovery on landing surfaces**: "Get the browser extension" link on `/r/*` (public result footer), hubs and scam pages | B — ASSISTED | `/extension` page views; install signal via `/extension/welcome` (prev.) |
| BUILD-5 | Sitemap + `/llms.txt` updated for the new pages | enabler | — |

Not on the list (deliberately): anything retention-only, anything needing a store account, a Mac, an MCP server, a paid plan, or content creation.


---

## PART D — IMPLEMENTED (Phase 2, one pass)

### D1. Official scam-scenario pages — `/scam-shield/kich-ban` + 25 × `/scam-shield/kich-ban/<id>`
- **Files:** `src/lib/scam-shield/knowledgePages.ts` (paths, param resolver, metadata, Article/ItemList JSON-LD — pure), `src/app/scam-shield/kich-ban/{page,KnowledgeIndexBody}.tsx`, `src/app/scam-shield/kich-ban/[id]/{page,ScenarioPageBody}.tsx`, `ScamKnowledgeSection.tsx` (`ScenarioDetail` exported — the same renderer, not a copy), `src/lib/i18n/discovery.ts` (`kb.*` vi+en), `src/app/sitemap.ts` (+26 URLs), `src/lib/discovery/llmsTxt.ts`.
- **Implementation:** static (`generateStaticParams` = exactly the dataset's 25 ids, `dynamicParams=false`); server-rendered in the product locale; official text block + TappyAI guidance block + the source's prevention measures, visibly separated and labelled (dataset rule kept); source link on `bocongan.gov.vn`; `Article` (`isBasedOn` the official document; `author`/`publisher` = the shared Organization `@id`) + `BreadcrumbList` (Home › Scam Shield › Kịch bản › page); canonical; `max-image-preview: large`; CTA into Scam Shield; extension link; sibling scenarios.
- **User flow:** search "lừa đảo deepfake" → scenario page → *Kiểm tra với Scam Shield* → `/scam-shield` (anonymous, existing quota) → verdict → share-out (existing) or `/extension`.
- **Class:** **A — TRUE ACQUISITION** (search intent; the person has never heard of Tappy).
- **Attribution:** landing → referrer class (`geo_google` / `bing_search` / `geo_chatgpt`) via the existing `parseLandingAttribution`; a session that then opens `/scam-shield` keeps its source (the `wedge_scam` rule only fills `direct`). No new source needed.
- **Analytics:** existing spine (`first_visit.landing_path`, `query`, `share_created`); `computeGrowthMetrics().acquisition.firstQueriesBySource` shows the channel.
- **Privacy:** no user data; static dataset; no model, no fetch (guard test scans the page layer).
- **Cost:** $0 — 26 static pages of bytes.
- **Tests:** `src/lib/scam-shield/knowledgePages.test.tsx` (10): exactly 25 pages; junk ids → 404; official source host + Article `isBasedOn` for all 25; metadata; official/guidance blocks + source link; breadcrumb trail; internal links; en chrome with vi content; index groups/ItemList; sitemap + llms.txt; no-model import guard.

### D2. oEmbed provider — `GET /api/oembed` + discovery tag on `/r/*`
- **Files:** `src/lib/share/oembed.ts` (pure: target parser, document builder), `src/app/api/oembed/route.ts`, `src/lib/share/sharedResultMetadata.ts` (`alternates.types` → `<link rel="alternate" type="application/json+oembed">`).
- **Implementation:** answers only for `https://www.tappyai.com/r/<valid slug>`; one indexed read of the same frozen public row; `type: rich`, script-free `<blockquote>` card (title, summary from the sanitized body, link back), thumbnail = the per-share OG card; width bounded 200–600; `format=xml` → 501; unknown → 404; rate-limited 120/min/IP; cache 1h/24h; CORS `*` (oEmbed consumers fetch cross-origin).
- **User flow:** sharer pastes a `/r/<slug>` link into WordPress/Ghost/Discourse/Notion → the CMS embeds the card → every reader of that page sees the answer and the link.
- **Class:** **B — ASSISTED** (needs a sharer; then reaches that page's readers).
- **Attribution:** the card links to `/r/<slug>` → existing `share_out` landing + `share_viewed` (share_id bridge).
- **Privacy:** sanitized payload only; no user/anon/session fields in the document (test asserts).
- **Cost:** $0.
- **Tests:** `src/lib/share/oembed.test.ts` (6): target allow-list; document shape/escaping/no-script/width bounds/no identifiers; discovery link in metadata; route MIME/cache/CORS; 404/501 paths.

### D3. Google Discover eligibility — `max-image-preview: large`
- **Files:** `sharedResultMetadata.ts` (listed `/r/*` only), `(discovery)/[domain]/page.tsx`, `about/page.tsx`, `extension/page.tsx`, both scam-scenario pages.
- **Implementation:** the one directive Google documents beyond indexing ("Enabled by the `max-image-preview:large` setting"); the per-share OG card is 1200×630. Unlisted (anonymous-owned) pages unchanged (`noindex`).
- **Class:** **B — ASSISTED** (Google-controlled, interest-based, "less predictable").
- **Attribution:** `geo_google` (referrer). **Cost:** $0. **Tests:** assertions in `oembed.test.ts`, `seoSurfaces.test.tsx`, `extensionAcquisition.test.tsx`, `knowledgePages.test.tsx`, `sharedResult.test.ts`.

### D4. Extension discovery on landing surfaces
- **Files:** `src/app/r/[slug]/PublicResultView.tsx` (footer link; `publicResult.extensionHint` in `share.ts`), `(discovery)/[domain]/HubBody.tsx` (`hub.ui.extension`), both scam-scenario pages (`kb.page.extensionLine`).
- **Implementation:** one internal link to `/extension` on every page an unaware person actually lands on. The landing page keeps the honest store state (no store URL → "awaiting review" + web CTA).
- **Class:** **B — ASSISTED**. **Attribution/analytics:** `/extension` page views; install signal = `first_visit` on `/extension/welcome` (prev.). **Cost:** $0. **Tests:** render assertions in `knowledgePages.test.tsx`; the public-result and hub suites pass with the new keys (`shareI18n`, `discoveryI18n`, `r/*` suites).

### D5. Sitemap + `/llms.txt`
- +26 sitemap URLs (index 0.8, scenarios 0.7); `/llms.txt` lists the scenario index and the extension page. Tests in `knowledgePages.test.tsx`, `llmsTxt.test.ts`.

**Verification (this pass):** web **13,648 pass / 0 fail / 68 skipped** (720 files; +16 tests over `79dbaa7`), 48/48 required suites; Android **742 / 0** (tree unchanged, re-run); tsc 0; lint 0 errors (42 warnings = baseline); architecture 14/14; sql-grants 0 errors.

---

## PART E — PREPARED, OWNER ACTION REQUIRED

| Item | What is ready | Owner does |
|---|---|---|
| Cốc Cốc Search | sitemap discoverable via robots.txt `Sitemap:`; page list in `DIRECTORY_SUBMISSION_KIT.md` | submit the listed URLs at coccoc.com/search/console (captcha) after deploy |
| Google Search Console / Bing Webmaster Tools | sitemap, canonicals, IndexNow | verify the property, submit `sitemap.xml`, set `INDEXNOW_KEY` |
| Chrome Web Store / Edge Add-ons / Firefox AMO | `extensions/browser/store/LISTING.md`, packaging command, AMO-ready manifest, `/extension/privacy` | register (Chrome US$5 one-time; Edge/AMO free), upload, then paste listing URLs into `NEXT_PUBLIC_EXTENSION_URL_*` |
| Google Play / Galaxy Store / AppGallery / GetApps | `ANDROID_STORE_LISTING_KIT.md` (copy, data-safety outline, post-publish steps) | release build + accounts (Play US$25 one-time; others free) — a separate decision |
| Pinterest Rich Pins | `/r/*` emits `og:type=article` + `article:published_time` | validate one URL at developers.pinterest.com/tools/url-debugger |
| Directories / profiles | `DIRECTORY_SUBMISSION_KIT.md` (canonical copy; VN additions) | LinkedIn, Crunchbase, Product Hunt (post-release), 2–3 AI/VN directories; then `ORGANIZATION_SAME_AS` |
| GitHub repo for the extension | self-contained folder | decide whether to publish |
| Android App Links | AASA/assetlinks routes env-gated | release cert SHA-256 + native `/r/*` handler |
| Home footer links (hubs · About · Scam Shield · extension) | recommendation | owner UI decision (Home is locked) |

---

## PART F — REJECTED (with the failed criterion)

| Candidate | Failed | Why |
|---|---|---|
| Google Indexing API | REACH (not applicable) | JobPosting/BroadcastEvent only (FACT) |
| ChatGPT Apps / MCP server, Claude connectors | FREE (hosting) + WE CAN DO IT (new infra) | needs a hosted MCP server; ASSISTED at best; FUTURE |
| Custom GPTs | FREE | creation tied to a paid plan (HYPOTHESIS; not verified) |
| Gemini / Perplexity / Copilot third-party integrations | WE CAN DO IT | partner-gated or enterprise-only; no open submission found |
| Safari extension, all iOS surfaces | FREE (US$99/yr) + WE CAN DO IT (no Mac) | FUTURE |
| Apple App Store | FREE | annual fee |
| APK aggregator distribution | WE CAN DO IT (legitimacy) | no control, malware association |
| Android launcher shortcuts / widgets / QS tile / notifications | REACH | retention only — not inflated into acquisition |
| Assistant / App Actions / system search | WE CAN DO IT | partner-gated / deprecated paths |
| `protocol_handlers` / custom URL handlers | REACH | nobody types `web+tappy:` |
| Public "check this URL" page that runs the engine per visit | WE CAN DO IT (cost/abuse) | crawler-triggered engine calls; the share-out verdict page already exists |
| Bulk comparison / itinerary / local-guide pages | FREE (model) + legitimacy | thin/mass pages; only user-shared results become public |
| YouTube / TikTok / Instagram / Reddit / X content | WE CAN DO IT (not code) | content creation is not a technical mechanism; OG cards are done |
| ActivityPub | REACH + legitimacy | not applicable to a product site; content-farm risk |
| npm / public API | FREE (infra) + REACH | not a developer product |
| Wikidata / Google Business Profile / Bing Places | WE CAN DO IT (ineligible) | notability / physical-presence rules (FACT) |
| DeepSeek / Grok specific actions | WE CAN DO IT | nothing documented to control |
| Price Check wedge | FREE (LLM/API) | no deterministic free source |
| `hreflang` EN/VI | WE CAN DO IT (architecture) | no per-language URLs; would be a routing change |
| Sitemap image extensions, HowTo/Speakable markup | REACH | no acquisition effect (HowTo rich results retired) |

---

## PART G — SEARCH / AI EVIDENCE (documented vs inferred)

Full per-engine evidence with URLs: `FREE_ACQUISITION_RESEARCH.md` §1–§2. What this phase added:

| Engine | Documented (FACT) | Inferred (HYPOTHESIS) |
|---|---|---|
| Google | crawl/index/no-guarantee; AI Overviews/AI Mode need only indexing + snippet eligibility; **Discover: "automatically eligible… if it is indexed"; large images via `max-image-preview:large`** (new, developers.google.com/search/docs/appearance/google-discover, 2026-03-09) | that scenario pages will rank for their queries |
| Bing / Copilot | IndexNow; AI Performance citation report | — |
| **Cốc Cốc** (new) | URL submission console; sitemap via robots `Sitemap:`; crawler `coccocbot`; "574+ million queries per month" (coccoc.com/search/console/en) | fee-free (no fee stated) |
| Yahoo / Ecosia / DDG | Bing-powered (Ecosia: "Microsoft Bing, Google and EUSP" by country — support.ecosia.org/article/579) | — |
| ChatGPT | OAI-SearchBot; Bing provider; Apps directory needs MCP server + verified org | GPTs need a paid plan |
| Gemini | Search grounding (API doc) | consumer app uses the same index |
| Claude / Perplexity / Meta / Apple | named bots, robots behaviour | — |
| DeepSeek / Grok | **no authoritative evidence** | — |
| Recommendation (any engine) | **no documented free mechanism** | — |

---

## PART H — EXTENSION ACQUISITION (state after this phase)

```
Unaware user
   ↓  Google/Bing/Cốc Cốc result for /extension (indexable, SoftwareApplication JSON-LD)      — built; needs indexing
   ↓  OR a link on /r/* · hubs · scam pages · /about                                          — built (this phase)
   ↓  OR store search (Chrome / Edge / Firefox; Cốc Cốc browser installs CWS extensions)      — kit prepared; owner publishes
Discovery → /extension shows install buttons ONLY when NEXT_PUBLIC_EXTENSION_URL_* are set    — built
   ↓
Install → extension opens /extension/welcome?src=browser_extension once                        — built (install signal, no telemetry)
   ↓
First use → /chat?q=…&src=browser_extension or /scam-shield?url=…                              — built
   ↓
TappyAI → useful result → share-out (/r/*) → recipient sees OG card / oEmbed card / extension link — built
```
**Missing (owner/platform):** store registration + review; store URLs into env; indexing of `/extension`; a launch post. **Actual acquisition** (someone who never heard of Tappy installing it) is only possible through the store listing or search — both post-release.

---

## PART I — COMPLETE FREE ACQUISITION MAP

```
                                   TAPPYAI
                                      │
   ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
   │                  │               │               │                  │
 SEARCH            AI SEARCH       BROWSER        PUBLIC WEB          APP / OS
   │                  │               │               │                  │
 Google (index,    ChatGPT (OAI-    Extension       /r/* results      Android:
   Discover)        SearchBot,      (/extension,    5 hubs             Process Text,
 Bing (IndexNow)    Bing)           welcome,        /about             Direct Share,
 Cốc Cốc (VN)     Copilot (Bing)    stores*)        /scam-shield       PWA shortcuts,
 DuckDuckGo/       Gemini (Google)  OpenSearch      25 scam-scenario   App Links*
   Yahoo/Ecosia    Perplexity       PWA               pages (NEW)      iOS: future
   (Bing)          Claude           Cốc Cốc         /extension
 Brave (crawl)     Meta AI, Apple    browser (CWS)  /llms.txt, feed
 Yandex/Naver…     DeepSeek/Grok ?                  oEmbed cards (NEW)
   (IndexNow)                                       QR / NFC entry
   └──────────────────┴───────────────┼───────────────┴──────────────────┘
                                      ↓
                                 NEW VISITOR
                                      ↓
                                    TAPPY  (anonymous quota, no login wall)
                                      ↓
                                USEFUL RESULT
                                      ↓
                        SHARE → /r/<slug> (OG · oEmbed · Atom · IndexNow)
                                      ↓
                                 NEW VISITOR  ↺   (N-generation ancestry measured)

 * = owner publication required.   ? = no authoritative evidence.
```

---

## FINAL NUMBERS

| Metric | Count |
|---|---|
| Total mechanisms researched | **74** |
| Passing all 3 criteria (FREE + REACH + WE CAN DO IT) | **34** — 30 already built in earlier phases or covered by an existing mechanism, **4 new** |
| BUILD (this pass) | **4** (+ sitemap/llms wiring) |
| PREPARE (owner action, kits ready) | **9** (Cốc Cốc submission; Search Console/BWT + IndexNow key; extension stores; Android stores; Pinterest validation; directories/profiles + `sameAs`; GitHub repo; App Links cert; Home footer) |
| FUTURE | **8** (ChatGPT Apps/MCP; Claude connectors; Gemini/Perplexity/Copilot integrations; Safari; iOS surfaces; Assistant/App Actions; Play Instant/system search; App Store) |
| REJECTED | **19** (Part F) |
| TRUE ACQUISITION paths (A) live in code | **7**: Google-family search of indexable pages · Bing-family (IndexNow) · Cốc Cốc · AI-engine citation of indexable pages · **scam-scenario pages (new)** · share-out `/r/*` to a recipient · scam-verdict share-out |
| ASSISTED ACQUISITION (B) | **11**: extension landing + stores · extension links on landing surfaces (new) · oEmbed (new) · Discover (new) · Atom feed · `/llms.txt` · QR/NFC · directories · Pinterest · second-generation shares · PWA/Android share targets feeding the loop |
| RETENTION (C) | **8**: OpenSearch, PWA shortcuts, Web Share Target, Process Text, Direct Share, deep links, App Links (when claimed), voice |
| **New recurring operating cost** | **$0** — every built item is static/cached/deterministic on existing infrastructure; no model, no API, no SaaS; `package.json` unchanged. One-time owner fees exist only for optional store accounts (Chrome US$5, Play US$25). |

**Constraints honoured:** no deploy, no push, no production migration, no store or directory submission, no real users, no Zalo, no TGDĐ, no ads; RC `b0896e7` untouched; extension permission model unchanged; public views LLM-free (guard suites green); privacy not weakened (new pages carry no user data; oEmbed serves only sanitized public rows).
