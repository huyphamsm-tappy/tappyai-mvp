# PROJECT STATE — single source of truth

This file is the only record of the canonical branch, verified SHAs, feature status, flags, test evidence, open gates and owner decisions. Update it in the same commit as the change that alters what it records. Old reports are history; when they disagree with code or evidence, trust the code and evidence. Rules for working in this repo: `CLAUDE.md`.

Evidence labels:
- `VERIFIED` — checked directly (git, source, or a test run) in the sessions of 21–22/10/2026; the method is named.
- `REPORTED` — stated in an earlier handoff, audit or note; not re-checked here.
- `INFERRED` — concluded from verified facts, not observed directly.
- `UNVERIFIED` — no evidence either way.

Last updated: 2026-10-22.

## 1. Canonical branch and platforms

| Platform | Worktree | Branch | SHA | Label |
|---|---|---|---|---|
| Web (canonical) | `D:/TappyAI-wt/wt-integration` | `integration/canonical-20261020` | `cfae4a8` | VERIFIED (`git rev-parse HEAD`, 22/10) |
| Android | `D:/TappyAI-wt/wtk-android` | `android/phase-k-web-parity` | `b6bf3a7` | VERIFIED by `rev-parse` at the start of the 22/10 session; not re-checked since |
| iOS | `D:/TappyAI-wt/wtk-ios` | `ios/phase-k-web-parity` | `4cf4816` | VERIFIED (`git rev-parse HEAD`, 22/10) |

- `origin/main` local remote-tracking ref: `b8d5b2850afcc0449415105e0d29bdd8ede62194`. VERIFIED as the existing local ref (no fetch). It is an ancestor of canonical HEAD; canonical is 287 commits ahead, `origin/main` has none canonical lacks (VERIFIED, `merge-base` / `rev-list`). This ref does not prove which SHA runs in production.
- Registered worktrees: 34 at the 22/10 check (VERIFIED, `git worktree list`). Not guaranteed to be current later.
- Mobile: Android 1185 unit tests pass at `b6bf3a7` — REPORTED (Phase M). iOS was never compiled or tested (no macOS) — REPORTED. Mobile production lines (`wtandroid`, `wtios`) lack ADR-024, the new marker parsing and the new quota — REPORTED.

## 2. Production

| Item | Status |
|---|---|
| SHA running in production | UNVERIFIED |
| Feature-flag values on Vercel | UNVERIFIED |
| Which database migrations are applied (for example `20261018_ai_data_consent.sql`) | UNVERIFIED (header says "NOT APPLIED", an internal note says applied 17/10) |

- Production is not inferred from branch names or from a module existing in source. No production access or change was made in this work.
- Phase 3 modules exist in `origin/main` source (`decisionState.ts`, `consultRouter.ts`, `decisionFrame.ts`, `needProfile.ts`, `consultativeBrief.ts`, and others): VERIFIED by `git ls-tree`. The production route `src/app/api/chat/route.ts` imports `routeConsult` and `buildBrief`: VERIFIED by `git grep`. Whether `routeConsult` runs unconditionally, and what it does at runtime: UNVERIFIED.

## 3. Feature status

Code present, flag default, test environment and production are separate columns.

| Feature | In canonical source | In `origin/main` source | Default in code | Test env | Production |
|---|---|---|---|---|---|
| Web Subscription (5 plans, VietQR/SePay, quota v2 30/day, shared entitlement) | VERIFIED | VERIFIED | `SUBSCRIPTIONS_ENABLED` OFF (`flags.ts:8-11`, VERIFIED) | 22 files, 211/211 pass (VERIFIED) | UNVERIFIED |
| Consultative Phase 3A (decision state, D9, D2, need profile) | VERIFIED | VERIFIED | no env flag found in `decisionState.ts`, `consultRouter.ts`, `decisionFrame.ts` (VERIFIED by grep) | UNVERIFIED | UNVERIFIED |
| Phase 3B (ranking: `rank.ts`, `candidate.ts`) | VERIFIED | VERIFIED | no env flag found | UNVERIFIED | UNVERIFIED |
| Phase 3C Consultative Brief | VERIFIED | VERIFIED | `CONSULT_BRIEF` OFF (`consultativeBrief.ts:186-188`, VERIFIED) | UNVERIFIED | UNVERIFIED |
| Retrieval V5 (read-page research) | VERIFIED | not present (REPORTED, audit) | `RETRIEVAL_V5` OFF; only effective with V4 on (`retrievalV5/flag.ts`, VERIFIED) | not shipped | UNVERIFIED |
| Page reader in the default production path | `readPage.ts` is in the canonical agent runtime (VERIFIED) | REPORTED absent | n/a | n/a | n/a |

