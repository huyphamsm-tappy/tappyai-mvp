# TappyAI — Free Acquisition Deep Research + Build

**Date:** 2026-09-18 (research accessed 2026-09-18) · **Branch:** `feat/g1-completion` on top of `19569f1` (RC `b0896e7` untouched)
**Scope:** search engines, AI assistants, browser extension distribution, every other free technical channel — researched against official documentation, then built where free, safe and feasible before next week's release.
**Hard rule applied throughout:**

```
TECHNICAL ELIGIBILITY ≠ INDEXING ≠ RETRIEVAL ≠ CITATION ≠ PRODUCT RECOMMENDATION ≠ USER CONVERSION
EXTENSION BUILT ≠ EXTENSION DISCOVERED ≠ EXTENSION INSTALLED ≠ TAPPYAI USER
```

Nothing below claims that any engine indexes, cites or recommends TappyAI. Nothing is deployed. The validation plan (`AI_SEARCH_VALIDATION_PLAN.md`) is how those claims get earned after release.

---

## 0. What was built in this phase (summary; details in §5)

| Built | Free? | Class | Files |
|---|---|---|---|
| **IndexNow** push of every new LISTED public page to Bing/Yandex/Naver/Seznam/Yep (env-gated, fire-and-forget, never for noindex pages) | yes ($0, no account) | ASSISTED (indexing speed for Bing → Copilot / ChatGPT search providers) | `lib/discovery/indexNow.ts`, `/.well-known/indexnow/[key]/route.ts`, hooks in both share routes |
| **`/extension` landing page** (indexable, SoftwareApplication + Breadcrumb, env-gated store buttons, permission table, FAQ) | yes | ASSISTED (the extension's only open-web front door) | `app/extension/*`, `lib/growth/extensionListing.ts` |
| **`/extension/privacy`** (store-required policy, vi+en, matches manifest) | yes | enabler | `app/extension/privacy/*` |
| **`/extension/welcome`** + extension `onInstalled(install)` opens it once with `?src=browser_extension` → **install → first-use metric with zero extension telemetry** | yes | measurement | `app/extension/welcome/*`, `extensions/browser/background.js`, `growthMetrics.extension` |
| Extension: `homepage_url`, Firefox `browser_specific_settings` (AMO-ready, free) | yes | enabler | `extensions/browser/manifest.json` |
| **Store listing kit** (Chrome/Edge/Firefox copy, single-purpose statement, permission justifications, data-use disclosure, packaging) | yes | preparation | `extensions/browser/store/LISTING.md` |
| **OpenSearch** description + `<link rel="search">` (Firefox/Edge/Safari auto-register "ask Tappy" as an address-bar engine; Chrome inactive until enabled) | yes | RETENTION | `lib/discovery/browserFeeds.ts`, `/opensearch.xml`, `layout.tsx` |
| **Atom feed** of newest listed public results + `<link rel="alternate">` | yes | ASSISTED (aggregators/crawlers) | `/feed.xml` |
| **Organization `sameAs`** from `ORGANIZATION_SAME_AS` (owner-verified profiles only; empty until set) | yes | entity enabler | `lib/discovery/siteJsonLd.ts` |
| New tracked source `browser_search` | yes | measurement | `analytics-contract.ts` |
| **Directory submission kit** (canonical copy; eligibility verdicts incl. Wikidata NOT eligible, GBP NOT eligible) | yes | preparation | `docs/growth/DIRECTORY_SUBMISSION_KIT.md` |
| **35-query validation plan** with pre-registered thresholds | yes | measurement | `docs/growth/AI_SEARCH_VALIDATION_PLAN.md` |

**New recurring cost: $0.** No paid API, no SaaS, no LLM on any new path, `package.json` unchanged.

---

## 1. Per-platform research

Format for each: Q1 organic discovery of an unknown site · Q2 citation / source / recommendation / product discovery · Q3 mechanisms and controllable inputs · Evidence.

### 1.1 Google Search

- **Q1 — Can it discover an unknown site organically?** **YES.** Mechanism: crawling (Googlebot) → indexing → ranking. Discovery of URLs comes from links and sitemaps; Search Console can request crawling of individual URLs.
- **Q2 — Citation / source / recommendation / product discovery:** Google Search does not "recommend" products; it ranks pages. A TappyAI page can appear as a result (**discovery**). "Recommendation" in the sense the task means does not exist as a mechanism in web search; it exists only as a ranked result for a query where TappyAI's page is the best answer.
- **Q3 — Mechanisms and what TappyAI controls:**
  - Controllable now: crawlable public pages, canonical, sitemap, robots, structured data, page content, internal links, entity page (`/about`), one Organization node.
  - Requires external action/time: indexing ("a few days to a few weeks"), links from other sites ("one of the factors used to determine quality is understanding if other prominent websites link or refer to the content").
  - Search Console: helps *diagnose and request* — "Requesting a crawl does not guarantee that inclusion in search results will happen instantly or even at all."
  - No product submission mechanism for a web app. Indexing API is restricted: "can only be used to crawl pages with either `JobPosting` or `BroadcastEvent` embedded in a `VideoObject`."
  - Google Business Profile: **not applicable** — eligibility requires "a physical location that customers can visit, or travels to customers where they are."
  - Google Play listing: a store listing is a separately indexable page; it does not change web-page ranking. (Out of scope; Android release is a separate decision.)
- **Evidence:**
  | Source | URL | Type | Statement | Proves | Does not prove |
  |---|---|---|---|---|---|
  | Google Search Central, "Ask Google to recrawl your URLs" (updated 2025-12-10) | https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl | official | "A sitemap is an important way for Google to discover URLs"; "Crawling can take anywhere from a few days to a few weeks"; "Requesting a crawl does not guarantee…" | discovery path + latency; no guarantee | ranking |
  | Google, "How Search Works — Ranking results" | https://www.google.com/search/howsearchworks/how-search-works/ranking-results/ | official | "one of the factors used to determine quality is understanding if other prominent websites link or refer to the content" | links/mentions are a quality input | how much |
  | Indexing API quickstart | https://developers.google.com/search/apis/indexing-api/v3/quickstart | official | "can only be used to crawl pages with either JobPosting or BroadcastEvent" | no push-indexing for TappyAI pages | — |
  | Google Business Profile guidelines | https://support.google.com/business/answer/3038177 | official | physical location or travels to customers | GBP is not a TappyAI channel | — |
  | Google common crawlers (updated 2026-07-14) | https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers | official | "Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal" | allowing/blocking training does not affect Search | — |

### 1.2 Google AI Overviews and AI Mode

- **Q1:** **CONDITIONAL** — same index as Search; a page must be indexed first.
- **Q2:** **Citation** = "supporting link" in an AI Overview / AI Mode answer. Possible for any indexed page eligible for a snippet. **Product recommendation** = the generated text naming TappyAI as a tool; no mechanism exists to cause this; it is a model output over indexed content.
- **Q3:** "There are no additional technical requirements" and "no… special optimizations necessary". Controls are the normal snippet controls (`nosnippet`, `max-snippet`, `noindex`). `Google-Extended` governs Gemini training only. **Measurement limit:** an AI Overview click carries the same `google.com` referrer as a normal result — TappyAI therefore has **no `google_ai` source** (a guess would pollute the report).
- **Evidence:** Google Search Central, "AI features and your website" (updated 2025-12-10), https://developers.google.com/search/docs/appearance/ai-features — "To be eligible to be shown as a supporting link in AI Overviews or AI Mode, a page must be indexed and eligible to be shown in Google Search with a snippet"; "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary." Proves eligibility rule; does not prove appearance.

### 1.3 Gemini (consumer app)

- **Q1:** **CONDITIONAL.** The documented grounding mechanism for Gemini models is Google Search: "Grounding with Google Search connects the Gemini model to real-time web content… cite verifiable sources" (Gemini API docs). For the consumer Gemini app, **no authoritative document was found describing a separate index or a submission path**; the reasonable inference — not a proven fact — is that the same Google index applies.
- **Q2:** Citation possible when grounded; recommendation is model output; no submission mechanism. "Gems" and Gemini extensions/apps are partner or personal features, not a public directory (no authoritative evidence found of an open submission path).
- **Evidence:** https://ai.google.dev/gemini-api/docs/google-search (official, developer API). Proves the grounding mechanism for API use; does not prove consumer-app behaviour.

### 1.4 Bing

- **Q1:** **YES.** Bingbot crawl → Bing index. **Free push mechanism exists:** IndexNow — one POST notifies Bing and all participating engines ("Search engines adopting the IndexNow protocol agree that submitted URLs will be automatically shared with all other participating search engines"; participants: Bing, Naver, Seznam.cz, Yandex, Yep, Amazon; **Google is not a participant**). Bing Webmaster Tools offers sitemap submission and URL submission (owner credentials).
- **Q2:** Discovery as a result. Citation in Bing's AI summaries and Copilot (see 1.5).
- **Q3:** Controllable: sitemap, IndexNow (built), structured data, public content. Owner action: Bing Webmaster Tools verification.
- **Evidence:** https://www.indexnow.org/documentation and https://www.indexnow.org/faq (protocol owner; accessed 2026-09-18). Proves the push path and participant list; does not prove ranking.

### 1.5 Microsoft Copilot

- **Q1:** **CONDITIONAL** — Copilot's web answers are grounded on Bing's index; a page indexed by Bing can be retrieved.
- **Q2:** **Citation YES (mechanism documented):** Bing Webmaster Tools' AI Performance report "shows when your site is cited in AI-generated answers across Microsoft Copilot, AI-generated summaries in Bing, and select partner integrations." This is the only engine that gives site owners a first-party citation report. **Recommendation:** model output; no mechanism.
- **Q3:** Controllable: everything Bing needs + IndexNow ("keeping information current via IndexNow" is Microsoft's own advice in the announcement). Owner action: verify the site in Bing Webmaster Tools to read the report.
- **Evidence:** Bing Webmaster Blog, "Introducing AI Performance in Bing Webmaster Tools (Public Preview)", 2026-02-10, https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview ; help page https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c (content behind script; title confirmed). Proves citation is measurable and Bing-grounded; does not prove TappyAI will be cited.

### 1.6 ChatGPT Search

- **Q1:** **YES (documented).** OpenAI: "Any website or publisher can choose to appear in ChatGPT search… make sure you aren't blocking OAI-SearchBot." OAI-SearchBot "builds and refreshes the search index that powers ChatGPT search results and the citations attached to them." ChatGPT search also "leverages third-party search providers" and "may share disassociated search queries with the Bing search engine" — so Bing indexing (IndexNow) is a second path in.
- **Q2 — the four are different:**
  - **Citation (web page):** YES, mechanism documented (OAI-SearchBot index; "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers").
  - **Source:** same mechanism.
  - **Product recommendation:** model output; **no controllable mechanism**; no directory for websites.
  - **App discovery (Apps in ChatGPT):** a *separate* mechanism — developers submit an MCP-based app for review; approved apps appear in an in-product directory. Requirements: "All plugin submissions must come from verified individuals or organizations", a published privacy policy, a hosted MCP server. **No fee statement was found**; monetisation limited to physical goods. This is **FUTURE** for TappyAI: it requires building and hosting an MCP server (new infrastructure) and is utility for existing ChatGPT users — classify ASSISTED at best, not built now.
  - **Custom GPTs:** creation requires a paid ChatGPT plan (no authoritative page fetched; treat as UNKNOWN/paid — not pursued).
- **Q3:** Controllable now: robots allows `OAI-SearchBot` (it does — `*` allow), public pages, `/about`, `/llms.txt`. **No submission mechanism** for websites ("there is no formal submission process" — inclusion is by crawl). GPTBot is training-only and not required for search.
- **Evidence:**
  | Source | URL | Type | Statement |
  |---|---|---|---|
  | OpenAI bots documentation | https://developers.openai.com/api/docs/bots | official | OAI-SearchBot purpose; opted-out sites not shown; GPTBot not required for search; ChatGPT-User "not used to determine whether content may appear in Search" |
  | OpenAI, "Introducing ChatGPT search" | https://openai.com/index/introducing-chatgpt-search/ (direct fetch returned 403; statements retrieved via search snippets on 2026-09-18) | official announcement | "third-party search providers"; "may share disassociated search queries with the Bing search engine"; "Any website or publisher can choose to appear in ChatGPT search" |
  | OpenAI Help, "Publishers and Developers – FAQ" | https://help.openai.com/en/articles/12627856-publishers-and-developers-faq (403 on direct fetch; via snippet) | official | "Any public website can appear in ChatGPT search… make sure you aren't blocking OAI-SearchBot" |
  | OpenAI, "Developers can now submit apps to ChatGPT" | https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/ | official | submission + in-product directory |
  | Apps SDK submission guidelines | https://developers.openai.com/apps-sdk/app-submission-guidelines | official | verified orgs; privacy policy; directory placement; physical goods only |

### 1.7 DeepSeek

- **Q1:** **UNKNOWN.** The consumer product exposes a "Search" toggle that retrieves web results and attaches citations (third-party descriptions only). **No authoritative evidence found** of: a named DeepSeek crawler, a robots.txt user agent, which index/provider powers the search, or any submission mechanism.
- **Q2:** Citation is observed by users when Search is on (third-party); recommendation is model output. Nothing controllable beyond being publicly crawlable and present in whatever third-party index it uses.
- **Q3:** Controllable: none specific. The only honest lever is being in the major indexes (Google/Bing) that a third-party search provider would draw from.
- **Evidence:** **No authoritative evidence found** (searched 2026-09-18 for official crawler/search documentation; only third-party guides exist).

### 1.8 Grok (xAI)

- **Q1:** **UNKNOWN / CONDITIONAL.** Grok answers draw on X posts and web search (DeepSearch mode). **No authoritative xAI crawler documentation, user agent or IP range was found**; third-party analyses report no self-announcing crawler. Therefore there is no robots-level control and no documented inclusion path.
- **Q2:** Citation observed in DeepSearch answers (third-party); recommendation is model output. X presence would be a signal *if* Grok weights X content — plausible from product design, **not documented**.
- **Q3:** Controllable: public crawlability; an official X account is an owner decision (then `sameAs`). No submission mechanism.
- **Evidence:** **No authoritative evidence found.**

### 1.9 Perplexity

- **Q1:** **YES (documented).** "PerplexityBot is designed to surface and link websites in search results on Perplexity"; the docs recommend allowing it in robots.txt "to ensure your site appears in search results". `Perplexity-User` fetches pages on user request and "generally ignores robots.txt".
- **Q2:** **Citation YES** (source cards are the product). **Recommendation:** model output. **Publishers' Program:** a revenue-share *partnership* for selected publishers — not an open submission mechanism and not a free discovery lever for a new site.
- **Q3:** Controllable: allow PerplexityBot (allowed under `*`), public pages. No submission mechanism.
- **Evidence:** https://docs.perplexity.ai/guides/bots (official). Program: https://www.perplexity.ai/hub/blog/introducing-the-perplexity-publishers-program (official; partnership).

### 1.10 Claude (claude.ai web search)

- **Q1:** **YES (documented).** `Claude-SearchBot` "navigates the web to improve search result quality for users"; disabling it "prevents our system from indexing your content for search optimization, which may reduce your site's visibility". `Claude-User` fetches on request; disabling it "may reduce your site's visibility for user-directed web search". `ClaudeBot` is training-only.
- **Q2:** Citation possible; recommendation is model output; no submission mechanism ("The documentation does not describe any automatic submission process").
- **Q3:** Controllable: allow the bots (allowed), public pages.
- **Evidence:** https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler (official).

### 1.11 Meta AI

- **Q1:** **CONDITIONAL.** `Meta-ExternalAgent` "crawls the web for use cases such as training foundation AI models or improving products by indexing content directly"; `Meta-ExternalFetcher` "fetches individual links at a user's request". No submission mechanism; no citation-reporting tool.
- **Evidence:** https://developers.facebook.com/docs/sharing/webmasters/web-crawlers (official).

### 1.12 Apple (Siri / Spotlight / Safari suggestions)

- **Q1:** **CONDITIONAL.** Applebot data "is used to power various features, such as the search technology integrated into… Spotlight, Siri, and Safari"; `Applebot-Extended` is the training opt-out. No submission (contact address only).
- **Evidence:** https://support.apple.com/en-us/119829 (official).

### 1.13 DuckDuckGo · Brave

- **DuckDuckGo:** results are "largely sourced from Bing" plus its own crawler/indexes → **Bing indexing (IndexNow) is the lever.** Evidence: https://duckduckgo.com/duckduckgo-help-pages/results/sources (official).
- **Brave Search:** fully independent index ("Every Web search result… is now served by Brave's own index"); pages enter via crawling and the opt-in Web Discovery Project in the Brave browser. No submission mechanism found. Evidence: https://brave.com/blog/search-independence/ (official).

### 1.14 Browser stores (extension distribution)

- **Chrome Web Store:** one-time developer registration fee (official page: "a one-time registration fee"; amount US$5 per secondary sources). Store discovery is search + categories, ranked by "a heuristic that takes into account ratings from users as well as usage statistics, such as the number of downloads vs. uninstalls"; keyword spam can suspend an item. Evidence: https://developer.chrome.com/docs/webstore/register , https://developer.chrome.com/docs/webstore/best-listing (official).
- **Edge Add-ons:** "There is no registration fee for submitting extensions to the Microsoft Edge program." Evidence: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account (official, 2025-12-12).
- **Firefox AMO:** free submission via the Developer Hub. Evidence: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ (official Mozilla).

### 1.15 Knowledge graph

- **Wikidata:** item requires "serious and publicly available references" or a sitelink — a startup with only its own site is **not eligible**. Do not create. Evidence: https://www.wikidata.org/wiki/Wikidata:Notability.
- **What is controllable:** one Organization node (built), `/about` (built), `sameAs` to owner-verified official profiles (env, built), consistent name/logo/description across `/`, `/about`, `/startup`, the extension listing, and any directory (kit prepared).

---

## 2. PART 1 — AI/Search Recommendation Evidence Matrix

Legend: **YES** = documented mechanism · **CONDITIONAL** = depends on indexing/other engine · **NO** = no mechanism · **UNKNOWN** = no authoritative evidence. "Cite" = link/attribute a TappyAI page. "Recommend" = name TappyAI as the tool to use (always a model output; never controllable).

| Platform | Search/crawl mechanism | Citation possible? | Product recommendation possible? | Direct submission mechanism? | Free controllable action | Evidence URL | Evidence strength |
|---|---|---|---|---|---|---|---|
| Google Search | Googlebot → index → rank | YES (as a result) | NO (ranks pages; does not "recommend") | Search Console URL request / sitemap (no guarantee) | crawlable pages, canonical, sitemap, structured data, entity page, earn links | developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl | strong (official) |
| Google AI Overviews | same index; "supporting links" | YES (conditional on indexing + snippet eligibility) | UNKNOWN (model output) | NO (no separate mechanism: "no additional technical requirements") | same as Search | developers.google.com/search/docs/appearance/ai-features | strong (official) |
| Google AI Mode | same as AI Overviews | YES (conditional) | UNKNOWN | NO | same | same | strong (official) |
| Gemini (app) | Google Search grounding (API-documented) | CONDITIONAL | UNKNOWN | NO | same as Google | ai.google.dev/gemini-api/docs/google-search | medium (API doc; consumer app not separately documented) |
| Bing | Bingbot → index; **IndexNow push** | YES (as a result) | NO | YES — IndexNow (built) + Webmaster Tools (owner) | IndexNow, sitemap, structured data | indexnow.org/documentation | strong (official) |
| Copilot | grounded on Bing index | YES — first-party citation report exists | UNKNOWN (model output) | via Bing (IndexNow / BWT) | IndexNow; verify in BWT to read AI Performance | blogs.bing.com/webmaster/February-2026/… | strong (official) |
| ChatGPT Search | OAI-SearchBot index + third-party providers (Bing) | YES ("Any website… can appear"; opted-out sites not shown) | NO mechanism for websites (model output); **Apps directory = separate, MCP-based, FUTURE** | NO for websites; YES for Apps (review, verified org, MCP server) | allow OAI-SearchBot (done), public pages, IndexNow (Bing path) | developers.openai.com/api/docs/bots ; openai.com/index/introducing-chatgpt-search | strong (official) |
| DeepSeek | UNKNOWN (Search toggle; provider undocumented) | UNKNOWN | UNKNOWN | NO (none found) | be in Google/Bing indexes | — | **No authoritative evidence found** |
| Grok | UNKNOWN (X + web; no documented crawler) | UNKNOWN | UNKNOWN | NO (none found) | public crawlability; official X account (owner) | — | **No authoritative evidence found** |
| Perplexity | PerplexityBot index | YES | UNKNOWN (model output); Publishers' Program = partnership, not open | NO | allow PerplexityBot (done), public pages | docs.perplexity.ai/guides/bots | strong (official) |
| Claude | Claude-SearchBot index + Claude-User fetch | YES | UNKNOWN | NO | allow bots (done), public pages | support.claude.com/en/articles/8896518 | strong (official) |
| Meta AI | Meta-ExternalAgent index + fetcher | CONDITIONAL | UNKNOWN | NO | public crawlability | developers.facebook.com/docs/sharing/webmasters/web-crawlers | strong (official) |
| Apple Siri/Spotlight/Safari | Applebot | CONDITIONAL | UNKNOWN | NO (contact only) | public crawlability | support.apple.com/en-us/119829 | strong (official) |
| DuckDuckGo | Bing + own | YES (via Bing) | NO | via IndexNow (Bing) | IndexNow | duckduckgo.com/duckduckgo-help-pages/results/sources | strong (official) |
| Brave Search | own index + Web Discovery Project | YES (as a result) | NO | NO | public crawlability | brave.com/blog/search-independence | strong (official) |

**The honest reading of the matrix:** every engine with documentation lets TappyAI be *discovered and cited* through ordinary crawling (all already allowed). **No engine offers a free, controllable mechanism that makes it "recommend TappyAI as a product."** The only submission-type mechanisms are (a) IndexNow for Bing-family indexing (built), (b) Search Console / Bing Webmaster Tools requests (owner), (c) ChatGPT Apps directory (a product surface that needs an MCP server — FUTURE).

---

## 3. PART 2 — Extension evidence

Complete path: **unaware person → (search / link / directory) → `/extension` or store listing → install → `/extension/welcome` → first use → TappyAI → useful result → share / signup / return.**

| Mechanism | Can reach unaware user? | Discovery path | Requires installation? | Free? | Implemented? | Evidence |
|---|---|---|---|---|---|---|
| `/extension` landing page indexed by Google/Bing | YES (search intent "Chrome extension to ask AI about selected text", "tiện ích kiểm tra link lừa đảo") | search → landing → store | to use: yes | yes | **YES** (page, metadata, SoftwareApplication JSON-LD, sitemap, IndexNow-eligible) | Google recrawl doc (discovery via sitemap); this repo |
| Chrome Web Store search/categories | YES (store users search) | store search → listing → install | yes | US$5 one-time (owner) | **prepared, not published** (`store/LISTING.md`) | developer.chrome.com/docs/webstore/register , …/best-listing |
| Edge Add-ons | YES | store search → install | yes | free | prepared, not published | learn.microsoft.com (no fee) |
| Firefox AMO | YES | AMO search → install | yes | free | manifest AMO-ready; prepared, not published | extensionworkshop.com |
| Store listing → Google Search (store pages are indexable) | YES | Google → store page | yes | free after listing | after publication | general (store pages are public HTML) |
| Links from `/about`, hubs, share pages to `/extension` | ASSISTED (needs a visitor first) | site → landing | yes | yes | **YES** (`/about` links; landing interlinked) | this repo |
| Share loop: an answer opened from the extension is shareable like any other | ASSISTED | extension user → `/r/*` → recipient | recipient: no | yes | YES (existing G1 loop) | this repo |
| Directory listings mentioning the extension | ASSISTED | directory → landing | yes | free tiers | kit prepared, not submitted | DIRECTORY_SUBMISSION_KIT.md |
| Extension install → first use measurement | measurement | `first_visit` on `/extension/welcome` → `query` with `browser_extension` | — | yes | **YES** (`growthMetrics.extension`) | this repo |

What the extension **cannot** do: reach anyone by itself. It is distribution that must be *found*; the landing page and the stores are how. Until the owner publishes, the chain stops at "prepared".

---

## 4. PART 3 — All free channels (complete inventory)

Classes: A TRUE · B ASSISTED · C RETENTION · D FUTURE/BLOCKED.

| Channel | Status | Class | Free? | Recurring cost | External dependency | Build status |
|---|---|---|---|---|---|---|
| Google Search (hubs, `/about`, `/scam-shield`, `/extension`, listed `/r/*`) | eligible; not indexed (not deployed) | A after indexing | yes | $0 | indexing, links | DONE (eligibility) |
| Google AI Overviews / AI Mode | eligible via Search | A after indexing | yes | $0 | indexing | DONE (eligibility) |
| Gemini | via Google index | A after indexing | yes | $0 | indexing | DONE (eligibility) |
| Bing (+ IndexNow) | eligible + push built | A after indexing | yes | $0 | `INDEXNOW_KEY`, BWT verify | **DONE (this phase)** |
| Copilot | via Bing | A after indexing | yes | $0 | Bing index | DONE (eligibility) |
| ChatGPT Search | OAI-SearchBot allowed; Bing path | A after crawl | yes | $0 | crawl | DONE (eligibility) |
| ChatGPT Apps directory | not built | D | unknown fee; needs MCP server (infra) | >$0 | OpenAI review | NOT BUILT (FUTURE) |
| Perplexity / Claude / Meta AI / Apple | bots allowed | A after crawl | yes | $0 | crawl | DONE (eligibility) |
| DeepSeek / Grok | undocumented | UNKNOWN | — | $0 | — | nothing controllable |
| DuckDuckGo / Brave | via Bing / own crawl | A after indexing | yes | $0 | — | DONE (eligibility) |
| Browser extension — landing page | built | B | yes | $0 | indexing | **DONE (this phase)** |
| Browser extension — Chrome/Edge/Firefox stores | prepared | B | $5 one-time (Chrome), free (Edge, AMO) | $0 | owner publication | PREPARED |
| Browser extension — install→first-use measurement | built | measurement | yes | $0 | — | **DONE (this phase)** |
| OpenSearch address-bar engine | built | C | yes | $0 | visitor once | **DONE (this phase)** |
| Atom feed of public results | built | B | yes | $0 | aggregators | **DONE (this phase)** |
| `/llms.txt` | built (prev. phase) | B (convention) | yes | $0 | — | DONE |
| PWA shortcuts / Web Share Target | built | C | yes | $0 | install | DONE |
| Android Process Text / Direct Share | built | C | yes | $0 | install | DONE |
| Android App Links `/r/*` | server + native alias/Custom Tab prepared, OFF by default | D | yes | $0 | cert SHA-256 + build flag + device verification | PREPARED |
| Android widget / Quick Settings tile | not built | C | yes | $0 | — | NOT BUILT (retention only; deprioritised) |
| iOS App Clip / Universal Links / Share Extension / App Intents / Siri | doc-only | D | Apple dev fee | >$0 | macOS + Apple account | BLOCKED (no Mac) |
| Share-out loop (web + Android) + N-generation | built | A for recipient | yes | $0 | real users | DONE |
| QR / POS | built | B | yes (printing = owner) | $0 | placement | DONE |
| Social organic (Facebook/Messenger/Zalo/TikTok/Telegram/X/Reddit/YouTube) | OG cards + share targets exist | B (needs a sharer) | yes | $0 | people | DONE (technical); content is not code |
| Social search (TikTok/YouTube/Instagram in-app search) | not a technical channel | D/manual | — | — | content creation | NOT APPLICABLE to this repo |
| Directories (Product Hunt, AlternativeTo, Crunchbase, LinkedIn, GitHub…) | kit prepared | B | free tiers | $0 | owner submission | PREPARED |
| Wikidata / Google Business Profile | not eligible | — | — | — | — | NOT ELIGIBLE (documented) |
| Zalo Mini App · TGDĐ · Ads | — | — | — | — | — | EXCLUDED by rule |

---

## 5. PART 4 — What we can control

**DIRECTLY CONTROLLABLE NOW (all done):** public pages and their text; canonicals; robots; sitemap; structured data (WebSite, Organization `@id`, AboutPage, BreadcrumbList, FAQPage, QAPage, SoftwareApplication); crawler access for every documented bot; entity page `/about`; `sameAs` (when owner supplies profiles); extension code, manifest, permissions, landing, privacy page, welcome flow; IndexNow push; OpenSearch; Atom feed; share flow and ancestry; attribution sources; deep links; content architecture (five hubs, no thin pages).

**REQUIRES EXTERNAL INDEXING (not controllable, only enabled):** Google indexing and ranking; AI Overviews/AI Mode supporting links; Bing indexing (accelerated by IndexNow); OAI-SearchBot / PerplexityBot / Claude-SearchBot crawls; any citation.

**REQUIRES STORE / PUBLISH (owner):** Chrome Web Store (US$5), Edge Add-ons (free), Firefox AMO (free); Google Play / App Store (separate decision); directory profiles; official social profiles (then `ORGANIZATION_SAME_AS`).

**REQUIRES PRODUCTION (after next week):** actual appearance in any engine; organic traffic; the share loop running; conversion; the 35-query validation; Search Console / Bing Webmaster Tools data; the AI Performance citation report.

---

## 6. PART 5 — Validation plan

See `AI_SEARCH_VALIDATION_PLAN.md`: 35 queries (30 non-brand across food / shopping / travel / entertainment / spa / scam / product / extension intents, in vi and en; 5 branded controls), 9 platforms, pre-registered classification (`NOT_PRESENT / DISCOVERY / CITATION / SOURCE / RECOMMENDATION / BRAND_ONLY`), capture protocol, thresholds at T+7/14/30, and the attribution cross-check against `firstQueriesBySource`.

---

## 7. PART 6 — Honest conclusion

**1. How can an unaware user discover TappyAI for free?**
Through four real paths, none of which is "on" yet: (a) a search result or an AI answer citing a TappyAI page after indexing; (b) a link someone shares (`/r/*`, a hub, `/scam-shield`, `/extension`) — the only path that works the day the RC ships; (c) a store listing (extension; later apps) once published; (d) a directory or community post the owner makes. Everything else in this repo (extension, shortcuts, Process Text, OpenSearch, feeds) serves people who already arrived.

**2. How can Google discover TappyAI?** Googlebot crawling links and the sitemap; Search Console requests. All pages are eligible today; indexing takes days to weeks and is not guaranteed. Reputation (links/mentions) is a documented quality input TappyAI does not yet have.

**3. ChatGPT?** OAI-SearchBot crawling (allowed) and Bing's index (IndexNow built). Documented: "Any website… can appear in ChatGPT search." Recommendation as a product: no mechanism; the Apps directory is a separate, MCP-based product surface (FUTURE).

**4. DeepSeek?** No authoritative mechanism is documented. The only lever is presence in the major indexes its search provider draws from.

**5. Grok?** No authoritative crawler or submission documentation. Public crawlability and, if the owner chooses, an official X presence.

**6. Gemini?** Google Search grounding → the same index as Google Search.

**7. Perplexity?** PerplexityBot (allowed); citations are the product; the Publishers' Program is a partnership, not a lever.

**8. Bing / Copilot?** Bingbot + **IndexNow (built)** + Bing Webmaster Tools (owner); Copilot is grounded on Bing and Microsoft provides a first-party citation report.

**9. Can any of them directly "recommend TappyAI" through a free controllable mechanism?** **No.** Not one engine documents a mechanism by which a site owner causes a product recommendation.

**10. If yes, mechanism and evidence?** Not applicable — see the matrix; every "recommend" cell is UNKNOWN or NO.

**11. Closest controllable mechanism?** Be the page that *is* the answer: an indexed, entity-consistent page whose content matches the query — hubs for intents, `/about` for "what is TappyAI", `/scam-shield` for scam checks, `/extension` for the extension, listed `/r/*` for specific questions — plus fast Bing indexing (IndexNow) and, over time, third-party mentions. Google's own words: prominent sites linking "is generally a good sign that the information is trustworthy."

**12. How does the browser extension acquire its first users?** It does not acquire anyone by itself. First users come from (a) existing TappyAI users who meet `/extension` (linked from `/about`), (b) store search once published, (c) search engines finding `/extension`, (d) a launch post. The install signal is measured (`/extension/welcome` → first query) without any telemetry in the extension.

**13. What free technical acquisition channels are still missing?**
- Store publication (extension) — owner, US$5 for Chrome.
- Search Console + Bing Webmaster Tools verification and sitemap submission — owner, after deploy.
- `INDEXNOW_KEY` and `ORGANIZATION_SAME_AS` values — owner.
- Official social profiles and 2–3 directory listings — owner.
- A crawlable Home footer linking hubs/About/extension — owner UI decision (Home is locked).
- ChatGPT Apps (MCP server) — FUTURE; new infrastructure.
- Android App Links and any iOS surface — FUTURE.

**14. Which missing channels should be built before next week's release?** Everything free and code-side is built. What remains before release is configuration and owner action, in this order: (1) deploy → Search Console + Bing Webmaster Tools + sitemap; (2) set `INDEXNOW_KEY`; (3) submit the extension to Edge (free) and Chrome ($5) with `store/LISTING.md`; (4) create the LinkedIn company page + Crunchbase profile and set `ORGANIZATION_SAME_AS`; (5) decide on the Home footer row. Then run `AI_SEARCH_VALIDATION_PLAN.md` at T+7.

---

## 8. Answer-engine optimisation — evidence model (Part of §20)

| Claim | Evidence | Confidence |
|---|---|---|
| A page must be indexed and snippet-eligible to be a supporting link in AI Overviews/AI Mode | Google AI features doc (official) | **Proven** |
| No special optimisation is needed for AI Overviews/AI Mode | same | **Proven** |
| Allowing OAI-SearchBot is required to appear in ChatGPT search answers | OpenAI bots doc (official) | **Proven** |
| ChatGPT search draws on Bing as a provider | OpenAI announcement (official) | **Proven** |
| IndexNow submissions propagate to Bing/Yandex/Naver/Seznam/Yep | indexnow.org (protocol owner) | **Proven** |
| Copilot citations are measurable per site in Bing Webmaster Tools | Bing blog 2026-02 (official) | **Proven** |
| Links/mentions from prominent sites are a quality input for Google | Google "How Search Works" (official) | **Proven** (direction, not magnitude) |
| Structured data (Organization/AboutPage) improves entity recognition by AI engines | schema.org semantics + Google entity use in Search; no engine documents an AI-citation effect | **Industry hypothesis** — implemented because it is free, harmless and standards-based |
| `llms.txt` is read by AI engines | no engine documents reading it | **Industry hypothesis** — implemented at $0, no claims |
| "GEO" content tactics (FAQ blocks, "answer-first" paragraphs) increase AI citations | SEO blogs only | **SEO folklore** — not implemented as a tactic; hubs' FAQs exist because they are real questions |
| Being on X boosts Grok | product design inference; no documentation | **Hypothesis** |

---

## 9. Cost, tests, constraints

- **Cost:** every mechanism in §0 is $0 recurring; IndexNow is a free protocol with no account; OpenSearch/feed/pages are bytes; the extension makes no network calls; the only money anywhere is the one-time Chrome Web Store fee (owner, optional — Edge and Firefox are free).
- **Tests added this phase:** `indexNow.test.ts` (5), `browserFeeds.test.ts` (6, incl. `sameAs`), `extensionAcquisition.test.tsx` (11), `growthMetrics.test.ts` (+1 extension metric), `analytics-contract.test.ts` (15 sources). **Results:** web 13,632 pass / 0 fail / 68 skipped (718 files; +23 tests over `19569f1`), 48/48 required suites; Android 742 / 0 (unchanged); tsc 0; lint 0 errors (42 warnings = baseline); architecture 14/14; sql-grants 0 errors.
- **Constraints honoured:** no deploy, no push, no production migration, no store publication, no external submission, no Zalo, no TGDĐ, no ads, no real users, no paid API/SaaS/LLM, extension permission model unchanged (`activeTab`, `contextMenus`, `storage`), privacy not weakened (welcome page adds no telemetry; IndexNow sends only public listed URLs).
