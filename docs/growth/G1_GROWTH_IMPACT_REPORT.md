# G1 Growth Hacking — Implementation Impact Report

**Scope:** what the committed G1 implementation (`feat/g1-growth` @ `47f2d5e`, rebased on `1ec07bb`) actually does for acquiring, exposing, activating, retaining or multiplying users who do not already know Tappy.
**Method:** every claim below is read from the committed code, routes, schema, tests and docs. Nothing planned or documented-only is counted as implemented.
**Date:** 2026-09-18 · **Status of G1:** Implemented → Verified → Committed → Awaiting Owner Review. Not deployed; migration not applied; **no real traffic has passed through any of it.**

---

## 1. Growth-function legend

A Discovery · B Acquisition · C Activation · D Viral/Referral loop · E Retention/Re-entry · F Measurement · G Cost protection

## 2. Component table

| Component | Actual implementation | Growth function | Who discovers Tappy? | How does a new person encounter it? | Friction | Viral potential | Operating cost | Evidence |
|---|---|---|---|---|---|---|---|---|
| **Share button → preview → public link** (share-out mechanism) | Share icon on an assistant turn opens `SharePreviewDialog`; server builds the sanitized payload (`POST /api/shared-results/preview`), user edits title, confirms (`POST /api/shared-results`), then the existing `ShareMenu` hands the `/r/<slug>` URL to Facebook / Zalo / copy / OS share sheet. | **D** (engine), C | Contacts of an existing **signed-in** Tappy user. | They receive a link in Zalo/Messenger/FB/anywhere the sharer pastes it. | Sharer must have a real account — anonymous sessions are refused (`refuseAnonymousSocialWrite`). Two clicks (share → confirm). Web only; the Android app has no share-out of public results. | The one true multiplier in G1: each share can reach many recipients, each recipient can share again from `/r/<slug>`. | 2 route calls, 1 RLS read, 1 INSERT. **0 LLM.** | `src/components/chat/MessageActionBar.tsx`, `src/components/share/SharePreviewDialog.tsx`, `src/app/api/shared-results/route.ts`, `preview/route.ts`, `src/lib/share/shareTargets.ts` |
| **`/r/[slug]` public result page** (growth surface) | Server-rendered, ISR 1 h, renders only the frozen payload; full answer visible, no teaser/paywall; "Mở TappyAI" CTA → `/?src=share_out`; share button; follow-up box. | **B, C, D** | A recipient of a shared link; a search/AI-engine user if the page is indexed. | Opens the link on any browser; nothing to install. | None to read. Login not required. | Carries its own share button → second-generation shares. | ~0 DB reads per view after first (ISR). **0 LLM.** | `src/app/r/[slug]/page.tsx` (`revalidate = 3600`), `PublicResultView.tsx`, `PublicResultClient.tsx`, guard `src/lib/share/publicResultNoLlm.test.ts` |
| **Frozen shared payload** (`shared_results` + sanitizer) | Immutable sanitized snapshot written once at share time; owner can withdraw; payload column not updatable even by owner. | Infrastructure (enables B/D at $0; G) | — (does not reach anyone by itself) | — | — | None by itself. | One row ≤ 64 KB, typically 3–10 KB. | `supabase/migrations/20260913_g1_growth_foundation.sql`, `src/lib/share/publicSanitizer.ts`, `sharedResultStore.ts` |
| **OG / social card** | `/r/<slug>/og.png?v=N`, edge-rendered 1200×630 from the frozen payload, ≤3 images inlined, immutable cache per version; metadata + QAPage JSON-LD. | **A, D** (distribution enhancement) | The same recipients — the card is what makes the link look like content in a chat/feed. | As a rich preview in Zalo/Messenger/Facebook before any click. | None. | Raises click-through of every share; does not create shares. | Rendered once per (slug, version); platform-cached. **0 LLM, no image-gen API.** | `src/app/r/[slug]/og.png/route.tsx`, `src/lib/share/sharedResultMetadata.ts` |
| **Anonymous follow-up on `/r/[slug]`** ("Hỏi Tappy câu khác…") | Inline ask box using the existing `/api/chat` with `shareSlug`; mints a Supabase anonymous session; server adds the public context line; soft signup nudge after 3 asks (`ANON_SOFT_SIGNUP_GATE_AFTER`), hard stop from the existing `ANON_DAILY_LIMIT=5` and a per-share cap of 3/identity/day. | **C** (activation of a new visitor), B | Recipient of a share. | The box sits under the answer they just read. | No install, no signup for the first asks; then a soft nudge, then the existing quota wall. | Indirect: a follow-up answer can itself be shared **only after signup** (share requires a real account). | **LLM cost — bounded**: ≤ min(5, 3) calls/identity/day/share via the existing pipeline. | `src/app/r/[slug]/PublicResultClient.tsx`, `src/lib/share/followUpGuard.ts`, `src/app/api/chat/route.ts` (`guardShareFollowUp`, `shareContextBlock`) |
| **GEO public hubs** `/food` `/shopping` `/travel` `/entertainment` `/spa` | Static ISR pages with vi/en dictionary copy, 4 example questions linking into `/chat?category=…&q=…`, FAQPage JSON-LD in both languages, list of newest public shares, canonical URLs. | **A, B** (potential), C | Search engine / AI answer-engine users — **only once indexed**. | Organic search result or AI citation → hub → one tap into chat (anonymous tier). | None to read; chat is open to anonymous visitors. | None directly; links to `/r/<slug>` pages that carry share buttons. | 1 indexed read per hour. **0 LLM.** | `src/app/(discovery)/[domain]/page.tsx`, `HubBody.tsx`, `src/lib/i18n/discovery.ts` |
| **robots.ts + sitemap.ts** | Allow public surfaces, disallow private; sitemap lists home, hubs, legal pages and up to 2,000 newest `/r/<slug>` pages. | **A** (enabler) | Crawlers. | Crawl → index → search/AI answer. | — | — | Negligible. | `src/app/robots.ts`, `src/app/sitemap.ts` |
| **GEO referrer attribution** | Landing from google/bing/… → `geo_google`; from chatgpt/perplexity/… → `geo_chatgpt`. | **F** | — | — | — | — | $0 | `src/lib/analytics/attribution.ts` (`sourceFromReferrer`) |
| **Web Share Target** | PWA manifest `share_target` (GET) → `/share-target` → attribution `web_share_target` → `/chat?q=<prompt>`. | **E** (re-entry), C | Nobody new: requires the PWA already installed. | An installed user shares a link/text from another app into Tappy. | Requires installed PWA; the shared item becomes an auto-sent question. | None. | 0 until the user's own query. | `public/manifest.json`, `src/app/share-target/page.tsx`, `src/lib/growth/shareTarget.ts` |
| **Android Direct Share (inbound)** | `ACTION_SEND text/plain` intent filter → `IncomingShareParser` → `HomeRoute.Chat(prefill)` (auto-sends). | **E**, C | Nobody new: requires the app installed. | An installed user picks Tappy in another app's share sheet. | Requires install; text/link only; no image share. | None (inbound only). Android has **no** outbound public-result share. | 0 until the query. | `android/.../navigation/IncomingShareParser.kt`, `MainActivity.kt`, `AndroidManifest.xml` |
| **QR / POS entry** | `GET /api/qr/entry?path=/food` renders an SVG QR whose URL carries `?src=qr_pos`; allow-listed to `/` and the 5 hubs. | **A, B** (conditional) | Anyone who scans a printed QR — **if someone prints and places one**. | Physical poster/table card → hub or home → chat. | Requires a physical placement that does not exist yet. | None directly. | $0 (SVG computed, cached 7 d). | `src/lib/growth/qrEntry.ts`, `src/app/api/qr/entry/route.ts` |
| **Zalo Mini App boundary** | Deep-link builder (inert until `NEXT_PUBLIC_ZALO_MINI_APP_ID`), public JSON `GET /api/shared-results/<slug>`, `POST /api/zalo/mini/verify` issuing a signed rate-limit cookie, per-Zalo-identity chat cap, in-Zalo-browser UA → `zalo_link`. | **G** now; **B/D potential** only after registration | Nobody today: no Mini App exists. | — (would be: a share opened inside Zalo without leaving Zalo). | Platform registration + review required. | Potential only. | $0 today. | `src/lib/zalo/miniApp.ts`, `identity.ts`, `src/app/api/zalo/mini/verify/route.ts`, `docs/growth/ZALO_MINI_APP.md` |
| **Analytics contract + anon_id + attribution + 7 events** | `first_visit, query, result_action, share_created, share_viewed, signup, return`; 11 sources; one persistent `anon_id` (+ cookie mirror); session + first-touch attribution; share_id bridge; anon→user stitching. | **F** | — | — | — | — | Rows in the existing `user_events`. | `src/lib/analytics/*`, `src/app/api/track/route.ts` |
| **Growth metrics + gates + admin endpoint** | Pure `computeGrowthMetrics` (activation, D7 day 5–9, share rate, views/share, viewer→query, viewer→signup, k-factor, result-action rate, outbound bookings, Gate 0/1/2 verdicts) + `GET /api/admin/analytics/growth`. | **F** | — | — | — | — | Admin-only bounded read. | `src/lib/analytics/growthMetrics.ts`, `growthReportService.ts`, `src/app/api/admin/analytics/growth/route.ts` |
| **Rate limits & caps** (share creation 20/identity/day + 60/IP/day; follow-up 3/identity/share/day; Zalo cap; existing chat IP flood guard) | Server-side, Upstash-backed when configured. | **G** | — | — | — | — | Existing infra. | `src/lib/config/product.ts`, `src/app/api/shared-results/route.ts`, `followUpGuard.ts` |
| **Wedge (Scam Check / Price Check)** | **Not implemented in G1.** Only the `wedge_scam` source enum exists; nothing emits it and no wedge surface was built or instrumented. | — | — | — | — | — | — | `src/lib/analytics/analytics-contract.ts` only |