Retrieval V5 benchmark history (REPORTED, project notes of 20/10): gate 2 failed three times (3.5/14, then 2.0/14, then 2.0/14 and holdout 2.75/10); total spend about 0.93 USD. A proposal and eval plan for selective page reading is a draft in the `g1-growth` worktree (`docs/research/muc2-read-page-eval-plan-20261022.md`, untracked there); no owner decision yet.

Commerce and deeplinks (Agoda, Vexere, Traveloka, TikTok Shop, Shopee): adapter and deeplink code exists in source — REPORTED (audit). That a URL, parameter, app fallback or affiliate link actually works is UNVERIFIED for all of them.

Mobile (REPORTED, Phase K/L/M handoff): Android has translate, viet-content, scan and upload wired into navigation; Android has no music; iOS has music hidden behind `showMusic`; iOS lacks shared-results and a dedicated 413 for chat; ADR-024 (`X-Decision-Evidence-Id` → `decisionEvidenceId`) was added on the phase-K lines only. None of this is re-verified.

Serper, Parallel, hosted search (REPORTED, audit): Serper daily cap 15 000 credits is a code default (`serperClient.ts:8`); `TAPPY_V4_HOSTED_SEARCH` defaults ON when V4 is on, which conflicts with the V5 aim of dropping OpenAI hosted search. No plan or result of a Parallel benchmark was found in the repo, backups or notes (UNVERIFIED that it ever ran).

## 4. Feature flags (names only; no values read)

| Flag | Default in code | Production value |
|---|---|---|
| `CONSULT_BRIEF` | OFF (VERIFIED) | UNVERIFIED |
| `RETRIEVAL_V5` | OFF (VERIFIED) | UNVERIFIED |
| `TAPPY_ANSWER_V4`, `CONSULT_V3`, `TAPPY_AGENT` | REPORTED OFF | UNVERIFIED |
| `TAPPY_V4_HOSTED_SEARCH` | REPORTED ON when V4 is on | UNVERIFIED |
| `CONSULTATIVE_V1` | comment says OFF, `product.ts:470-473` returns ON — REPORTED conflict | UNVERIFIED |
| `SNIPPET_PRICE_GUARD_V2` | read from env in `snippetPriceGuardV2Enabled()` | UNVERIFIED |
| `SUBSCRIPTIONS_ENABLED` | OFF (`flags.ts:8-11`, VERIFIED) | UNVERIFIED |
| `SHOW_PRO_UPGRADE` | OFF in code default, enabled via `SHOW_PRO_UPGRADE=1\|true` (`product.ts`, VERIFIED) | UNVERIFIED |

## 5. Test evidence

| Date | SHA | Command / scope | Result | Label |
|---|---|---|---|---|
| 22/10 | `b4d3f03` | `vitest run` on subscription & payment suite: `src/lib/payments/`, `src/app/api/payments/`, `src/components/subscription/`, `src/lib/plans/`, `src/app/api/subscription/`, `src/app/api/cron/subscriptions-expire/` | 22 files, 211/211 pass, exit 0 | VERIFIED |
| 22/10 | `b4d3f03` | `npx tsc --noEmit` (full TypeScript typecheck) | 0 errors, exit 0 | VERIFIED |
| 22/10 | `cfae4a8` | `vitest run` on Apple IAP verify & policy suite (`src/app/api/iap/apple/appleIapPolicy.test.ts`, `src/app/api/config/appleSignInConfig.test.ts`, `src/lib/apple-iap/jws.test.ts`) | 3 files, 42 tests pass, exit 0 | VERIFIED |
| 22/10 | `cfae4a8` | `npx tsc --noEmit` on canonical Web | 0 errors, exit 0 | VERIFIED |
| 22/10 | at commit | `vitest run` on subscription & payment suite + tests (`src/lib/payments/`, `src/app/api/payments/`, `src/components/subscription/`, `src/lib/plans/`, `src/app/api/subscription/`, `src/app/api/cron/subscriptions-expire/`, `src/lib/i18n/paymentsKeys.test.ts`) | 23 files, 213/213 pass, exit 0 | VERIFIED |
| 22/10 | at commit | `npx tsc --noEmit` on canonical Web | 0 errors, exit 0 | VERIFIED |
| 22/10 | `4cf4816` (iOS) | `static_check.py` on `wtk-ios` (`strings_catalog`, `plists`, `secrets`) | 1793 xcstrings keys valid, 0 missing Swift keys, plists valid, no tracked secrets | VERIFIED |
| 22/10 | `6816cb2` | `vitest run --project app` on `moneyGuard.test.ts`, `moneyGuardClauseFragment.test.ts`, `moneyGuardDecimalComma.test.ts`, `moneyGuardMetres.test.ts`, `travelGuard.test.ts`, `priceDateRange.settle.test.ts` | 6 files, 246/246 pass, exit 0 | VERIFIED |
| 22/10 | `6816cb2` + uncommitted S5h3 test | the new test `S5h3 settle preserves a verified 387000 VND fare through the stream filter`, filtered by name | FAIL, exit 1: output was only the travel notice; telemetry `place_claim`, `ordering: 1`, `sentences_removed: 1` | VERIFIED |
| 22/10 | `b966bef` + the S5h3 fix (the fix commit that follows it) | `vitest run --project app src/lib/ai/priceDateRange.settle.test.ts` | 1 file, 60/60 pass, exit 0 (58 earlier cases incl. the stream test, plus 2 new) | VERIFIED |
| 22/10 | same | `vitest run --project app` on `placeClaimGuard.test.ts`, `placeClaimGuard.v2.test.ts`, `placeClaimGuardMachineSpans.test.ts`, `placeClaimFallback.test.ts`, `placeClaimNoToolFollowUp.test.ts`, `placeClaimPopularityScope.test.ts`, `placeClaimRatingEvidence.test.ts` | 7 files, 90 pass + 2 expected-fail (already marked in those files), exit 0 | VERIFIED |

