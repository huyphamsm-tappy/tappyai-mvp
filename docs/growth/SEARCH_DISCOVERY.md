# TappyAI — Google Search & AI Search discovery (technical audit + what was built)

**Date:** 2026-09-18 · **Branch:** `feat/g1-completion` (from `rc/web-uat @ b0896e7`) · **Status:** code built and tested; **not deployed, not indexed, no appearance claimed**.

This document is the audit the G1 completion task asked for: what a crawler and an answer engine actually receive from TappyAI today, what was wrong, what was fixed, and what is deliberately not done. Every "fixed" row is pinned by `src/lib/discovery/seoSurfaces.test.tsx` or `src/lib/discovery/llmsTxt.test.ts`.

## 1. Public crawlable surface (after this phase)

| URL | Rendered | Canonical | Index | Structured data | In sitemap | Notes |
|---|---|---|---|---|---|---|
| `/` | SSR (dynamic: session-aware) | **`/` (new)** | index | WebSite+SearchAction, **Organization (shared @id)** | yes (1.0) | Home. Canonical was missing: `/?src=qr_pos`, `/?src=share_out` were candidate duplicates. |
| `/food /shopping /travel /entertainment /spa` | SSG + ISR 1h, `dynamicParams=false` | own | index | FAQPage ×2 (vi/en), **BreadcrumbList (new)** | yes (0.8) | The intent templates. Five, not fifty. |
| `/r/<slug>` (listed) | ISR 1h | own | index | QAPage, **BreadcrumbList Home › hub › result (new)** | yes (≤2000 newest, 0.6) | Frozen answer; no LLM by import-graph guard. |
| `/r/<slug>` (anonymous-owned) | ISR | own | **noindex**, follow | QAPage | **no** | Second-generation shares cannot mint search surface. Unchanged. |
| `/scam-shield` | SSR shell + client | **own (new)** | index (new) | **BreadcrumbList (new)** | yes (0.8) | Highest-intent public entry. Had NO metadata before this phase — title, snippet and share card were the site fallback. |
| `/about` **(new)** | SSR (client-reconciled locale) | own | index | **AboutPage + Organization + BreadcrumbList** | yes (0.8) | The entity/identity layer. |
| `/startup` | SSR | own (pre-existing) | index | Organization → **now the shared node** | **yes (new)** | Was indexable but orphaned from the sitemap and carried a second, different Organization. |
| `/how-to-use /privacy /terms` | SSR | own | index | — | yes | Unchanged. |
| `/llms.txt` **(new)** | static route | n/a | n/a | n/a | no | Plain-text public-page index (llmstxt.org shape). |
| `/robots.txt`, `/sitemap.xml` | generated | — | — | — | — | `+ /age-check, /controller` disallowed. |

Disallowed for crawlers (unchanged + 2): `/api/ /admin /chat /profile /messages /auth/ /login /register /onboarding /access-denied /delete-account /share-target /age-check /controller`. Robots is a crawl policy, not a security boundary — every private route still answers 401/403 itself.

## 2. Audit findings and disposition