**Components that do not create growth by themselves:** frozen payload/table, sanitizer, slug generator, rate limits, analytics contract, anon_id, attribution, growth metrics, robots/sitemap, Zalo boundary (today). They are infrastructure that makes the mechanisms above safe, cheap or measurable.

## 3. Growth engine vs growth infrastructure

| Growth engine / surface (creates or carries exposure) | Growth infrastructure (enables, measures, protects) |
|---|---|
| Share button + preview + ShareMenu handoff (engine) | `shared_results` table, sanitizer, validator, slug |
| `/r/[slug]` page (surface) | ISR/cache, `sharedResultStore` |
| OG card (distribution enhancement) | `sharedResultMetadata`, edge route |
| Anonymous follow-up box (activation engine on the surface) | `followUpGuard`, anonymous session mint, caps |
| GEO hubs (surface, conditional on indexing) | robots, sitemap, hub dictionary, JSON-LD |
| QR entry (surface, conditional on physical placement) | QR generator, allow-list |
| Web Share Target / Android Direct Share (re-entry surfaces) | manifest entry, intent filter, parsers |
| — | anon_id, attribution, 7 events, stitching, metrics, gates, admin endpoint |
| — | Zalo identity cookie, verify route, Mini App link builder (inert) |

## 4. The loops that actually exist

