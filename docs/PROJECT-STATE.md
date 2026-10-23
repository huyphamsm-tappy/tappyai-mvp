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
| Web (canonical) | `D:/TappyAI-wt/wt-integration` | `integration/canonical-20261020` | `62e49df` | VERIFIED (`git rev-parse HEAD`, 22/10) |
| Android | `D:/TappyAI-wt/wtk-android` | `android/phase-k-web-parity` | `b6bf3a7` | VERIFIED by `rev-parse` at the start of the 22/10 session; not re-checked since |
| iOS | `D:/TappyAI-wt/wtk-ios` | `ios/phase-k-web-parity` | `75fa9bb` | VERIFIED (`git rev-parse HEAD`, 22/10) |

- `origin/main` local remote-tracking ref: `b8d5b2850afcc0449415105e0d29bdd8ede62194`. VERIFIED as the existing local ref (no fetch). It is an ancestor of canonical HEAD; canonical is 287 commits ahead, `origin/main` has none canonical lacks (VERIFIED, `merge-base` / `rev-list`). This ref does not prove which SHA runs in production.
- Registered worktrees: 34 at the 22/10 check (VERIFIED, `git worktree list`). Not guaranteed to be current later.
- Mobile: Android 1185 unit tests pass at `b6bf3a7` — REPORTED (Phase M). iOS was never compiled or tested (no macOS) — REPORTED. Mobile production lines (`wtandroid`, `wtios`) lack ADR-024, the new marker parsing and the new quota — REPORTED.

## 2. Production

| Item | Status |
|---|---|
| SHA running in production | `428193672b4eae36310a9d498423ed9f6d1aa597` (VERIFIED via `https://www.tappyai.com/api/version`, 22/10) |
| Feature-flag values on Vercel | `SHOW_PRO_UPGRADE=1` (VERIFIED via `/api/config`), `APPLE_IAP_ALLOW_SANDBOX` opt-in default OFF |
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
| `APPLE_IAP_ALLOW_SANDBOX` | OFF in code default, opt-in via `APPLE_IAP_ALLOW_SANDBOX=1\|true`; Production only by default | UNVERIFIED |

## 5. Test evidence

