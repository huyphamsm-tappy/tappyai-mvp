# SEC4 — cost-route matrix, ratchet design, slice plan (Checkpoint 2, 2026-10-10)

Baseline `17d4aac`. Companion to `SEC4-COST-ROUTE-COVERAGE-AUDIT.md`. **Nothing in the runtime changes in slice 1.** Production KV configuration and per-route runtime wiring are **not verified** (BLOCKED, §6). "Shared" below means the limiter's *design* shares state across instances *when its store is configured*.

## 1. Verification of the earlier audit against current code
Re-checked by grep of each route file and by a call-site scan (route source + import closure, depth 3; patterns in §4):
- Confirmed: `voice/tts`, `explore/process`, `group/[id]/suggest`, `upload/video` use only the in-process `rateLimit`; `reviews/upload` a local in-file `checkRL`; `profile`, `group/[id]/avatar`, `stripe/*`, `reviews/[id]/like`, `users/[id]/follow` have no limiter; `translate`, `scan` have daily-per-IP only (they also call `publicRateLimit`'s in-process fallback pattern).
- **Corrections / additions found now:** (a) `memory` (POST runs `extractMemoryFromConversation`, an LLM call on user-supplied messages) has **no limiter** and **no Web caller** (the only caller was removed — see the comment in `ChatInterface.tsx`); the earlier audit missed it. (b) `voice/language` is **not** cost-bearing (it only calls the pure `detectLang`). (c) `onboarding`, `recommendations`, `suggested-prompts` import `memoryService` (which contains the LLM function) but call only `getMemory`/`updateMemory`: **false positives of a module-level scan**, handled as explicit exemptions. (d) `scam-shield/directory` serves a static dataset through a barrel that also exports the Web Risk client: false positive. (e) `stripe/checkout` and `stripe/portal` answer 404 while `subscriptionsEnabled()` is on (they are dormant in a SePay/VietQR deployment; prod flag state UNVERIFIED) and have no Web caller. (f) `admin/marketing/campaigns/[id]` (GET, PATCH) has no `distributedRateLimit` although every other admin route does (C10 §5 treats a new admin route without a limit as a violation; low cost — the send path `/activate` is limited).

## 2. Route matrix
Legend — limiter: **D** `distributedRateLimit`, **P** `publicRateLimit`/`publicDailyRateLimit`, **Q** shared AI quota, **L** in-process `rateLimit`/local, **C** cron secret, **—** none. Store-down: *closed* = refuses; *per-instance* = falls back to in-process count; *n/a*. Tests = tests that exercise the limit itself.

| Pri | Route | Cost / provider | Limiter · key · limit (today) | Shared? | Store unavailable | Proposed limit & rationale (NOT applied) | Limit tests today |
|---|---|---|---|---|---|---|---|
| P1 | `POST /api/memory` | LLM (Haiku) on caller-supplied messages; no Web caller | — | – | – | Close it (no caller) or D, user key, 5/min + daily cap: unbounded LLM spend by any signed-in user; low legitimate use | none |
| P1 | `stripe/checkout`, `stripe/portal` | Stripe API calls | — (404 while `subscriptionsEnabled()`) | – | – | D, user key, 10/min if the routes are ever re-enabled; dormant now | `payments/flagGate.test.ts` (flag only) |
| P1 | `profile` (POST cover/avatar), `group/[id]/avatar` | storage write + server-side image processing (CPU/egress), size-capped | — | – | – | D, user key, ~20/hour: bounded by size cap, so cost is modest; abuse = storage churn | profile/avatar tests (no limit assertions) |
| P1 | `reviews/[id]/like`, `users/[id]/follow` | push dispatch per action (no per-send fee) | — | – | – | L→D user key ~60/min: spam vector more than spend | none |
| P2 | `voice/tts` | Google TTS (priced per character; ≤2000 chars/call) | L · user · 30/min | no | per-instance | D, user key, keep 30/min **plus** a daily character/call ceiling (owner number): the one variable-cost route in this tier | none |
| P2 | `explore/process` | LLM (content processing) | L · user · 20/min | no | per-instance | D, user key, 20/min (unchanged number) + daily cap | none |
| P2 | `group/[id]/suggest` | LLM | L · user · 5/min | no | per-instance | D, user key, 5/min (already tight) | none |
| P2 | `upload/video` | signed upload URL minting (bandwidth is on the client→GCS leg) | L · user · 30/min | no | per-instance | D, user key, 30/min; low cost | 1 test mentions the limit |
| P2 | `reviews/upload` | image processing | local `checkRL` · user · 10/day | no | per-instance | D, user key, same 10/day (it is already a daily cap) | 1 |
| P3 | `translate` | LLM | P daily · IP · 30/day, no burst cap | if KV | KV present: closed; absent: per-instance | add burst (e.g. 6/min/IP) and a global daily ceiling (new env; owner number): IP rotation multiplies the daily cap | none |
| P3 | `scan` | vision LLM | P daily · IP · 20/day, no burst cap | if KV | same | same as `translate` (vision calls cost more per call) | none |
| P3 | `messaging/threads/[id]/messages`, `reviews/[id]/comments` | push dispatch | L · user · 60/min, 10/min | no | per-instance | D, same numbers | route tests cover behaviour, not the limit |
| ok | `chat` | LLM, Serper, Places, TTS | P IP 30/min · P user 20/min · Q daily · P Pro 300/day · Serper ceiling | if KV (Serper count per-instance if store down) | KV present: closed; absent: per-instance | unchanged; frozen Serper area | `chatCaps`, quota, route tests |
| ok | `viet-content`, `scam-shield/analyze\|check\|qr\|share` | LLM / Web Risk lookups | P burst + daily (+Q for analyze) · IP | if KV | as above | unchanged | `publicRouteRateLimits.test.ts`, analyze/viet-content tests |
| ok | `admin/**` (35 of 36) | push/storage/audit fan-out | D · admin user | yes | closed | unchanged | `adminRateLimitContract.test.ts`, `distributedRateLimit.test.ts` |
| gap | `admin/marketing/campaigns/[id]` | low (state change; send is in `/activate`) | — | – | – | D, admin user, like its siblings | none |
| ok | `cron/**`, `notifications/backfill` | LLM/Serper/push fan-out | `CRON_SECRET` bearer; closed when unset | n/a | closed | unchanged (not user-reachable) | `cronAuth.test.ts` |
| exempt | `onboarding`, `recommendations`, `suggested-prompts`, `scam-shield/directory`, `shared-results/preview`, `commerce/handoff`, `webhooks/stripe` | no provider call on this path (module co-location / static data / inbound signed webhook) | various | | | none | – |

Why not one blanket policy: the tiers differ in who the caller is (anonymous IP vs signed-in user vs operator), what a call costs (per-character TTS vs a signed URL vs a push) and what failing closed would break (a sign-in-less public endpoint should keep working per-instance without KV; an admin route should refuse).

## 3. Coverage ratchet (design and acceptance criteria — **slice 1**)
**What it prevents:** a new route that can incur provider cost shipping with no declared limiter; a declaration drifting from the code; the known-gap list growing silently.
**Mechanism (`src/lib/security/costRouteRegistry.ts` + `costRouteCoverage.test.ts`, no runtime import):**
1. The test walks every `src/app/api/**/route.ts`, computes cost signals from the route source and the files it imports (depth 3, project files only; patterns in §4) and the limiter patterns present **in the route source**.
2. Group rules: every detected `admin/**` route must contain `distributedRateLimit`; every detected `cron/**` route must contain `cronAuth`. Both have one explicit, recorded exception each (`admin/marketing/campaigns/[id]` as a known gap).
3. Every other detected route must have an explicit entry `{ route, cost, limiters, key, status, note }` with `status` ∈ `covered` | `known-gap` | `exempt`.
**Acceptance criteria (all must hold for the slice to be accepted):**
- AC1 a detected cost route with no entry fails the test with a message that names the route and the signals found;
- AC2 an entry whose route no longer exists fails (no stale declarations);
- AC3 the declared `limiters` must equal the limiter patterns actually present in the route source (so adding or removing a limiter forces a declaration update — the ratchet works in both directions);
- AC4 `covered` requires at least one of D / P / Q (or C for cron); `known-gap` must name the missing control (note ≥ 20 characters) and the slice that closes it (2..6); `exempt` requires a reason of ≥ 40 characters;
- AC5 the number of `known-gap` entries is pinned (`KNOWN_GAP_BUDGET`); raising it requires editing the test, which review sees; lowering it is the way a gap is closed;
- AC6 mutation checks: a fake cost route file, a removed declaration, a declared limiter the code lacks, a gap relabelled, and a gap added without a budget change each make the suite fail (5/5 caught on the real tree; the rules themselves are also tested on a fixture tree);
- AC7 **no runtime behaviour change**: no route, limiter, config or migration file is modified; Android/iOS untouched.
Limits of the heuristic (stated, not hidden): a route that reaches a provider only through a symbol this scan does not recognise, or deeper than 3 imports, is not detected; and a module that merely *contains* a cost function counts as a signal, hence the explicit exemptions. The patterns list is part of the test so it is reviewed like code.

## 4. Cost signal patterns (initial)
LLM (`AI.generate|extract|stream*(`, `streamText|generateText|generateObject(`), Serper (`serperSearch|serperPlaces|serperShopping|serperImages(` , `google.serper.dev`), Google TTS/STT/Vision/Translate hosts, OpenAI/Anthropic hosts, Stripe (`new Stripe(`, `from 'stripe'`), storage (`getMediaProvider`, `createUploadSession`), push/email (`emitNotification`, `sendNotificationToUser`, `sendEmail`, `resend`), Web Risk / Safe Browsing / VirusTotal / urlscan, Google Places (`places.googleapis.com`, `fetchPlacePhoto`).

## 5. Slice plan (each independently reviewable; only slice 1 is in this checkpoint)
1. **Ratchet + registry** (this checkpoint; tests only).
2. User-keyed in-process → shared: `voice/tts`, `explore/process`, `group/[id]/suggest`, `upload/video`, `reviews/upload` (same limits, same keys; decision needed on store-down behaviour: recommend the `publicRateLimit` semantics — per-instance only when no KV configured, closed when configured but down). Daily ceiling for TTS needs an owner number.
3. `memory` POST: close or limit (decision: is the endpoint needed?).
4. `translate` / `scan`: burst cap + global ceiling (owner numbers).
5. Storage writers and push-triggering routes.
6. `admin/marketing/campaigns/[id]` (one-line, matches its siblings).
Each behaviour slice: acceptance criteria written first, route-level tests with a real limiter (like `adminRateLimitContract.test.ts`), 429 + `Retry-After`, mutation checks, diff reviewed before the next.

## 6. BLOCKED / unverified (explicit)
- `KV_REST_API_*` / `UPSTASH_*` present and healthy in Production **now** (docs record 2026-08-13 / 2026-09-20 only).
- Which path each route actually takes in production (log query needed; `tappyai_rate_limit` is logged only on rejection in chat).
- Live values of `CHAT_IP_BURST_PER_MINUTE`, `PRO_DAILY_CHAT_CAP`, `SERPER_DAILY_CREDIT_CEILING`, `CRON_SECRET`, `SUBSCRIPTIONS_ENABLED`.
- WAF/CDN limiting outside the repository; vendor spend; lambda fan-out factor.
These stay BLOCKED until read-only production evidence is provided; no claim of runtime wiring is made.