### Loop 1 — Share-out (implemented end-to-end)
```text
Signed-in web user → useful result → Share → preview/confirm → /r/<slug> (+ OG card)
   → recipient opens link (no install, no signup) → reads full answer
   → result_action (maps / booking / tiktok / share / follow-up)
   → asks follow-up (anonymous session, capped) → soft signup nudge → signup
   → (after signup) can share their own results → new /r/<slug> → …
```
1. New person from: the sharer's Zalo/Messenger/Facebook contacts or any pasted link.
2. Sees: the full frozen answer, images, outbound buttons, suggested questions, a share button, "Mở TappyAI".
3. Install: **no**. 4. Sign up: **no** to read and to ask the first follow-ups; **yes** to share onward and to pass the quota wall.
5. Returns to Tappy: yes — `/?src=share_out`, `/chat` via follow-up, `/login` from the gate.
6. Measurable: yes — `share_created` → `share_viewed` (deduped per share/viewer) → `query`/`result_action` (`share_id` carried) → `signup` (`first_share_id`).
7. Second share opportunity: yes on the page itself (`result_action: share` → ShareMenu), and yes after signup from the new user's own chat.
8. Cost: page and card **0 LLM**; follow-ups bounded by existing quota + per-share cap.
**Missing link:** the recipient cannot *create* a new public share without a real account — the second generation of the loop requires signup (anonymous sessions are refused by `refuseAnonymousSocialWrite`). Android users cannot start the loop at all (no outbound share of public results in the app).