| Date | SHA | Command / scope | Result | Label |
|---|---|---|---|---|
| 22/10 | `b4d3f03` | `vitest run` on subscription & payment suite: `src/lib/payments/`, `src/app/api/payments/`, `src/components/subscription/`, `src/lib/plans/`, `src/app/api/subscription/`, `src/app/api/cron/subscriptions-expire/` | 22 files, 211/211 pass, exit 0 | VERIFIED |
| 22/10 | `b4d3f03` | `npx tsc --noEmit` (full TypeScript typecheck) | 0 errors, exit 0 | VERIFIED |
| 22/10 | `cfae4a8` | `vitest run` on Apple IAP verify & policy suite (`src/app/api/iap/apple/appleIapPolicy.test.ts`, `src/app/api/config/appleSignInConfig.test.ts`, `src/lib/apple-iap/jws.test.ts`) | 3 files, 42 tests pass, exit 0 | VERIFIED |
| 22/10 | `cfae4a8` | `npx tsc --noEmit` on canonical Web | 0 errors, exit 0 | VERIFIED |
| 22/10 | `dcb5232` | `vitest run` on subscription & payment suite + tests (`src/lib/payments/`, `src/app/api/payments/`, `src/components/subscription/`, `src/lib/plans/`, `src/app/api/subscription/`, `src/app/api/cron/subscriptions-expire/`, `src/lib/i18n/paymentsKeys.test.ts`) | 23 files, 213/213 pass, exit 0 | VERIFIED |
| 22/10 | `dcb5232` | `npx tsc --noEmit` on canonical Web | 0 errors, exit 0 | VERIFIED |
| 22/10 | `d508c31` | `vitest run` on appleIapPolicy & appleSignIn suite (`src/app/api/iap/apple/appleIapPolicy.test.ts`, `src/app/api/config/appleSignInConfig.test.ts`, `src/lib/apple-iap/jws.test.ts`) | 3 files, 46 tests pass, exit 0 | VERIFIED |
| 22/10 | `d508c31` | `vitest run` on full subscription & payment suite (23 files, 213 tests) | 23 files, 213/213 pass, exit 0 | VERIFIED |
| 22/10 | `d508c31` | `npx tsc --noEmit` on canonical Web | 0 errors, exit 0 | VERIFIED |
| 22/10 | `8cd9cf6` | `vitest run` on Apple IAP suites (`appleIapPolicy.test.ts`, `api.test.ts`, `jws.test.ts`) | 3 files, 52/52 pass, exit 0 | VERIFIED |
| 22/10 | `8cd9cf6` | `vitest run` on full subscription & payment suite (25 files, 263 tests) | 25 files, 263/263 pass, exit 0 | VERIFIED |
| 22/10 | `8cd9cf6` | `npx tsc --noEmit` on canonical Web | 0 errors, exit 0 | VERIFIED |
| 22/10 | `4281936` (prod) | PR #271 merged into main, all required CI checks passed (Test suite, Types/lint/SQL grants, AI architecture rules, Brand registry validation); Vercel deployment verified via `https://www.tappyai.com/api/version` | VERIFIED |
| 22/10 | `75fa9bb` (iOS) | offline static check on `wtk-ios` (`strings_catalog`, `plists`, `secrets`) | 1793 xcstrings keys valid, 0 missing Swift keys, plists valid, no tracked secrets | VERIFIED |
| 22/10 | `1910981` (iOS) | offline static check on `wtk-ios` (`strings_catalog`, `plists`, `secrets`) | 1793 xcstrings keys valid, 0 missing Swift keys, plists valid, no tracked secrets | VERIFIED |
| 22/10 | `4cf4816` (iOS) | `static_check.py` on `wtk-ios` (`strings_catalog`, `plists`, `secrets`) | 1793 xcstrings keys valid, 0 missing Swift keys, plists valid, no tracked secrets | VERIFIED |
| 22/10 | `6816cb2` | `vitest run --project app` on `moneyGuard.test.ts`, `moneyGuardClauseFragment.test.ts`, `moneyGuardDecimalComma.test.ts`, `moneyGuardMetres.test.ts`, `travelGuard.test.ts`, `priceDateRange.settle.test.ts` | 6 files, 246/246 pass, exit 0 | VERIFIED |
| 22/10 | `6816cb2` + uncommitted S5h3 test | the new test `S5h3 settle preserves a verified 387000 VND fare through the stream filter`, filtered by name | FAIL, exit 1: output was only the travel notice; telemetry `place_claim`, `ordering: 1`, `sentences_removed: 1` | VERIFIED |
| 22/10 | `b966bef` + the S5h3 fix (the fix commit that follows it) | `vitest run --project app src/lib/ai/priceDateRange.settle.test.ts` | 1 file, 60/60 pass, exit 0 (58 earlier cases incl. the stream test, plus 2 new) | VERIFIED |
| 22/10 | same | `vitest run --project app` on `placeClaimGuard.test.ts`, `placeClaimGuard.v2.test.ts`, `placeClaimGuardMachineSpans.test.ts`, `placeClaimFallback.test.ts`, `placeClaimNoToolFollowUp.test.ts`, `placeClaimPopularityScope.test.ts`, `placeClaimRatingEvidence.test.ts` | 7 files, 90 pass + 2 expected-fail (already marked in those files), exit 0 | VERIFIED |
| 22/10 | `e569b9b` (baseline, before the new tests) | `./node_modules/.bin/vitest run --project app src/lib/ai/priceDateRange.settle.test.ts`, and the same seven `placeClaim*.test.ts` files | settle 1 file, 60/60 pass, exit 0; placeClaim 7 files, 90 pass + 2 expected-fail, exit 0 | VERIFIED |
| 22/10 | `e569b9b` + the four tests added in the commit that follows | first run of `priceDateRange.settle.test.ts` | exit 1: 63 pass, 1 fail. The failing test was the new `PLACE-ORDERING-EMPTY-01 (consultative ON)`: my own over-strict assertion that EVERY output line ends with sentence punctuation also hit the source line the stream adds with the flag ON (`Giá theo kết quả tìm kiếm của: [example.test](…)`). Output was `Đặt qua app hoặc website, Vietjet 387.000 VND.` plus that source line: fare kept, body not empty. Not a product defect | VERIFIED |
| 22/10 | same, after the assertion was corrected (prose lines must end like sentences; the citation line must name the fixture host) | `priceDateRange.settle.test.ts` verbose; then the seven `placeClaim*.test.ts` files | settle 64/64 pass, exit 0 (the four new tests below pass); placeClaim 7 files, 90 pass + 2 expected-fail, exit 0 | VERIFIED |

