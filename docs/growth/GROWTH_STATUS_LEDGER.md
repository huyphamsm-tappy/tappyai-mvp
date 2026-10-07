# Growth status ledger — 5 layers, 34 mechanisms, one state each

**Purpose:** the single sheet that says, for every free-acquisition mechanism, where it is on the way from code to evidence. It replaces "G1 / G1 completion / exhaustive" as the way the system is described, and it replaces DONE as a final state. **A mechanism is useful only when a later row of this ledger shows evidence.**

**State model (in order):** `NOT STARTED → PREPARED → LIVE → MEASURED → VALIDATED`, with `LOW YIELD` and `RETIRED` as the two exits after measurement. Definitions:

| State | Means | Evidence required to enter |
|---|---|---|
| PREPARED | code + docs + owner runbook exist on a branch; nothing is reachable by a stranger | tests green on the branch |
| LIVE | reachable in production / listed in the store / verified by the tool | an HTTP 200, a store URL, a console "verified" — observed, not assumed |
| MEASURED | its L0 rows are non-zero for ≥ 1 week | a number from Search Console / Bing / `computeGrowthMetrics` / the store |
| VALIDATED | attributable activation (first `query` → useful result / signup) at a rate worth keeping | T+14 review class **A** |
| LOW YIELD | measured, negligible | T+14 review class **D** |
| RETIRED | switched off or abandoned on evidence | owner decision recorded here |

**The funnel every row is measured against:** technical readiness → indexing → impression/discovery → click/visit → install/entry → activation → retention. Code and tests satisfy only the first step.

**Ledger date:** 2026-09-19. **Production observed:** `www.tappyai.com` = `842379b` (`/api/version`); `/sitemap.xml`, `/about`, `/extension`, `/food`, `/llms.txt`, `/feed.xml`, `/opensearch.xml`, `/scam-shield/kich-ban` → **404**; `/scam-shield` → 200; `robots.txt` → 200 **without** a `Sitemap:` line. Therefore every mechanism below that needs the release is PREPARED, not LIVE, and STEP 1–4 of the traffic-unlock plan cannot start until the RC is released.

---

## L0 — Measurement

| # | Mechanism | State | Evidence | Next transition — who, exact action |
|---|---|---|---|---|
| L0.1 | G1 event contract (`first_visit, query, result_action, share_created, share_viewed, signup, return`) + `/api/track` ingestion | PREPARED | on RC; not in prod (`842379b` predates `47f2d5e`) | LIVE at release (needs both G1 migrations — `G1_MIGRATION_APPLY_CHECKLIST.md`) |
| L0.2 | Source attribution (`?src=`, referrer classes incl. `bing_search`, `browser_extension`, `pwa_shortcut`, `browser_search`) | PREPARED | — | LIVE at release |
| L0.3 | Identity stitching (`anon_identity_map`) | PREPARED | — | LIVE after migration 1 |
| L0.4 | Activation / D7 / k-factor / generation depth / `firstQueriesBySource` / extension install→first-query (`computeGrowthMetrics`, admin growth endpoint) | PREPARED | — | MEASURED = first weekly record (§Weekly record) |
| L0.5 | Search Console / Bing Webmaster reports as data sources | NOT STARTED | — | owner: STEP 1–2 after release |

## L1 — Discoverability