### Loop 2 — GEO discovery (implemented on Tappy's side; the other half is external)
```text
Crawler → sitemap → /food … /spa and /r/<slug> → indexed/cited → searcher lands (geo_google / geo_chatgpt)
   → hub example → /chat (anonymous) → result → (signup) → share → Loop 1
```
1. From: Google/Bing/AI answer engines. 2. Sees: hub copy + example questions + newest public results, or a public result page. 3. Install: no. 4. Sign up: no to ask. 5. Returns: yes (links into chat). 6. Measurable: yes (referrer attribution). 7. Creates a share: only after signup. 8. Cost: 0 LLM until the visitor asks.
**Missing link:** indexing itself — no page is live, nothing is indexed, and there is no evidence yet that any engine will surface these pages. Loop 2 has zero validated inbound traffic.

### Loop 3 — Re-entry (implemented; not an acquisition loop)
```text
Installed user (PWA or Android) → other app → Share → Tappy → /chat with the content as a question → result → Loop 1
```
Reaches no unaware person; it increases usage frequency of existing users and feeds Loop 1.

### Loop 4 — QR / POS (implemented technically; no placement)
```text
Printed QR (?src=qr_pos) → hub/home → /chat → … → Loop 1
```
Reaches unaware people **only if** a QR is physically placed somewhere; nothing in G1 places one.

### Loop 5 — Zalo Mini App (boundary only; loop does not exist yet)
No Mini App is registered or built; today a Zalo recipient experiences Loop 1 through Zalo's in-app browser (attributed `zalo_link`).

## 5. Zero-awareness test

| Surface | Reaches someone who has never heard of Tappy? | Why |
|---|---|---|
| Share-out → `/r/[slug]` + OG card | **YES** | A recipient in a Zalo/Messenger/Facebook thread needs no prior knowledge, no install and no account to open and read it. |
| Anonymous follow-up on `/r/[slug]` | **CONDITIONALLY** | It reaches only someone who already arrived on a public result page; it converts the unaware into a first query rather than finding them. |
| GEO hubs + sitemap + robots | **CONDITIONALLY** | Reaches unaware searchers only after engines index and rank the pages — nothing is live or indexed yet. |
| QR / POS entry | **CONDITIONALLY** | Reaches passers-by only once someone prints and places a code; G1 only renders the SVG. |
| Web Share Target | **NO** | Requires the PWA to be installed first. |
| Android Direct Share | **NO** | Requires the app to be installed first; inbound only. |
| Zalo Mini App boundary | **NO** (today) | No Mini App exists; the link builder is inert without an app id. |
| Analytics / attribution / metrics | **NO** | Measurement only. |
| Wedge (scam/price) | **NO** | Not implemented. |

## 6. Cost test (verified from implementation)