The 246 pass result did not show S5h3 was safe: it only exercised the direct guard and the option-off `redactUnsupportedClaims` unit, not the stream path. The stream test is what exposed the loss, and it failed before the fix.

Stream results after the fix (from the test's recorded output): the reply `Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.` becomes `Đặt qua app hoặc website, Vietjet 387.000 VND.` plus the travel notice (387.000 kept, 99.000 gone). With an extra venue claim `Các quán quanh sân bay đều có giao hàng tận nhà.` and a safe sentence, the venue claim is removed (`ordering: 1`), the safe sentence stays. Not run: the full suite, database suites, build, lint, typecheck, benchmarks.

## 6. Open gates

| Gate | Status | Notes |
|---|---|---|
| `TG-VERIFIED-LOSS-PRE-01` | FIXED for the S5h3 stream scenario (owner accepted `844f5b7` at that level on 22/10); NOT CLOSED, owner is reviewing the diff of `844f5b7` | Fix: `placeClaimGuard.isOrderingClaim` (see below). Other phrasings that might reach the place guard on a travel turn are not tested. Close only on the owner's word. |
| `S5h3 settle` | FIXED, regression-tested | Stream test passes after the fix and failed before it. The test is committed with the fix. |
| `MG-OPTION-OFF-VERIFIED-LOSS-01` (new, created 22/10 by owner request) | OPEN, no code changed | See the section right after this table. |
| `RS-3-LEGACY-RESIDUE` | OPEN, undefined | The full ID is not in source. Only the label "RS-3" appears in comments at `priceDateRange.settle.test.ts` (lines 212, 224). No test found. Do not invent a definition. |
| `PLACE-ORDERING-EMPTY-01` | OPEN, undefined | Not in source or tests. |
| Phase 3 specification | MISSING | `docs/audit/PHASE-3-IMPLEMENTATION-SPECIFICATION.md` is referenced by code comments but exists in no ref checked (HEAD, `origin/main`, `git log --all`). |
| Phase 3A overall | NOT COMPLETE | S5h3 is fixed and tested, but the spec is missing and `RS-3-LEGACY-RESIDUE` and `PLACE-ORDERING-EMPTY-01` are undefined. Nothing here claims Phase 3A is done. |
| `anonymousSessionIdentity` test red at canonical; `cronAuth` (2) and `costRouteCoverage` (1) red | OPEN | REPORTED (Phase M / J). |

S5h3 root cause (fixed): the travel guard keeps the verified fare (`travelFares` from the `get_flight_prices` snippet, via `streamEnrichment.ts` lines 4336-4340), then the place-claim guard (`placeGuardOn` includes `travelIntent`, `streamEnrichment.ts:2896-2922`) treats "Đặt qua app hoặc website, …" as an ordering claim (`isOrderingClaim`, `placeClaimGuard.ts:185-197`; rule 1c at `:872-878`, `orderablePlaces` empty) and removes the whole sentence, fare included. VERIFIED: the test failure and the telemetry before the fix, and the pass after it. INFERRED: that this is the only cause on the stream path (other guards did not remove the sentence in the tested scenario).

The fix (`placeClaimGuard.ts`): `isOrderingClaim` returns false for a sentence that OPENS with the instruction "Đặt qua app / website / web / ứng dụng / hotline" (generic channels only, `BOOKING_CHANNEL_ADVICE_RE`) when nothing else in the sentence is ordering vocabulary. Possession wording still wins and is checked first. A named platform ("Đặt qua GrabFood"), "đặt qua app thì quán giao tận nhà", "có giao hàng tận nhà" and "có thể order qua GrabFood" are still claims. Rule 1c itself, the place guard and the price verification are unchanged. `isOrderingClaim` is the single predicate shared by the guard and the early-stream hold-back (`mayRedactPlaceClaim`), so both now agree.

### Gate `MG-OPTION-OFF-VERIFIED-LOSS-01` — option-off branch of `moneyGuard.redactUnsupportedClaims`

- What: when `redactUnsupportedClaims` is called WITHOUT `noAmountOnlyFallback`, `cutAroundVerified` is skipped (`moneyGuard.ts:767`) and the clause path (`removeClauseAround`) runs for each unverified claim. If no clause delimiter separates a verified amount from an unverified one in the same sentence, the cut runs from the delimiter before the verified amount to the end of the sentence and takes the verified amount with it. Example pinned by a test: `Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.` becomes `Đặt qua app hoặc website.` with 387.000 marked VERIFIED. VERIFIED by reading the code and by the passing unit test `priceDateRange.settle.test.ts:298` ("other callers (option off) keep the former path…"), which asserts the loss as expected output.
- Who reaches it: `guardMoneyClaimsInText` (`moneyGuard.ts`), called from `streamEnrichment.ts:2714-2715`, enforced only when the turn's `productRecords` carry a structured price. Only `travelGuard.ts` passes `noAmountOnlyFallback: true`. `snippetPriceGuard.ts` passes `wholeSentence: true`, a different branch. The doc comment on `RedactOptions.noAmountOnlyFallback` in `moneyGuard.ts` (Round 42 round 3) says option-off is the former behaviour kept on purpose for every other caller (VERIFIED by reading it).
- Reachability from a real turn with a verified amount next to an unverified one: UNVERIFIED. No stream-level test exercises it. Nothing found says a travel turn reaches it (there `productRecords` is normally empty), but a turn that mixes product records and a verified amount has not been tested.
- Status: OPEN. No code changed for this gate. `moneyGuard.ts` was outside the files allowed for the S5h3 fix.
- Before any fix: (1) show reachability, by a stream-level test or by tracing which turns give `guardMoneyClaimsInText` structured prices plus a verified amount; (2) the fix option is to run `cutAroundVerified` for every caller whenever the sentence holds a verified claim, falling back to the clause path when it returns null; (3) the test at `:298` pins the loss today, so changing its expected output needs the assertion-by-assertion review and mutation proof the owner asked for on test-expectation changes, not just a green test; (4) callers affected: `guardMoneyClaimsInText` and its tests (`moneyGuard.test.ts`, `moneyGuardClauseFragment.test.ts`, `moneyGuardDecimalComma.test.ts`).
- Closing needs the owner's decision: fix, or accept the behaviour with the reason written here.

### Web Subscription & Entitlement Architecture (P7/P8)

- Web subscription is implemented behind `SUBSCRIPTIONS_ENABLED` (default OFF in code).
- Model: 5 paid plans (Pip, Momo, Coco, Milo, Sunny) with durations (7d, 30d, 90d, 180d, 365d), fixed VND prices in `subscriptionPrices.json`.
- Pip is a lifetime one-time trial enforced in the database (`p7_pip_used`, `entitlement_ledger_pip_once`).
- Order flow: `POST /api/payments/orders` creates a pending order with code `TAPPYxxxxxx` (15-min TTL, at most 3 pending).
- Payment webhook: `POST /api/payments/sepay` verifies HMAC-SHA256 signature over raw body, 5-minute skew window, and receiving bank account. Calls `p8_payments_apply_sepay` RPC which atomically grants the plan via `p8_apply_entitlement` (`subscriptions` table + append-only `entitlement_ledger` with unique `external_ref` idempotency).
- Shared account entitlement: Single authority `subscriptions` table. Read by `getEntitlement` and `/api/subscription`. `SUBSCRIPTION_COLUMNS` includes `source`.
- Cross-platform entitlement: Accounts that buy on Web receive `isPro: true` when logging into iOS or Android via `GET /api/subscription`.
- Separation from Apple IAP: Web subscription does NOT implement iOS in-app purchases. StoreKit 2 provider, `/api/iap/apple/verify`, App Store server notifications, and Apple Review Guideline 3.1.1 compliance are deferred to a dedicated iOS implementation phase per ADR-006.

## 7. Owner decisions pending

REPORTED (Phase N `OWNER-DECISIONS.md`): D1 keep or remove `wtios-fix`; D2 approve the `anonymousSessionIdentity` expectation change and anonymous clarify-credit policy under `CONSULT_V3`; D3 worktrees with large uncommitted data; D4 Android version live on Play; D5 Android release with the gallery-scan fix; D6 push iOS for macOS CI; D7 deploy canonical web and migration 20261018 status; D8 clarify-credit debt; D9 persist `decisionEvidenceId` across chat reopen.

From the 22/10 audit: source of the Phase 3 spec; production flag values; Serper daily cap; "chill" persona versus the V3 persona; Retrieval V5 continue or stop; OpenAI hosted search keep or drop; mobile release of ADR-024 and quota changes; music on Android; plan A or B for selective page reading.

Decided 22/10: `844f5b7` is accepted at "FIXED for the S5h3 stream scenario, awaiting owner review"; `TG-VERIFIED-LOSS-PRE-01` stays open until the owner has reviewed the full diff. Pending from the owner: close `TG-VERIFIED-LOSS-PRE-01`; decide fix or accept for `MG-OPTION-OFF-VERIFIED-LOSS-01`.

A decision is closed only when the owner states it or evidence shows it.

## 8. Change log

- 2026-10-22: file created; canonical `6816cb2`; S5h3 stream test failing and uncommitted.
- 2026-10-22: gate `MG-OPTION-OFF-VERIFIED-LOSS-01` created (docs only, no code change); owner accepted `844f5b7` as FIXED-pending-review, `TG-VERIFIED-LOSS-PRE-01` not closed. At this time the worktree also held uncommitted changes made by someone else (`src/app/api/subscription/route.ts`, `src/lib/plans/entitlement.ts`, new payments and entitlement test files); they are not part of this work and were left untouched.
- 2026-10-22: S5h3 fixed in `placeClaimGuard.ts`; stream test and two companion tests committed with the fix; `TG-VERIFIED-LOSS-PRE-01` and `S5h3 settle` moved to FIXED. Nothing pushed, deployed or changed in production.
- 2026-10-22: Web subscription completed under `SUBSCRIPTIONS_ENABLED` flag (default OFF); common entitlement foundation strengthened in `src/lib/plans/entitlement.ts` (`SUBSCRIPTION_COLUMNS` includes `source`) and `src/app/api/subscription/route.ts` (`source` surfaced); 6 new regression test suites added (22 test files, 211 tests pass, exit 0); TypeScript check clean (0 errors); Apple IAP preserved as separate future iOS phase.
- 2026-10-22: Apple IAP backend verification compliance for Guideline 3.1.1: `src/lib/apple-iap/transactionPolicy.ts` expanded to recognize all catalog products (`com.tappyai.ios.pro.monthly`, `tappy_momo_1m`, etc.); `src/app/api/iap/apple/verify/route.ts` updated to map store products via `planForStoreProduct`, record `source: 'apple_iap'`, and integrate with `p8_apply_entitlement` / `entitlement_ledger`; `SHOW_PRO_UPGRADE` feature flag supported via env `SHOW_PRO_UPGRADE=1|true` (default OFF in code) in `src/lib/config/product.ts` and `src/app/api/config/route.ts`; tests in `appleIapPolicy.test.ts` (16/16 pass) and `appleSignInConfig.test.ts` (14/14 pass); TypeScript check clean (0 errors).
- 2026-10-22: Web subscription pricing standardized in fixed VND across `/subscription` and related components: replaced USD prices ($1, $7, $19, $36, $66) with fixed VND prices (29.000đ, 179.000đ, 489.000đ, 939.000đ, 1.719.000đ) and durations (/ 7 ngày, / 1 tháng, / 3 tháng, / 6 tháng, / 12 tháng) in `SubscriptionFlow.tsx`; updated Sunny approximate monthly display to `143.000đ / tháng` using `monthlyApproxVnd`; streamlined checkout charged string in `payments.ts` to remove USD parenthetical; updated `SubscriptionFlow.test.tsx` assertions; 23 test files (213/213) pass and TypeScript check clean (0 errors).