| # | Mechanism | State | Evidence | Next transition — who, exact action |
|---|---|---|---|---|
| L1.1 | `sitemap.xml` (static set + newest listed `/r/*`) | PREPARED | prod 404 | LIVE at release → verify `curl -s https://www.tappyai.com/sitemap.xml` |
| L1.2 | `robots.txt` with `Sitemap:` + AI-crawler allow | PREPARED | prod robots has no `Sitemap:` line | LIVE at release |
| L1.3 | Canonicals + Organization `@id` + BreadcrumbList / FAQPage / QAPage / Article / SoftwareApplication JSON-LD | PREPARED | — | LIVE at release; MEASURED via Search Console *Enhancements* at T+7 |
| L1.4 | Google Search Console (domain property, DNS TXT, sitemap, 7 inspections) | NOT STARTED | — | owner: STEP 1 — record actual "Indexed" count here, never assume |
| L1.5 | Bing Webmaster Tools (site, verify/import, sitemap) | NOT STARTED | — | owner: STEP 2 |
| L1.6 | IndexNow (code done; key env-gated) | PREPARED | no key in any env; key file 404 by design | owner: STEP 3 — `openssl rand -hex 16` → Vercel Production `INDEXNOW_KEY` → deploy → key file 200 → one real submission recorded here |
| L1.7 | Cốc Cốc (sitemap via robots; 10-URL manual submission) | NOT STARTED | — | owner: STEP 4 — record date + URLs + any status |
| L1.8 | OpenSearch (`/opensearch.xml`, `browser_search` source) | PREPARED | prod 404 | LIVE at release (retention-class) |
| L1.9 | Atom feed (`/feed.xml`) | PREPARED | prod 404 | LIVE at release |
| L1.10 | AI-search foundation (`/about` entity page, `/llms.txt`, crawler allow, `geo_chatgpt`) | PREPARED | prod 404 | LIVE at release; MEASURED only by `AI_SEARCH_VALIDATION_PLAN.md` runs (T+7/14/30) — appearance is never claimed |
| L1.11 | `sameAs` (`ORGANIZATION_SAME_AS`) | PREPARED — **intentionally empty** | no legitimate profile URL exists | stays empty until a real official profile exists; then owner sets the env and verifies `/about` JSON-LD. Never a fake profile |
| L1.12 | Google Discover eligibility (`max-image-preview:large`) | PREPARED | — | LIVE at release; Google-controlled — measured only through Search Console *Discover* report if it ever appears |
| L1.13 | Pinterest Rich Pins eligibility (`og:type=article` on `/r/*`) | PREPARED | — | owner: validate one URL after release (optional, low priority) |

## L2 — Shareability

| # | Mechanism | State | Evidence | Next transition — who, exact action |
|---|---|---|---|---|
| L2.1 | Share loop: result → preview → `/r/<slug>` → follow-up → re-share (ancestry, caps) | PREPARED | prod has no `/r/*`; needs both migrations | LIVE at release + migrations; MEASURED = `shares.*` rows |
| L2.2 | Scam-verdict share-out (`/api/scam-shield/share`) | PREPARED | — | same |
| L2.3 | OG cards + messaging previews (Zalo/Messenger link previews) | PREPARED | — | LIVE at release (3-layer Zalo cache — see memory: "still shows old card" ≠ bug) |
| L2.4 | oEmbed provider (`/api/oembed`) | PREPARED | — | LIVE at release |
| L2.5 | Web Share Target (installed PWA) | PREPARED | — | LIVE at release (retention-class) |
| L2.6 | Android Direct Share inbound + Process Text (select text → TappyAI) | PREPARED | vc8 not on Play | LIVE only when an Android build carrying it is published (L3.1) |
| L2.7 | QR / NFC entry (`/api/qr/entry`, `qr_pos`) | PREPARED | no placement | LIVE only when a QR is physically placed — owner decision; no placement planned |
| L2.8 | Android App Links (`/r/*`, alias OFF by default, `assetlinks.json` env-gated) | PREPARED | not device-verified; no fingerprint in repo | owner: STEP 9 — real SHA-256 → `ANDROID_APP_LINKS_SHA256` → build with flag → `adb shell pm get-app-links com.tappyai.app` = verified. **Not VERIFIED until that output is pasted here** |

## L3 — User-facing distribution