| Mechanism | LLM | API | Cloud/infra | Storage | Class |
|---|---|---|---|---|---|
| Public `/r/[slug]` view | **none** — page imports only the store; guard test forbids AI imports (`publicResultNoLlm.test.ts`) | none | ISR 1 h → ~0 origin work per view | none | **$0** per view |
| OG image | none | none (fetches the payload's own image URLs once per version) | one edge render per (slug, og_version), immutable cache | none | Negligible |
| GEO crawler traffic (hubs, sitemap, `/r/*`) | none | none | ISR; sitemap 1 read/hour | none | Negligible |
| Anonymous follow-up | **yes, bounded**: existing pipeline, ≤ `ANON_DAILY_LIMIT` (5) per identity/day and ≤ 3 per share per identity/day | existing | existing | existing | **Variable, capped** |
| Share creation | none | none | 2 route calls + 1 INSERT | ≤ 64 KB/row | Negligible |
| Zalo integration | none | Zalo Open API (free), only when configured | 1 route call | none | $0 today |
| Android Direct Share / Web Share Target | none until the user's own query | none | none | none | $0 |
| Analytics events | none | none | existing `/api/track` batching | rows in existing `user_events` | Negligible |
| Growth report | none | none | admin-only, ≤ 200k rows / 90 days | none | Negligible |

No paid API, LLM provider, infrastructure service, image-generation service or paid acquisition was added (`package.json` unchanged).

## 7. What G1 does not yet solve

- **Acquisition surfaces that require installation first:** Web Share Target and Android Direct Share only serve installed users.
- **Incomplete second-generation share:** a recipient must sign up before they can share their own result; anonymous viewers can read and ask but not multiply.
- **No Android share-out:** the loop can only be *started* from the web chat; the Android app has no "share as public result".
- **No external distribution exists:** no share has been created, no link has been sent, no page is deployed — the loop is built, not running.
- **No real-world traffic:** hubs and `/r/*` pages are not indexed; no QR has been placed; GEO attribution has nothing to attribute.
- **Viral coefficient unvalidated:** k-factor, views/share, viewer→query and viewer→signup are computable but have zero data.
- **Platform approval required:** the Zalo Mini App path needs registration, review and a VN-region verification decision; until then Zalo recipients get the plain web page.
- **Measurement without data:** all seven events, stitching and gates exist; Gate 0/1/2 will report `insufficient_sample` until real users arrive.
- **Wedge not built:** Scam Check / Price Check as acquisition wedges exist only as a reserved source value.
- **Migration unapplied:** none of the share-out loop can run until `shared_results` exists in production.

## 8. Actual growth funnel

| Step | Status | Evidence |
|---|---|---|
| Discovery | **PARTIAL** | Surfaces exist (OG card, hubs, sitemap/robots, QR SVG) but no external distribution, indexing or placement has happened. |
| First Visit | **IMPLEMENTED** | `first_visit` emitted once per browser with landing attribution (`useG1Session`, `attribution.ts`). |
| Query | **IMPLEMENTED** | `query` emitted per accepted chat request with `result_id`, `is_first_query` (`ChatInterface.tsx` `onResponse`; public page follow-up). |
| Useful Result | **IMPLEMENTED** | Defined as ≥1 `result_action`; outbound clicks classified by CTA type/host (`classifyOutboundAction`), delegated listeners in chat and on `/r/[slug]`. |
| Share / Result Action | **IMPLEMENTED** (web, signed-in) | Share preview → create → ShareMenu; `share_created` + `result_action:share`. **PARTIAL** for anonymous (refused) and **NOT IMPLEMENTED** on Android. |
| New Visitor | **IMPLEMENTED** | `/r/[slug]` public, no login; `share_viewed` deduped per share/viewer; `share_id` bridged into attribution. |
| Follow-up | **IMPLEMENTED** | Inline ask on the public page via existing `/api/chat` with per-share cap and public context. |
| Signup | **IMPLEMENTED** | Soft gate → `/login?returnTo=/r/<slug>`; `signup` event carries `first_source`/`first_share_id`; anon→user stitched in `anon_identity_map`. |
| Return | **IMPLEMENTED** (measurement) / **PARTIAL** (mechanism) | `return` emitted on a later VN day; D7 computed over day 5–9. The only new re-entry *surfaces* are Share Target / Direct Share for installed users. |

## 9. Scorecard (factual status, no ranking)

**Working growth mechanisms (implemented, testable end-to-end in code):**
- Share-out: chat turn → sanitized preview → confirm → `/r/<slug>` + OG card → Facebook / Zalo / copy / OS share (web, signed-in users).
- Public result page with full answer, outbound actions and its own share button.
- Anonymous follow-up on the public page through the existing chat pipeline, capped.
- Hub → chat entry links (`/chat?category=…&q=…`), open to anonymous visitors.

**Working measurement mechanisms:**
- Seven canonical events with source and share_id attribution; one persistent anon_id with cookie mirror; anon→user stitching; per-(share, viewer) view dedup; referrer-based GEO attribution; `computeGrowthMetrics` with Gate 0/1/2 verdicts; admin report endpoint; DB counters (`view_count`, `ask_count`).

**Growth mechanisms requiring external activation:**
- GEO hubs and `/r/*` indexing (deployment + crawler indexing).
- QR / POS (physical placement).
- Zalo Mini App (registration, credentials, review, VN-region verification decision).
- Production migration for `shared_results` / `anon_identity_map` (owner authorization).

**Growth mechanisms not yet validated with real users:**
- Every one of the above: no share has been created, no page viewed, no follow-up asked, no signup attributed. k-factor, share rate, views/share, viewer→query, viewer→signup, activation and D7 all have zero observations.

**Growth mechanisms that do not actually reach unaware users:**
- Web Share Target (installed PWA only).
- Android Direct Share (installed app only, inbound only).
- Zalo identity cap and verify route (cost protection, not reach).
- Analytics, metrics, gates (measurement only).

## 10. Conclusion

### What G1 has actually achieved
G1 turned Tappy's private chat answers into **publishable, cost-free public assets** (`/r/<slug>` with an OG card), gave signed-in web users an explicit two-click way to send them anywhere, let any recipient read the full answer and ask Tappy without installing or signing up, and wired every step into one measurement contract so the loop's real numbers (share rate, views per share, viewer→query, viewer→signup, k-factor, activation, D7) can be computed the day traffic arrives — all without adding a paid service or any inference to public views.

### What can acquire an unaware user today
Only the **share-out loop**: a link (with its rich OG card) sent by an existing signed-in web user into Zalo, Messenger, Facebook or any chat. That is the single implemented path that reaches someone who has never heard of Tappy, and it works the moment the migration is applied and the branch is deployed. The GEO hubs and QR entry *can* reach unaware people but are conditional on indexing and physical placement that have not happened.

### What can multiply an existing user's activity today
The public page's own share button (a recipient re-shares the same result), the "Mở TappyAI" and follow-up paths that pull a recipient into the chat, and — for installed users — Web Share Target and Android Direct Share, which turn content from other apps into Tappy questions. Multiplication beyond one generation requires the recipient to sign up, because creating a new public share is account-only.

### What is measurable but not yet validated
All seven events, attribution across the share bridge, anon→user stitching, unique-viewer dedup, the three gates and every derived rate exist in tested code and have **no data**: no production share, view, follow-up or signup has occurred, and the gates will report `insufficient_sample` until at least Gate 0's 30–50 users exist.

### What remains outside the current implementation
Android share-out of public results; anonymous re-sharing; any wedge surface (Scam Check / Price Check instrumentation); a live Zalo Mini App; actual indexing, QR placement or any form of external distribution; validation of the viral coefficient; the applied migration and the deployment themselves.