| # | Finding | Severity | Disposition |
|---|---|---|---|
| S1 | Home had no `rel=canonical`; every attributed entry (`?src=…`) was a duplicate candidate. | High | **Fixed** — `(home)/page.tsx` declares `canonical: /`. Deliberately on the page, not the root layout (a layout canonical would be inherited by `/chat`, `/profile`, …). |
| S2 | `/scam-shield` had no title/description/canonical/OG. | High | **Fixed** — metadata from `ROUTE_TITLES` + dictionary; canonical is the bare path so `?url=` deep links collapse to it. |
| S3 | Two Organization definitions (`/` via `BRAND`, `/startup` via `landing/config`) with different fields. | Medium (entity) | **Fixed** — one `organizationJsonLd()` with `@id = https://www.tappyai.com/#organization`; `/`, `/about`, `/startup` all emit it; WebSite `publisher` points at it. |
| S4 | No entity page: nothing states plainly what TappyAI is, does, and who makes it. | Medium (AI search) | **Fixed** — `/about` (`about.*` dictionary, vi+en). |
| S5 | No BreadcrumbList anywhere; hubs and results had no explicit depth signal. | Low–Medium | **Fixed** — hubs (Home › hub), listed results (Home › hub › result), Scam Shield, About. |
| S6 | `/startup` indexable but not in the sitemap (orphan for discovery). | Low | **Fixed** — added. |
| S7 | `/age-check`, `/controller` crawlable. | Low | **Fixed** — disallowed. |
| S8 | **hreflang / EN–VI.** | — | **Not applicable, documented.** There are no per-language URLs: SSR is the product locale (vi) for everyone and the client reconciles to the stored locale (`layout.tsx` / `HtmlLangSync`). `hreflang` requires distinct URLs per language; emitting `hreflang="en"` pointing at the same URL is wrong and Google ignores it. What IS declared: `inLanguage: ['vi','en']` on WebSite/AboutPage, FAQPage in both languages on hubs, `og:locale:alternate en_US` on `/about` and `/startup`. A real EN/VI URL split (`/en/food`) is a routing/i18n architecture change, not an SEO fix — FUTURE. |
| S9 | Thin / mass pages | — | **None created, none exist.** Five hub templates + one Scam Shield + one About. No location pages, no generated "best X in Y" pages. `/r/*` is user-created, frozen, capped in the sitemap, and anonymous-owned pages are noindex. |
| S10 | Duplicate content | — | `/r/<slug>` vs `/plan/<shareId>` are different systems with different content (documented for post-UAT consolidation in the RC report). Not a duplicate. |
| S11 | Crawl depth / orphan risk | Medium | **PARTIAL.** Hubs, `/about`, results and Scam Shield are fully interlinked (hub nav on every hub and About, About → every hub + Scam Shield + legal + story, result → its hub, hub → `/about` (new)), so within the discovery cluster depth is ≤ 2. **But the Home page (`/`) carries no HTML link to a hub or to `/about`** — they are reachable from the root only through `sitemap.xml`. Home is the owner-locked V3 surface (`a9d0afa`) and its shell nav is a pinned contract, so a crawlable footer row (hubs · About · Scam Shield · legal) is recorded as an owner UI decision, not added here. |
| S12 | SSR | — | Every public page above server-renders its full text (verified by the render tests in vi, reconciled to en). |
| S13 | OG images | — | All public pages use `brandedOgImage()` or the per-share card; every OG URL is absolute https. Unchanged. |
| S14 | `noindex` correctness | — | Private metadata builder is index:false/follow:false; anonymous shares index:false/follow:true; invalid slug 404 + noindex. Unchanged. |
| S15 | Search → Tappy without forced signup | — | Hub example → `/chat?q=` (anonymous, `ANON_LIFETIME_LIMIT`); `/r/*` follow-up (capped); `/scam-shield` (anonymous); About CTA → `/chat`. No login wall on any indexable page. Unchanged and verified. |
| S16 | Public views are LLM-free | — | `publicResultNoLlm.test.ts` import-graph guard covers `/r/*` and `lib/share`; `/about`, hubs, `/llms.txt` import only dictionary/constants. |

## 3. AI search readiness — per engine, honestly

What each engine needs, what TappyAI provides, and what cannot be claimed.

| Engine | What it consumes | TappyAI provides | Not provided / not claimable |
|---|---|---|---|
| **Google AI Overviews / AI Mode** | Google's index + structured data + entity graph. Same crawler (`Googlebot`); `Google-Extended` controls Gemini training only, not Overviews. | Everything in §1; Organization entity with `@id`; FAQPage on hubs; QAPage on results; SearchAction. Robots allows `*`. | Appearance. An Overview click carries the same `google.com` referrer as a blue link — **there is no `google_ai` source** because it would be a guess. Attribution stays `geo_google`. |
| **ChatGPT Search** | `OAI-SearchBot` (search) + Bing's index. `GPTBot` is training and is separate. | Robots allows all user agents; `/llms.txt`; `/about`. Referrer `chatgpt.com` → `geo_chatgpt`. | Appearance. No "GEO API" exists or is faked. |
| **Bing / Copilot** | `bingbot`; Copilot answers from Bing. | Same crawlable surface; **`bing_search` is now its own source** (bing.com referrer), `copilot.microsoft.com` → `geo_chatgpt` (AI-answer class). | Bing Webmaster Tools submission / IndexNow — an owner action with credentials, not code. |
| **Perplexity / Claude / Gemini** | own crawlers; referrers `perplexity.ai`, `claude.ai`, `gemini.google.com`. | Allowed; attributed `geo_chatgpt`. | Appearance. |

`/llms.txt` is a convention (llmstxt.org), not a contract with any engine. It is included because it is free, deterministic, built from the same dictionary as the pages, and cannot disagree with them. Its test asserts it lists only allowed public pages and no query strings.

## 4. Attribution sources touched

`ANALYTICS_SOURCES` gained `browser_extension`, `bing_search`, `pwa_shortcut` — each set by a real mechanism (`?src=` from the extension / PWA shortcut; bing.com referrer). NOT added: `google_ai` (indistinguishable), `android_deep_link`, `ios_app_clip`, `ios_share` (the native apps emit no G1 events; adding a value nothing emits would be a lie in the report).

`computeGrowthMetrics().acquisition.firstQueriesBySource` now reports first queries per source, so "did search / the extension / the shortcut bring anyone who asked?" is a number, not a story.

## 5. What remains an owner action (no code can do it)

- Deploy; then Google Search Console + Bing Webmaster Tools verification and sitemap submission.
- Apply the G1 migrations (`20260913_g1_growth_foundation.sql`, `20260918_g1b_share_ancestry.sql`) so `/r/*` exists in production.
- Decide whether TappyAI has official social profiles to list as `sameAs` (none listed: none verified).
- An EN/VI URL split, if ever wanted (S8).