| # | Mechanism | State | Evidence | Next transition — who, exact action |
|---|---|---|---|---|
| L3.1 | Google Play (account exists; alpha vc6 on 2026-08-16; kit ready; vc8/0.1.3) | PREPARED | no production listing observed | owner: STEP 6 — sign `bundleRelease`, screenshots, data-safety (deletion = request-based), submit; record track + status |
| L3.2 | Samsung Galaxy Store | NOT STARTED | — | owner: after L3.1, same kit |
| L3.3 | Huawei AppGallery | NOT STARTED | — | owner: after L3.1 (HMS caveat in kit) |
| L3.4 | Xiaomi GetApps | NOT STARTED | — | owner: after L3.1 |
| L3.5 | Edge Add-ons (free) | PREPARED | `npm run extension:package` → `tappyai-extension-0.1.0.zip` | owner: STEP 5 — upload zip + `LISTING.md`; then `NEXT_PUBLIC_EXTENSION_URL_EDGE`; record URL |
| L3.6 | Firefox AMO (free; `browser_specific_settings.gecko` present) | PREPARED | same zip | owner: STEP 5 |
| L3.7 | Chrome Web Store (**US$5 one-time — owner approval required**) | PREPARED | — | owner: approve fee explicitly → register → upload; otherwise stays PREPARED |
| L3.8 | GitHub `tappyai-extension` (public-safe: extension folder only) | PREPARED | `GITHUB_PUBLIC.md` | owner: STEP 8 — create repo, paste README, choose LICENSE; record URL; optionally → L1.11 |
| L3.9 | PWA home-screen shortcuts (`pwa_shortcut`) | PREPARED | — | LIVE at release (retention-class) |
| L3.10 | Directories / Product Hunt / VN directories (`DIRECTORY_SUBMISSION_KIT.md`) | NOT STARTED | — | owner, post-release, optional |

## L4 — Public surfaces

| # | Mechanism | State | Evidence | Next transition — who, exact action |
|---|---|---|---|---|
| L4.1 | Public results `/r/*` (ISR, no LLM, QAPage) | PREPARED | prod 404 | LIVE at release + migrations |
| L4.2 | Five GEO hubs `/food /shopping /travel /entertainment /spa` | PREPARED | prod 404 | LIVE at release |
| L4.3 | `/about` entity page, `/startup` | PREPARED | prod 404 | LIVE at release |
| L4.4 | Scam Shield public surfaces: `/scam-shield` (metadata), `/scam-shield/kich-ban` + 25 scenario pages | `/scam-shield` LIVE (old version) · scenarios PREPARED | `/scam-shield` 200 in prod; `kich-ban` 404 | LIVE at release |
| L4.5 | `/extension`, `/extension/welcome` (noindex), `/extension/privacy` | PREPARED | prod 404 | LIVE at release |
| L4.6 | `PublicFooter` on the discovery cluster | PREPARED | — | LIVE at release |
| L4.7 | Home footer link row (`HOME_FOOTER_DECISION.md`, one import + one line) | PREPARED — **Option A approved by owner 2026-09-19**, implemented | `HomeV3.tsx` +2 lines; `publicFooter.test.tsx` pins exactly one mount below the last section | LIVE at release |
| L4.8 | Scam Shield public utility `/kiem-tra` (`feat/scam-shield-public-utility @ 153035d`) | PREPARED — **separate branch, not in this checklist** | `SCAM_SHIELD_PUBLIC_UTILITY.md` | owner reviews independently; not merged automatically |

**Count:** 39 rows in L1–L4 = the 34 passing mechanisms of `COMPLETE_FREE_ACQUISITION.md` Part B, split where the owner action differs per store or engine (e.g. four Android stores, three extension stores), plus the separate `/kiem-tra` row; the 5 L0 rows are the instrument, not mechanisms. No row may be added before the T+14 review.

---

## Release gate (before the RC goes to production)

