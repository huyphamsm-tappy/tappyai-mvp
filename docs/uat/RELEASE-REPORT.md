# TappyAI — Release Readiness Report (PASS 3)

**Branch** `uat/release-audit-2026-09` (worktree `g1-place-guard`, base `merge/main-into-v3 @ d96d06b`; production = `origin/main @ 842379b`). **Date** 2026-09-20. **Environment** local `next dev` / `next build` against non-prod Supabase `zdaprdfgpbpnxyofagmc` (PRE-FLIGHT 2 re-confirmed from the running app before every DB write). All PASS-2 fixes were re-verified independently by re-running the original reproductions; PASS-2's claims were not trusted.

---

## A. EXECUTIVE STATUS

### NOT READY — as a full release gate.

This is a verdict on the **recent backend delta only**, not a certification that the product is ready to ship. The two are different, and the honest answer requires saying so up front:

- **The backend delta is in good shape.** Every P0/P1 that is an engineering defect has been fixed and independently re-verified (F-014, F-015, F-024, F-027, F-028). The 13,871-test suite is green, typecheck and lint are clean, and the production build compiles. The security-sensitive surfaces re-checked (IDOR isolation, admin role enforcement, quota atomicity, SSRF, prompt-injection, the phone-number requirement) hold.
- **But release readiness was not assessed, and cannot be from this pass.** This audit covered the **backend delta on an empty non-prod database**. The five core domains, the web UI, Android, iOS, Google Analytics, and performance were **DEFERRED for lack of data and scope — they were not verified, not passed.** Those are exactly the areas most likely to hide a P0.
- **Two P0/P1 items remain open** (neither a code defect, both owner actions): **F-002** (Next.js AVIF RCE — conclusively mitigated on Vercel's platform, but the code is still on an affected version) and **F-001** (GA not configured for production).

Per the runbook, READY is not permissible while any P0/P1 is open, nor when the areas that would reveal P0s are UNVERIFIED. Both conditions apply. **NOT READY is the rule-compliant and honest verdict.**

**Confidence:** *High* that the specific backend changes in this delta are correct and safe (they were re-verified live). *Low* that the product as a whole is release-ready — because most of the product was never exercised. Do not read "the backend delta is solid" as "ship it." A manual UAT of the deferred areas is required before a launch decision; section **B** and the closing **"What I did not verify"** are what that UAT should work from.

---

## B. COVERAGE

| Area | State | Reason |
|---|---|---|
| §3.1 Secrets & supply chain | AUDITED | Full-history blob scan, bundle check, npm audit (PASS 1); F-002 re-investigated with evidence (PASS 3) |
| §3.2 Auth / authz / RLS / IDOR | AUDITED | A/B seeded via the app; RLS matrix over 45 tables (PASS 1); IDOR + admin enforcement re-checked (PASS 3) |
| §3.3 Main Chat quota + AI | AUDITED | Quota charge/refund/atomicity re-verified live (PASS 3); cross-user leak clean |
| §3.5 Affiliate / commerce | PARTIAL | Static + config verified; **runtime wrapping UNVERIFIED** (no `ACCESSTRADE_PUBLISHER_ID`, F-020) |
| §3.6 Scam Shield (phone requirement) | AUDITED | All 5 indirect phone paths re-verified — none produce a phone verdict |
| §3.9 Music reuse removal | AUDITED | Re-verified both directions live + Playwright (PASS 3) |
| §3.10 Frontend↔backend contract | PARTIAL | Delta cross-platform routes checked; plan_shares byte bug found (F-029) |
| §3.11 Data integrity / migrations | AUDITED (schema) | Delta tables RLS/FK/index/CHECK verified; **query plans UNVERIFIED (empty DB)** |
| §3.17 AI safety subset | AUDITED | Injection / extraction / XSS / SSRF verified (PASS 1), unchanged since |
| §3.23 Build / test baseline | AUDITED | 13,871 pass / 0 fail; tsc 0; lint 0; prod build 0 |
| §3.4 Five core domains (discovery/consultative quality) | **NOT AUDITED / UNVERIFIED** | Needs real place data; empty DB |
| §3.7 Notification control (product-level, all surfaces) | **NOT AUDITED / UNVERIFIED** | UI/mobile; out of backend scope |
| §3.8 Default theme (every entry path, first paint) | **NOT AUDITED / UNVERIFIED** | UI; out of scope |
| §3.12 Policy / privacy / store readiness | **NOT AUDITED** | Static-only; not done this pass |
| §3.13 Localization (EN+VI) | PARTIAL | i18n discipline enforced by tests; not swept for missing keys |
| §3.14 Web frontend sweep | **NOT AUDITED / UNVERIFIED** | Deferred |
| §3.15 Android | **NOT AUDITED / UNVERIFIED** | Emulator available but not exercised; native music-reuse entry points NOT removed |
| §3.16 iOS | **NOT AUDITED / UNVERIFIED** | No macOS; static-only, not done |
| §3.18 AI + infra cost | **NOT AUDITED** | Deferred |
| §3.19 Google Analytics | **UNVERIFIED** | F-001 (not configured for prod); see §H |
| §3.20 Other analytics / observability | PARTIAL | /api/track fixed (F-027); PostHog/Sentry not exercised |
| §3.21 Performance | **NOT AUDITED** | No load; empty DB |
| §3.22 Resilience | PARTIAL | AI-failure path verified (F-015); broader chaos not run |
| AI golden-set quality scorecard | **NOT RUN** | No data to recommend from (empty DB); see §F |

---

## C. FIVE CORE DOMAINS

| Domain | Web | Android | iOS | Backend | Result |
|---|---|---|---|---|---|
| Food | UNVERIFIED | UNVERIFIED | UNVERIFIED | PARTIAL (routes/tools exist; chat turns ran) | UNVERIFIED |
| Shopping | UNVERIFIED | UNVERIFIED | UNVERIFIED | PARTIAL | UNVERIFIED |
| Travel | UNVERIFIED | UNVERIFIED | UNVERIFIED | PARTIAL | UNVERIFIED |
| Entertainment | UNVERIFIED | UNVERIFIED | UNVERIFIED | PARTIAL | UNVERIFIED |
| Spa / wellness | UNVERIFIED | UNVERIFIED | UNVERIFIED | PARTIAL | UNVERIFIED |

The domains were not audited for discovery quality, result integrity, or the consultative flow — that needs real place data and was deferred. A handful of live chat turns ran (quota/refund/injection tests) and produced plausible Vietnamese recommendations, but that is not a domain-quality verdict.

---

## D. FEATURE AUDIT (delta focus)

| Feature | Status | Surface coverage |
|---|---|---|
| Main Chat (quota, refund on failure) | **FIXED + verified** (F-015) | Backend verified; UI unverified |
| Analytics ingest `/api/track` | **FIXED + verified** (F-027) | Backend verified |
| Music reuse ("use this sound") | **REMOVED + verified** (F-024) | Web+backend verified; **Android/iOS native entry points NOT removed** (will hit 410) |
| Debug/test diagnostic routes | **DELETED + verified** (F-014) | Backend verified (404, build-confirmed) |
| Age gate / DOB self-correction | **FIXED + verified** (F-028) | Backend verified (RPC + read side) |
| Plan share (`/api/plans/share`) | Works; **500 on large VI plans** (F-029) | Backend |
| Messaging (chat threads/messages) | PARTIAL (RLS boundary verified PASS 1) | Backend |
| Commerce / affiliate (CCP) | PARTIAL — wrapping UNVERIFIED (F-020) | Backend static/config only |
| Scam Shield | AUDITED (phone requirement) | Backend |
| Notifications control | UNVERIFIED | — |
| Default theme | UNVERIFIED | — |

---

## E. AFFILIATE

| Provider | Approval state | Link generation | Deeplink | Tracking params | Destination verified? | Fallback | Result |
|---|---|---|---|---|---|---|---|
| cellphones, klook, lazada, tiktokshop, tripcom, vexere | DB says approved (accesstrade, campaign ids present) | Code path present | Enabled | via go.isclix.com wrapper | **NO** — not run | Direct URL | **UNVERIFIED** |
| traveloka, vietnamairlines | Tier-1, no network/campaign | Direct only | Enabled | none | **NO** | Direct URL | UNVERIFIED (confirm intended) |
| shopee | Pending → direct handoff | Code path present | Disabled | — | **NO** | Direct handoff | UNVERIFIED |
| agoda, booking, cgv, grabfood, shopeefood, ticketbox, vietjet | Tier-2 | Code path present | Disabled | — | **NO** | Card CTA / direct | UNVERIFIED |
| dmx | Disabled (owner) | — | — | — | n/a | n/a | Disabled |

**Affiliate wrapping was NOT verified end-to-end (F-020):** `ACCESSTRADE_PUBLISHER_ID` is unset in the audit env, so every wrapper falls back to a direct link and the real `go.isclix.com` URL / surviving tracking params / campaign approval state could not be exercised. The architecture (resolver + param-echo + direct fallback) is verified-good statically (F-019); the money path is unverified.

---

## F. AI QUALITY & COST

**Golden-set scorecard: NOT RUN.** The 40-query golden set requires real place data to produce meaningful recommendations to score; on an empty non-prod DB it would measure nothing. There is therefore **no before/after scorecard, and AI quality regression is UNVERIFIED for this release.** No cost optimizations were applied in PASS 2/3 (the F-015 change is a quota-refund, not a token change), so there is no quality-for-cost trade to report. Hallucination count: not measured. This gap is real and must be closed by a human running the golden set against production-shaped data.

---

## G. SECURITY

- **Fixed:** F-014 (deleted unauthenticated debug/test routes calling paid providers). F-015 (quota-refund; also removes a griefing vector where provider outages drain users' quotas).
- **Re-verified holding:** IDOR isolation (A cannot read/modify B's conversations/reviews; RLS + user_id filters hold — a foreign PUT/DELETE changes no data), admin role enforcement (plain user → 403 on every admin endpoint), quota atomicity (2 parallel turns both charge, no double-refund), SSRF (allowlist + DNS pinning, PASS 1), prompt-injection/extraction/XSS (PASS 1), the phone-number requirement (§H-adjacent, below).
- **Remaining risks:** F-002 (P0, Next.js RCE — **conclusively mitigated on Vercel**, see §K; durable upgrade scheduled post-launch). F-003/F-004 (Firebase key committed; an old Google key in a reflog-only commit — **need rotation/restriction confirmation by the owner**, locations/classes only, never values). F-005 (dependency advisories, patch-level).
- **Rotation needed (owner):** confirm the Firebase Android key's app+API restrictions in Google Cloud (F-003); confirm the old key in reflog commit `c473ade` is disabled (F-004). No secret values are printed anywhere in this audit.

**Phone-number requirement (P0 gate) — VERIFIED GONE on every path:** bare number → INCONCLUSIVE (no verdict); Main Chat "số … có lừa đảo không?" → refuses + redirects to VNCERT/Công an; `tel:` URL → 400; a scam message containing a number → analyses the *message*, the number is context not a verdict; a QR with a `tel:`/number → `qr_no_url` (the decoder passes only http/https to the checker). **No path produces a scam verdict, risk score, or characterization of a phone number.**

---

## H. GOOGLE ANALYTICS

| Check | Result | Method / evidence |
|---|---|---|
| Integration | UNVERIFIED | Client code exists (`src/lib/analytics/ga4.ts`), not exercised in a real browser with network interception |
| Production configuration | **FAIL** | F-001 — no `NEXT_PUBLIC_GA_MEASUREMENT_ID` for production; not configured |
| Real events received | UNVERIFIED | No GA property configured; nothing to receive into |
| Realtime | UNVERIFIED | Same |
| Event tracking | UNVERIFIED | Playwright network-interception not run this pass |
| No duplicate events | UNVERIFIED | Not run |
| No PII leakage | UNVERIFIED | Not run (internal `/api/track` PII stripping IS tested and now writes correctly, F-027) |
| Web | UNVERIFIED | Not run |
| Android | N/A | Deferred |
| iOS | N/A | Deferred |

**Is GA reliable enough as the interim production measurement layer? NO.** It is not configured for production (F-001). Even the client-side firing was not verified this pass. Note the internal analytics path (`/api/track` → `user_events`) was **silently dropping events before F-027** and is now fixed — so if internal analytics is the intended measurement layer, it needed the F-027 fix to work at all, and its production correctness should be confirmed post-deploy.

---

## I. POLICY / PRIVACY / STORE

- **Updates made:** none this pass (no policy copy changed).
- **Updates still required (engineering-fixable):** F-023 (Scam Shield lacks a scam-specific disclaimer/appeal near the verdict — copy lives in the repo). Stale docs referencing the deleted debug routes and `next.config.ts`.
- **Requires a human/legal decision:** F-023 legal-risk wording (defamation exposure of a HIGH/CRITICAL verdict naming a business); music-reuse **data retention/deletion** (owner's call — retained, not deleted); F-031 (retiring music reuse also removed the music-track copyright/abuse **report channel** — acceptable?); Google Play Data Safety / account-deletion URL and App Store privacy manifest were **NOT AUDITED** this pass.

---

## J. BUGS FIXED

| Issue | Root cause | Fix | Independent verification (PASS 3) |
|---|---|---|---|
| F-015 failed AI answer charged | quota consumed before the model, no refund | limiter release primitive + refund on `onError`/init-throw (both routes) | **Re-ran the bad-key repro:** failed turn left quota 15/15; success charged 15→14; refund log observed |
| F-027 `/api/track` dropped events silently | upsert error discarded + uuid/enum poison of the whole batch | sanitize uuid cols, read the error, salvage valid rows | **Re-ran:** batch [page_view + unknown_type] → 200, page_view persisted, unknown dropped; non-uuid anon_id sanitized & persisted |
| F-024 music reuse | reuse path across 10 endpoints + 8 UI surfaces | 410 on all endpoints + block attach-write; UI CTAs/pages/composer removed | **Re-ran both directions:** 11 endpoints 410, attach 410, plain review 200, composer no picker, `?sound=` no-op, pages notice; own-clip playback code untouched |
| F-014 debug/test routes | unauthenticated in non-prod, paid providers | deleted both files | **Re-ran:** both 404; absent from prod build manifest |
| F-028 DOB lockout | one-correction-for-everyone; canSelfCorrect mirrored it | RPC: exhaustion only while eligible; canSelfCorrect true when ineligible; free re-correction respects the 0–1 CHECK | **Re-ran live:** eligible→mistype→ineligible (canCorrectAge true)→recovered; eligible still capped at one; 63 DB + 31 unit tests |

---

## K. REMAINING ISSUES

**P0**
- **F-002 — Next.js AVIF Image-Optimization RCE (`GHSA-2xp9-vwfh-vxw4`, CVSS 9.5).** *Impact:* unauthenticated RCE class in the image optimizer on affected self-hosted versions. *Status:* **conclusively mitigated for this deployment** — TappyAI is Vercel-hosted using the managed Image Optimization service (vercel.json, `www.tappyai.com`, no `output:standalone/export`, no custom loader, no `unoptimized`), and Vercel's official changelog states hosted apps are protected ("Vercel disabled AVIF optimization across its managed Image Optimization service… No upgrades, configuration changes, or redeploys are required"). AVIF output was never enabled; the Windows variant is N/A on Linux. Per owner decision, **no `images.unoptimized` change was applied** (it would add bandwidth/LCP cost for no security benefit). *Recommended action:* schedule the durable Next 15.5.24+ upgrade post-launch; reopens as unmitigated only if the app ever leaves Vercel's managed optimizer. Left open by design. (Dead `next.config.ts` deleted, `25ac78b`.)

**P1**
- **F-001 — GA not configured for production.** *Impact:* no analytics at launch. *Action:* owner creates the GA4 property and sets the prod Measurement ID (not a code change).

**P2**
- **F-029 — plan_shares 500 on large Vietnamese plans** (char-vs-byte CHECK mismatch). *Action:* trim the snapshot by UTF-8 bytes against the 64 KB CHECK; map the CHECK violation to a graceful error.
- **F-030 — test-suite blind spot (mocked DB writes don't exercise real column constraints).** *Action:* a contract test running each delta route's real insert payload against embedded-postgres; typed row builders.
- **F-020 — affiliate wrapping UNVERIFIED** (no publisher id). *Action:* set `ACCESSTRADE_PUBLISHER_ID`, verify the go.isclix.com URL + surviving params + campaign approval.
- **F-010 — anonymous sign-in disabled on the audit project** (guest path UNVERIFIED). *Owner's decision to enable.*
- **F-023 — Scam Shield lacks a disclaimer/appeal near a verdict** (legal). **F-003/F-004** — committed Firebase key / reflog-only old key (rotation/restriction confirmation). **F-005** — dependency advisories (patch-level `npm audit fix`).

**P3** (16) — mostly verified-PASS records (RLS/IDOR, auth lifecycle, quota mechanics, SSRF, commerce architecture, delta schema); plus minor status-code cosmetics (F-008 PUT→500, F-009 DELETE→ok:true, F-012 200-empty), untranslated register errors (F-011), and F-031 (music-track report channel removed with reuse).

---

## L. GO-LIVE PLAN

**Pre-deploy**
- **DB migrations to apply (in order), production, after owner authorization:** the delta migrations already in git — `20260905_chat_messaging_phase1`, `20260906_phase6_messenger_reachability`, `20260913_plan_shares`, `20260915_review_shares`, `20260920100000_commerce_providers`, `20260920110000_commerce_feed_items`, and the **new `20260920_f028_dob_self_correct_while_ineligible.sql`** (redefines `set_user_date_of_birth`; additive, `CREATE OR REPLACE`). All are additive and idempotent; each has a rollback in `supabase/migrations/rollback/`. **Take a DB snapshot before applying.** The F-028 migration only redefines a function — its rollback restores the prior body with no data change.
- **Reversible?** Yes — every delta migration is additive with a rollback file; no destructive DDL. Review each rollback before deploy.
- **Feature flags for the riskiest new features:** `CCP_ENABLED` / `CCP_AFFILIATE_WRAPPING_ENABLED` (commerce), `SHOW_SCAM_SHIELD`, `CCP_FEED_INGEST_ENABLED`. Music reuse is removed at the code level (not flag-gated) — its rollback is a git revert of `919736a`+`21cc9cf`.

**Kill switches (no deploy)**
- **AI provider:** an invalid/rotated `ANTHROPIC_API_KEY` stops model turns — and thanks to F-015, failed turns now **refund** rather than drain quotas. Canned/clarify turns still work.
- **Affiliate:** flip `CCP_AFFILIATE_WRAPPING_ENABLED` / `CCP_ENABLED` (env) to fall back to direct links / disable commerce.
- **Scam Shield:** `SHOW_SCAM_SHIELD=false`.
- **Feed ingest:** `CCP_FEED_INGEST_ENABLED=false` (env) or remove the Vercel cron.
- **Notifications:** the cron entries in `vercel.json` can be removed; marketing sending is gated by `MARKETING_SENDING_ENABLED`.

**Monitoring (first 48h)**
- Watch server logs for: `tappyai_quota_refund` (spikes = provider instability), `[track] user_events batch salvaged` / `upsert failed` (analytics-write health — new in F-027), `[chat] stream error`, `500` rates on `/api/plans/share` (F-029), `410` rates on `/api/sound|music|upload/audio` (clients still calling removed endpoints, esp. **native apps**).
- Error monitor: hydration/console errors on the web (not verified this pass), model failure rate, DB errors.
- **Abort threshold:** a sustained model-failure or DB-error rate, or a spike of unexpected 410s from native clients (would indicate Android/iOS still ship the music-reuse UI — see the honesty section).

**Cost alarms**
- LLM spend (Anthropic) — F-015 reduces waste on failures, but set a daily $ threshold. Serper/Places quota (the deleted debug routes were a leak — now closed). DB egress / storage growth. Upstash/KV request volume (quota + refund now do one extra ZREM per failed turn — negligible).

**Rollback procedure**
1. Redeploy the previous production build (`842379b`) via Vercel (instant rollback to the prior deployment).
2. If a delta migration must be reversed, apply the matching file in `supabase/migrations/rollback/` **after** confirming no newer data depends on it; the F-028 rollback is safe any time (function-only).
3. Rotate `ANTHROPIC_API_KEY` if the AI path is the problem (kill switch).
4. Confirm `/api/health` and a signed-in chat turn post-rollback.

**Staged rollout:** recommended. This delta is large (378 commits) and the non-backend surfaces are unverified. A staged rollout (small % → monitor the signals above → widen) is warranted, especially to catch native-app 410s and any web-UI regression the backend audit could not see.

---

## M. FINAL ANSWER

**"If we deployed the current codebase publicly today, are there any known P0/P1 issues that should prevent release?"**

**Yes — two, and both are owner actions, not code defects:**

1. **F-002 (P0)** does not block *this Vercel deployment* (conclusively mitigated by the platform), but the code remains on an affected Next.js version — treat the post-launch upgrade as committed, and this becomes a live blocker the moment the app leaves Vercel's managed optimizer.
2. **F-001 (P1)** — launching with no production analytics means you cannot see whether anything is breaking. Configure GA (or confirm the internal `/api/track` layer, now fixed, is the intended measurement) before or immediately at launch.

**Beyond those two, the real blocker to a *release decision* is not a known defect — it is the unverified scope.** The backend delta is solid and its P0/P1 defects are fixed. But the five domains, web UI, Android, iOS, GA delivery, and performance were not verified. A responsible public launch needs a manual UAT of those areas first. The exact remaining engineering blockers are only F-002 (mitigated) and F-001 (owner setup); everything else is P2/P3 or deferred verification.

---

## What I did not verify

This section is deliberately blunt. A launch decision made on an audit that pretended to be complete is worse than a delayed launch.

- **The five core domains (food, shopping, travel, entertainment, spa).** No discovery-quality, result-integrity, or consultative-flow verification. *To close:* run each domain's happy + failure path against production-shaped place data and check every UI-shown field is backed by data.
- **AI answer quality (golden set).** Not run — no data to recommend from. Quality regression for this release is **UNVERIFIED**. *To close:* run `docs/uat/ai-golden-set.jsonl` (once populated) against production data and score intent/constraints/hallucinations.
- **Web frontend.** No real-browser sweep (console/hydration errors, dead controls, routing, empty/error/loading states, responsive/theme). *To close:* a Playwright/manual pass across desktop/mobile widths.
- **Android & iOS.** Not exercised. **Critically: the native apps still contain the music-reuse UI** — this backend pass removed the web CTAs and 410'd the endpoints, but Android/iOS `SoundDetailScreen`/pickers were not touched and will hit the 410s. *To close:* build/run both, remove the native reuse entry points, and verify against the 410 backend.
- **Google Analytics delivery.** Client firing, dedupe, PII, realtime — none verified; GA not configured for prod (F-001). *To close:* configure a property and run Playwright network interception per the runbook §3.19.
- **Affiliate wrapping end-to-end (F-020).** The money path (real go.isclix.com URLs, surviving tracking params, live campaign approval) is UNVERIFIED. *To close:* set `ACCESSTRADE_PUBLISHER_ID`, generate a link per tier-1 provider, follow it, confirm the merchant + params.
- **Guest/anonymous path (F-010).** Anonymous sign-in is disabled on the audit project; guest quota, `is_anonymous` RLS clauses, and claim-anonymous are UNVERIFIED. *To close:* enable anonymous sign-in on the audit project and re-run.
- **Query performance / plans (F-025), resilience beyond AI-failure, cost profiling.** Not measured on an empty DB. *To close:* production-scale data + load.
- **Policy / store readiness.** Google Play Data Safety, account-deletion URL, App Store privacy manifest — not audited. *To close:* a compliance pass (some items need legal, per §I).
- **Notification control (all surfaces) and default theme (every entry path).** Not verified. *To close:* UI/mobile checks.
- **Test-suite trust (F-030).** The 13,871-green suite does **not** prove that route write-paths satisfy real DB column types/constraints — mocked inserts can't fail like Postgres. Two data-affecting bugs (F-027, F-029) already slipped through this exact gap. Treat suite greenness as a logic/authorization guard, not a data-integrity one.

*Prepared for a manual UAT to follow. The backend delta was re-verified; the product was not.*