New tests in `priceDateRange.settle.test.ts` (all through `applyPlaceEnrichmentStreamFilter`, flag = `settle`'s third argument, which sets `collector.consultative`): `S5h3 settle (consultative ON) preserves a verified 387000 VND fare through the stream filter`; `S5h3 settle (consultative ON): the unverified fare and an unbacked venue ordering claim still go, unrelated prose stays`; `PLACE-ORDERING-EMPTY-01 (consultative OFF)` and `(consultative ON)`: a reply that is only `Đặt qua app hoặc website, Vietjet 387.000 VND.` keeps the fare, is not empty, has no venue ordering claim and no fragment. The OFF S5h3 test and its companions from `844f5b7` are unchanged.

The 246 pass result did not show S5h3 was safe: it only exercised the direct guard and the option-off `redactUnsupportedClaims` unit, not the stream path. The stream test is what exposed the loss, and it failed before the fix.

Stream results after the fix (from the test's recorded output): the reply `Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.` becomes `Đặt qua app hoặc website, Vietjet 387.000 VND.` plus the travel notice (387.000 kept, 99.000 gone). With an extra venue claim `Các quán quanh sân bay đều có giao hàng tận nhà.` and a safe sentence, the venue claim is removed (`ordering: 1`), the safe sentence stays. Not run: the full suite, database suites, build, lint, typecheck, benchmarks.

## 6. Open gates

| Gate | Status | Notes |
|---|---|---|
| `TG-VERIFIED-LOSS-PRE-01` | OPEN. A candidate fix exists on canonical only: `844f5b7` (`placeClaimGuard.isOrderingClaim`, see below). **`844f5b7` is not approved by the owner and is not an integration input by default**; it is not in production-main `4281936`. Options a/b/c of the Round 42 brief await the owner's choice | Candidate fix: `placeClaimGuard.isOrderingClaim` (see below). Other phrasings that might reach the place guard on a travel turn are not tested. Close only on the owner's word. The Round 42 pass criterion is "the verified fare survives the direct call AND settle under both flags": settle is now tested under flag OFF and ON (see section 5). The register's option (b), which cuts only the ordering clause and keeps `Vietjet 387.000 VND.`, was the brief's recommendation; `844f5b7` is a lexical variant that is not one of a/b/c (closest to a). The owner's choice among a/b/c is not recorded in the repo, and `844f5b7` has not been approved. |
| `S5h3 settle` | OPEN. Regression tests under flag OFF and ON exist on canonical and passed on the 22/10 runs (VERIFIED by test run); the code they exercise (`844f5b7`) is not approved and not in production-main `4281936` | Stream test passes with `844f5b7` and failed before it (OFF). The ON variants were added afterwards and pass without any code change. The tests do not make `844f5b7` an approved integration input. |
| `MG-OPTION-OFF-VERIFIED-LOSS-01` (new, created 22/10 by owner request) | OPEN. Implemented locally behind the flag `MONEY_GUARD_KEEP_VERIFIED` (default OFF); not enabled in any environment | See the section right after this table. |
| `RS-3-LEGACY-RESIDUE` | OPEN, not fixed | Not in source as a full ID; the label "RS-3" is in comments of `priceDateRange.settle.test.ts` (the default-unchanged test and `RS-3 probe — legacy place path, v1 vs v2`, which only records). Definition REPORTED, outside the repo (`D:/TappyAI-backups/release/round42-evidence/master-bug-register.md` and `cons-decision-brief.md` section c5, 13/10): on the legacy place path with no pick, the output is the clipped sentence `Phở Hòa có giá /tô.`. Legacy means `TAPPY_AGENT` is not 1 or 2 and `SNIPPET_PRICE_GUARD_V2` is off (default off, `product.ts`, VERIFIED). Whether production runs this path: UNVERIFIED. The filler sentence is not approved. No fix, no asserting test. |
| `PLACE-ORDERING-EMPTY-01` | OPEN: the reported case is covered, the general safety net is not built | Definition REPORTED, outside the repo (same register, 13/10): a reply that is only the verified fare behind "Đặt qua…" had its whole sentence removed by rule 1c, leaving an empty body with the flag OFF. With `844f5b7` (not approved by the owner, canonical only) that exact reply survives under flag OFF and ON (new tests, section 5; VERIFIED by test run on canonical). Not done: a general "never an empty body" net (register option c needs owner-approved wording, no wording was invented here). Sources of an empty body other than rule 1c are not tested. |
| Phase 3 specification | MISSING | `docs/audit/PHASE-3-IMPLEMENTATION-SPECIFICATION.md` is referenced by code comments but exists in no ref checked (HEAD, `origin/main`, `git log --all`). |
| Phase 3A overall | NOT COMPLETE | S5h3 is fixed and tested under both flags, but the spec is missing, `RS-3-LEGACY-RESIDUE` is open, and `PLACE-ORDERING-EMPTY-01` has no general safety net. Nothing here claims Phase 3A is done. |
| `anonymousSessionIdentity` test red at canonical; `cronAuth` (2) and `costRouteCoverage` (1) red | OPEN | REPORTED (Phase M / J). |

S5h3 root cause (fixed): the travel guard keeps the verified fare (`travelFares` from the `get_flight_prices` snippet, via `streamEnrichment.ts` lines 4336-4340), then the place-claim guard (`placeGuardOn` includes `travelIntent`, `streamEnrichment.ts:2896-2922`) treats "Đặt qua app hoặc website, …" as an ordering claim (`isOrderingClaim`, `placeClaimGuard.ts:185-197`; rule 1c at `:872-878`, `orderablePlaces` empty) and removes the whole sentence, fare included. VERIFIED: the test failure and the telemetry before the fix, and the pass after it. INFERRED: that this is the only cause on the stream path (other guards did not remove the sentence in the tested scenario).

The fix (`placeClaimGuard.ts`): `isOrderingClaim` returns false for a sentence that OPENS with the instruction "Đặt qua app / website / web / ứng dụng / hotline" (generic channels only, `BOOKING_CHANNEL_ADVICE_RE`) when nothing else in the sentence is ordering vocabulary. Possession wording still wins and is checked first. A named platform ("Đặt qua GrabFood"), "đặt qua app thì quán giao tận nhà", "có giao hàng tận nhà" and "có thể order qua GrabFood" are still claims. Rule 1c itself, the place guard and the price verification are unchanged. `isOrderingClaim` is the single predicate shared by the guard and the early-stream hold-back (`mayRedactPlaceClaim`), so both now agree.

### Gate `MG-OPTION-OFF-VERIFIED-LOSS-01` — option-off branch of `moneyGuard.redactUnsupportedClaims`

- What: when `redactUnsupportedClaims` is called WITHOUT `noAmountOnlyFallback`, `cutAroundVerified` is skipped (`moneyGuard.ts:767`) and the clause path (`removeClauseAround`) runs for each unverified claim. If no clause delimiter separates a verified amount from an unverified one in the same sentence, the cut runs from the delimiter before the verified amount to the end of the sentence and takes the verified amount with it. Example pinned by a test: `Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.` becomes `Đặt qua app hoặc website.` with 387.000 marked VERIFIED. VERIFIED by reading the code and by the passing unit test `priceDateRange.settle.test.ts:298` ("other callers (option off) keep the former path…"), which asserts the loss as expected output.
- Who reaches it: `guardMoneyClaimsInText` (`moneyGuard.ts`), called from `streamEnrichment.ts:2714-2715`, enforced only when the turn's `productRecords` carry a structured price. Only `travelGuard.ts` passes `noAmountOnlyFallback: true`. `snippetPriceGuard.ts` passes `wholeSentence: true`, a different branch. The doc comment on `RedactOptions.noAmountOnlyFallback` in `moneyGuard.ts` (Round 42 round 3) says option-off is the former behaviour kept on purpose for every other caller (VERIFIED by reading it).
- Reachability from a real turn with a verified amount next to an unverified one: UNVERIFIED. Trace (read-only, 22/10, `e569b9b`): `guardMoneyClaimsInText` returns the text untouched unless some record has a structured price (`structuredPrice`, `moneyGuard.ts`); `productRecords` is filled only from `search_products` results (`streamEnrichment.ts` around 4372-4380) and from a seeded `TurnEvidence` (around 2258). The travel fares of the S5h3 case come from `get_flight_prices`, which never fills it. So the option-off cut is reachable on a shopping turn whose product rows carry a price, not on a pure travel turn. A turn mixing `search_products` and travel fares has not been tested. Tests that call `guardMoneyClaimsInText` (`moneyGuard.test.ts`, shopping cases) exist; none found puts a verified and an unverified amount in one delimiter-free sentence, and no stream-level test does. The gate is not reproduced on a real path, so it stays OPEN and nothing is closed.
- Status: OPEN. Implemented locally in `moneyGuard.ts` behind the flag `MONEY_GUARD_KEEP_VERIFIED` (default OFF; ON only for `1` or `true` after a trim, read at call time by `moneyGuardKeepVerifiedEnabled`). The flag is not enabled in any environment. Not pushed. VERIFIED (code and commit).
- Local evidence: the loss was reproduced through `applyPlaceEnrichmentStreamFilter` with the consultative flags at their source defaults (`CONSULTATIVE_V1` and `CONSULT_V2` ON); the collector fields `consultTurn`, `consultDomain` and `rendersCard` were INFERRED, not taken from a real request. After the change: `tsc --noEmit` exit 0 and `moneyGuard.test.ts` 155/155 (15 new tests); 20 related test files passed in the earlier run (494 passed, 2 expected-fail). VERIFIED by test run.
- Production occurrence and frequency of the loss: UNVERIFIED.
- Scope of the guarantee: only inside `redactUnsupportedClaims`, only for callers without `wholeSentence` or `noAmountOnlyFallback` (so `travelGuard` and `snippetPriceGuard` are unchanged). Overlapping claims are fail-closed: an unverified amount never survives and the verified amount may be lost (accepted exception, pinned by a test). The number-only fallback can leave a dangling fragment in rare cases. VERIFIED by test run.
- Not addressed: later stream stages (`travel`, `place_claim`, `consultative_v1` `tidyBudget` and `fragmentLine`, and others not read) can still remove valid prices. INFERRED from reading the stream filter; not tested.
- Unchanged and not approved by this change: `844f5b7`, and `TG-VERIFIED-LOSS-PRE-01` (blocked for the flight-fare variant). No priority ranking was set.
- Next step: enabling the flag needs the owner's approval and verification in a test environment.
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

Corrected 22/10 (owner instruction, supersedes the earlier wording): `844f5b7` is **not approved by the owner** and is not an integration input by default. No guard fix is to be merged, cherry-picked or promoted to `main` while the current deployment is not stable; the owner will decide timing and method separately. `TG-VERIFIED-LOSS-PRE-01` is OPEN. Pending from the owner: choose option a/b/c for `TG-VERIFIED-LOSS-PRE-01`; decide fix or accept for `MG-OPTION-OFF-VERIFIED-LOSS-01`. (An earlier message in this session approved `844f5b7` only at the level "FIXED for the S5h3 stream scenario, awaiting owner review", and it is kept here as history only.)

A decision is closed only when the owner states it or evidence shows it.

## 8. Change log

- 2026-10-22: file created; canonical `6816cb2`; S5h3 stream test failing and uncommitted.
- 2026-10-22: gate `MG-OPTION-OFF-VERIFIED-LOSS-01` created (docs only, no code change); an earlier owner message in the session approved `844f5b7` only as "FIXED-pending-review" (superseded by the correction recorded below: `844f5b7` is not approved), `TG-VERIFIED-LOSS-PRE-01` not closed. At this time the worktree also held uncommitted changes made by someone else (`src/app/api/subscription/route.ts`, `src/lib/plans/entitlement.ts`, new payments and entitlement test files); they are not part of this work and were left untouched.
- 2026-10-22: S5h3 fixed in `placeClaimGuard.ts`; stream test and two companion tests committed with the fix; `TG-VERIFIED-LOSS-PRE-01` and `S5h3 settle` were then recorded as FIXED (history; superseded). Correction, same day: `844f5b7` is not approved by the owner for integration and is not in production-main `4281936`; both gates are OPEN and no guard fix is to be merged, cherry-picked or promoted to `main` until the owner decides. Nothing pushed, deployed or changed in production.
- 2026-10-22: Web subscription completed under `SUBSCRIPTIONS_ENABLED` flag (default OFF); common entitlement foundation strengthened in `src/lib/plans/entitlement.ts` (`SUBSCRIPTION_COLUMNS` includes `source`) and `src/app/api/subscription/route.ts` (`source` surfaced); 6 new regression test suites added (22 test files, 211 tests pass, exit 0); TypeScript check clean (0 errors); Apple IAP preserved as separate future iOS phase.
- 2026-10-22: Apple IAP backend verification compliance for Guideline 3.1.1: `src/lib/apple-iap/transactionPolicy.ts` expanded to recognize all catalog products (`com.tappyai.ios.pro.monthly`, `tappy_momo_1m`, etc.); `src/app/api/iap/apple/verify/route.ts` updated to map store products via `planForStoreProduct`, record `source: 'apple_iap'`, and integrate with `p8_apply_entitlement` / `entitlement_ledger`; `SHOW_PRO_UPGRADE` feature flag supported via env `SHOW_PRO_UPGRADE=1|true` (default OFF in code) in `src/lib/config/product.ts` and `src/app/api/config/route.ts`; tests in `appleIapPolicy.test.ts` (16/16 pass) and `appleSignInConfig.test.ts` (14/14 pass); TypeScript check clean (0 errors).
- 2026-10-22: Web subscription pricing standardized in fixed VND across `/subscription` and related components: replaced USD prices ($1, $7, $19, $36, $66) with fixed VND prices (29.000đ, 179.000đ, 489.000đ, 939.000đ, 1.719.000đ) and durations (/ 7 ngày, / 1 tháng, / 3 tháng, / 6 tháng, / 12 tháng) in `SubscriptionFlow.tsx`; updated Sunny approximate monthly display to `143.000đ / tháng` using `monthlyApproxVnd`; streamlined checkout charged string in `payments.ts` to remove USD parenthetical; updated `SubscriptionFlow.test.tsx` assertions; 23 test files (213/213) pass and TypeScript check clean (0 errors).
- 2026-10-22: Apple IAP mapping & StoreKit 2 integration finalized across Web and iOS: in `transactionPolicy.ts` and `verify/route.ts`, unmapped product IDs are strictly rejected with 400 `invalid_product` without defaulting to Momo; `appAccountToken` is validated against user ID; `notifications/route.ts` integrates `DID_RENEW` and `REFUND`/`REVOKE` with `p8_apply_entitlement` (mode: `extend_to` and `revoke_store`); on iOS (`1910981`), `StoreKitProvider` binds `session.userId` as `appAccountToken`, `SubscriptionView` removes 99K fallback, and `Products.storekit` configuration adds all 5 catalog subscriptions; `appleIapPolicy.test.ts` expanded to 20/20 pass; full payments/subscriptions suite (23 files, 213/213) pass; `tsc` clean (0 errors).
- 2026-10-22: StoreKit configuration aligned with canonical VND pricing in `wtk-ios` (`75fa9bb`): updated `com.tappyai.ios.pro.monthly` in `Products.storekit` from legacy 99K to 179.000đ (`179000`) and replaced "unlimited" description with quota v2 30 questions/day ("30 câu hỏi AI mỗi ngày" / "30 AI questions daily") matching Momo 1-month plan; static checks verified (1793 keys valid, 0 missing Swift keys, plists valid, no tracked secrets).
- 2026-10-22: Final security patch for Apple IAP H1/H2: (H1) Authoritative Product ID derived strictly from verified Apple transaction payload in verify route (rejecting client-sent product mismatch with 400 invalid_product and enforcing targetPlan derivation from verifiedProductId); (H2) APPLE_IAP_ALLOW_SANDBOX enforced as opt-in flag, default OFF across all code paths (POST /api/iap/apple/verify, App Store Server API fallback getSubscriptionStatuses with 4040010 check, and Server Notifications v2 in notifications/route.ts); unit test suites added/updated in transactionPolicy, verify, notifications, and new api.test.ts (52/52 Apple IAP tests pass; full 25 test files, 263/263 pass; tsc clean 0 errors).
- 2026-10-22: Merged PR #271 (`fix(iap): enforce authoritative product mapping and opt-in sandbox policy`) into `main` at commit `4281936`; verified all required checks pass (Test suite, Types/lint/SQL grants, AI architecture rules, Brand registry validation); Vercel Production deployment confirmed live running `4281936` via `https://www.tappyai.com/api/version`.
- 2026-10-22: Consultative gates, tests only, no production code changed (base `e569b9b`): S5h3 and `PLACE-ORDERING-EMPTY-01` covered through the stream filter under consultative flag OFF and ON (4 new tests in `priceDateRange.settle.test.ts`, all pass); `RS-3-LEGACY-RESIDUE` and `PLACE-ORDERING-EMPTY-01` definitions recorded from the Round 42 register (REPORTED); `MG-OPTION-OFF-VERIFIED-LOSS-01` reachability traced, not reproduced, still OPEN. `TG-VERIFIED-LOSS-PRE-01` stays awaiting owner review. No gate closed.