- tests green on the RC (`npm test`, tsc, lint, architecture, sql-grants) — G1's are: web 13,662 / 0 / 68 at `6ce7d78`
- both G1 migrations applied via `G1_MIGRATION_APPLY_CHECKLIST.md` §1–§2 (before or immediately after deploy; Share fails without them)
- production env: `NEXT_PUBLIC_SITE_URL=https://www.tappyai.com` (or unset — the code's fallback is the same); `INDEXNOW_KEY` only if approved; `NEXT_PUBLIC_EXTENSION_URL_*` only for LIVE stores; `ANDROID_APP_LINKS_SHA256` **unset** until STEP 9
- apex → www: verified 2026-09-19 (`https://tappyai.com/` → 308 → `https://www.tappyai.com/`)
- no private / noindex page listed: `publicSurfaces.test.ts` pins the sitemap set and the env-gated 404s

## Post-release smoke test (owner or Claude on request; record results below the table)

| Surface | Check | Expected |
|---|---|---|
| Web | `/`, `/food`, `/shopping`, `/entertainment`, `/travel`, `/spa`, `/about`, `/extension`, `/scam-shield`, `/scam-shield/kich-ban/bca-2026-01`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/feed.xml`, `/opensearch.xml` | 200; `robots.txt` carries `Sitemap:`; sitemap lists the static set |
| Web | `/extension/welcome`, an anonymous-owned `/r/*` | 200 with `noindex`; absent from the sitemap |
| Web | `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`, `/.well-known/indexnow/x.txt` | 404 while the env vars are unset |
| Share | one real share from chat → `/r/<slug>` 200 → appears in `sitemap.xml` → `share_viewed` lands → `view_count` ≥ 1 (`G1_MIGRATION_APPLY_CHECKLIST.md` §3) | all four |
| Search | Search Console property verified; sitemap "Success"; 7 inspections requested; Bing site verified; IndexNow key file 200 and key shown in Bing | recorded with dates |
| Extension | unpacked or store install → `/extension/welcome` opens once → right-click "Ask Tappy" → `/chat?q=…&src=browser_extension` → "Check this link" → `/scam-shield?url=…` prefilled, not auto-checked | all |
| Android | app launch; share a result → `/r/*` opens; store listing URL if published; App Links only if STEP 9 done | as enabled |

## Weekly record (L0) — copy one block per week; numbers only from the named source

```
Week of YYYY-MM-DD  (release + N days)
DISCOVERY   indexed pages (GSC Pages): __ · Google impressions: __ · clicks: __ · CTR: __ · Bing impressions: __ · clicks: __ · Cốc Cốc site: count: __ · AI citations observed (validation plan run #): __
ACQUISITION identities.seen: __ · signups: __ · firstQueriesBySource {geo_google: __, bing_search: __, share_out: __, browser_extension: __, wedge_scam: __, direct: __, other: __} · extension.newInstallLandings: __ · store installs (Play/Edge/AMO): __ · GitHub visits (repo insights): __
ACTIVATION  identities.active: __ · activated: __ · activationRate: __ · actions.resultActionRate: __ · gates.gate0: __
RETENTION   d7.cohortSize: __ · retained: __ · rate: __   (D1/D14/D30: not computed by the code today — record from user_events SQL if wanted; do not invent)
SHARES      created: __ · uniqueViews: __ · viewerToQuery: __ · kFactor: __ · maxGeneration: __
Source: computeGrowthMetrics via the admin growth endpoint + GSC + Bing + store consoles. Blank = not available, never estimated.
```

## Two-week freeze (release → T+14)

Only: P0 / security / outage fixes · genuine release blockers · keeping measurement working · the owner submissions in STEP 1–9 · verifying live distribution · collecting data. **No new acquisition mechanism, no research round, no Zalo, no TGDĐ, no ads, no fake `sameAs`, no fabricated evidence.**

## T+14 review — one class per LIVE row

`A` acquisition evidence (attributable users/clicks/installs) · `B` discovery evidence only (impressions/indexing/citations, no acquisition) · `C` technical only (no external evidence) · `D` low yield (measurable, negligible) · `E` unknown (insufficient data). Then per row: Keep / Improve / Wait / Retire → update the State column (VALIDATED / LOW YIELD / RETIRED / stays MEASURED). Only after this review may a new mechanism be considered.

## Change log

- 2026-09-19 — ledger created from the G1 close-out; production probed; all release-dependent rows PREPARED; L4.8 tracked but out of scope.
- 2026-09-19 — owner decisions: Home footer Option A (implemented, L4.7); fast-forward `feat/g1-completion` into `rc/web-uat` approved; `/kiem-tra` branch stays separate for independent review.
