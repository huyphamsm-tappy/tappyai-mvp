# MERGE PLAN — `origin/main` (@ `842379b`, incl. age gate #251) → V3 · PLAN ONLY, STOP FOR APPROVAL

**Date:** 2026-09-17 · **Base:** merge-base `f16a71f` · **V3 side:** `fix/g1-place-guard-attribution` @ `a56720f` (= `design/v3-phase4` + G1/G2/G3 + notes + parity fix) · **main side:** 13 commits / 81 files (#248 BUG-011, #249–#251 user-data foundation + age gate, admin DOB correction, onboarding, discovery city). Dry-run `git merge --no-commit --no-ff origin/main`: **10 conflicting files, 19 hunks**; everything else auto-merges. Nothing below has been executed except the parity fix (`a56720f`, its own commit, as asked).

⚠️ The message opened with "[dán RELEASE GUARDRAILS lên đầu]" but no guardrails text followed, and "RELEASE GATE" is referenced without a definition. This plan applies the standing rules (no push, no deploy, no merge to main, flags OFF) and states its gate in §6 from the metrics you have approved so far — paste the guardrails and I will reconcile before anything is executed.

## 1. Mechanics
1. `git fetch origin main`; from the G-branch create `merge/main-into-v3`; `git merge --no-ff origin/main`.
2. Resolve the 10 files per §2 (each rule below names the side and the hand edit). Never take a whole side on `route.ts`, `food.ts` or `ChatInterface.tsx`.
3. `tsc -p tsconfig.json --noEmit` clean; §4 test set green; §3 age-gate tests added and green; `git diff --name-only origin/main HEAD` reviewed for silent reverts (memory rule: a branch behind main reverts silently).
4. Commit the merge; re-run the full `app` project (expect 0 failures now that the parity test is CRLF-safe). STOP — no push.

## 2. Resolution per conflicting file (ours = V3, theirs = main)

| # | File · hunks | What collides | Resolution |
|---|---|---|---|
| 1 | `src/app/(home)/page.tsx` · 2 | V3 imports `HomeV3` (panel grid) and passes `gender` from `user_metadata` + display count 5; main imports `HomeView` + `getDemographics`/`toPromptGender`/`getAgeEligibility`/`redirect` and adds the server-side `/age-check` redirect + canonical gender | **Both, hand-merged:** keep `HomeV3`; add main's three imports; keep main's block `if (user && !user.is_anonymous) { eligibility !== 'eligible' → redirect('/age-check') }` (guests excluded, as main states); take main's `promptGender` from `user_demographics` (drop V3's `user_metadata` read — main's comment explains why); keep V3's 5-card `getDynamicPrompts(…, promptGender, 5)` |
| 2 | `src/app/api/chat/route.ts` · 1 | `Promise.all` tuple: V3 `[chatContext, calendarBlock, subResult]` (quota is a SPEND, deliberately outside the batch); main `[…, todayMsgCount]` + `buildChatPromptContext(user.id, supabase, ageGate.ageBand)` | **V3's tuple + main's `ageGate.ageBand` argument.** Then audit the auto-merged remainder (§3): main's early `if (!user \|\| user.is_anonymous) → 401 auth_required` and `getAgeEligibility` block sit above V3's `consumeAiQuestion`; main's `anon_chat_usage_increment` RPC block and `todayMsgCount >= FREE_DAILY_LIMIT` check must **not** survive beside V3's global quota — exactly one quota path (`lib/ai/quota`) |
| 3 | `src/app/api/reviews/upload/route.ts` · 1 | import line: V3 `MAX_PHOTO_SIZE_MB` vs main `refuseIneligible` | **Both imports**; keep main's `refuseIneligible` call before the rate-limit counter and before `putMedia` (main's stated reason: orphaned storage objects) |
| 4 | `src/app/chat/[id]/ChatConversation.tsx` · 1 | import line: V3 `readSavedContext, SavedMessage` vs main `apiFetch` (age-gate-aware fetch) | **Both imports**; the `/api/conversations` call uses main's `apiFetch` |
| 5 | `src/app/login/page.tsx` · 1 | main adds the email+password form (70 lines) and its guest caption "5 AI questions/day"; V3's caption says `ANON_LIFETIME_LIMIT … lifetime` | **Main's form block + V3's caption** (V3 owns the quota wording: anon 5 lifetime); confirm `handlePasswordSignIn`, `pwEmail/pwPassword/pwError/pwBusy`, `AUTH_PROVIDERS.email`, `SHOW_EMAIL_OTP_IN_CARD` exist on the V3 side (they were added on main in `2c9cd64`; auto-merged parts of the file should carry them — verify, else port) |
| 6 | `src/components/ChatInterface.tsx` · whole file (1949 vs 1718 lines) | git could not 3-way it: V3 rewrote the file (10 commits); main's change is **+30/−1**: `import { isAgeGateMessage, redirectToAgeCheck }` and an error branch `isAgeGateMessage(error.message) ? <age-gate card with stashPendingChat() + redirectToAgeCheck()> : /auth_required\|Unauthorized/…` | **Take V3's file, re-apply main's 30 lines by hand** at V3's error-render branch (find `/auth_required\|Unauthorized/i.test(error.message` in V3's file and insert main's branch before it). Verify `stashPendingChat` and `serverErrorMessage` exist on V3 |
| 7 | `src/lib/ai/tools/food.ts` · 6 | (a) imports: V3 adds `osmCategory` + `overpassResponse`; (b) main's private `cityCoords` table + `DENSE_METRO_KEYS` vs V3's shared `vietnamCities` + `located` flag; (c) V3 `located = false`; (d) GPS radius V3 1500 (measured 2026-09-08: 2000 times out in HCMC) vs main 2000; (e) destination branch: V3 `located = true; radius 1500` vs main `preset && DENSE_METRO_KEYS ? 1500 : 5000`; (f) Google rows: V3's rich row (`rating_value`, `rating_count`, `opening_hours`, `phone`, `price_level`, `price_range`, `lat/lng`, `place_types`, `photo_names`, `distance_km` gated by `!remoteDestination`) vs main's 6-field row with `count: inScope.length` | **V3 for all six** (V3 already contains BUG-011 via `resolveSearchScope`/`remoteDestination`/`inScope`; its rows are what G1/G2 evidence and the cards depend on). From main keep only the `count: inScope.length` semantics if V3's Google branch still reports `d.places.length` (it does — adopt `inScope.length`, one token) |
| 8 | `src/lib/ai/tools/placeDestinationScope.test.ts` · both-added, 3 | same test file written on both sides (V3 29 cases, main 27); radius expectations 1500 vs 2000; V3 adds the Google-branch D2 cases | **V3's file entirely** (superset; radius 1500 is the measured value) |
| 9 | `src/lib/http/apiErrorContract.test.ts` · 1 | allow-list entries: V3 `accountRestrictionCode(restriction.reason!)` vs main `ageEligibilityCode(eligibility.status)` | **Both entries** |
| 10 | `src/lib/i18n/useTranslation.ts` · 2 | V3 spreads `v3vi/v3en`; main spreads `w6vi/w6en` (age-gate strings) | **Both**: import both, spread `…w5, …w6, …v3, …admin…` (v3 after w6 so V3 copy wins on any duplicate key — then run the i18n parity/ratchet tests) |

Auto-merged but must be eyeballed: `route.ts` (see #2), `src/lib/i18n/w6.ts` (new), `supabase/migrations/20260908_user_demographics_foundation.sql` + `20260911_user_memory_discovery_city.sql` (+ rollback) — **owner applies to production via SQL Editor before the V3 release, not by this merge**; `/age-check`, `/onboarding`, `src/lib/account/*`, admin DOB panel — new files, no conflict.

## 3. Age gate #251: enforced before quota and before any model call
Order in the merged `route.ts` must read, for the authenticated path: `getRequestUser` → **`if (!user || user.is_anonymous) → 401 auth_required`** (main) → **`getAgeEligibility` → 403 `age_verification_required` / `age_ineligible`** (main) → Module 08 suspension gate → V3 `consumeAiQuestion` (spend) → memory/context batch → `streamText`. Nothing above the gate may call a provider or the model; nothing may spend quota before it.

**Decision D1 (you):** main #251 states "anonymous sessions … are now refused with `auth_required`"; V3's global quota (`24b9fb8`) gives guests 5 lifetime questions. They cannot both be true for `/api/chat`. Recommendation: **main's rule wins for chat** (the 18+ gate needs an account to evaluate — a guest has no DOB row — so "age gate before any model call" for everyone is only satisfiable by requiring an account); V3's anonymous quota stays for the surfaces that remain anonymous (scam-shield analyze) and its chat branch becomes unreachable, deleted in a follow-up, not in the merge. The login-page caption then needs a wording pass (it promises guests AI questions).

Tests to add (`src/app/api/chat/ageGate.route.test.ts`, mocking `getRequestUser`, `getAgeEligibility`, `consumeAiQuestion`, the model factory):
| case | expected | must NOT happen |
|---|---|---|
| guest (no user / `is_anonymous`) | 401 `auth_required`, `upgradeUrl: /login` | no `consumeAiQuestion`, no `getAgeEligibility`, no model call, no tool call |
| signed-in, no DOB (`status: 'unknown'`) | 403 `age_verification_required`, localized message | no quota spend, no model call |
| underage (`status: 'ineligible'`) | 403 `age_ineligible` | no quota spend, no model call |
| verified (`eligible`, ageBand set) | proceeds: `consumeAiQuestion` called once, then the model; `buildChatPromptContext` receives `ageGate.ageBand` | age band never reaches the client |
| RPC read error | 403 (fails closed — `getAgeEligibility` contract) | no model call |
Also keep main's `ageEligibility.test.ts` (16), `ageGateClient.test.ts`, `requireEligibleUser.test.ts` green, and add the web `(home)/page.tsx` redirect case (signed-in unknown → `/age-check`; guest → page renders).

## 4. Protected snapshot / contract tests that must pass after the merge
Cards & markers: `chatMarkerProtocol.test.tsx`, `chatCtaMarkerLeak.test.tsx`, `chatEntryContract.test.tsx`, `TripPlanCard.share.test.tsx`, `components/chat/structured/EntityCard.test.tsx`, `lib/ai/tiktokCardContract.test.ts`, `lib/ai/recommendationContract.test.ts`, `lib/structuredContent/crossPlatformParity.test.ts` (now CRLF-safe). Provider rows: `lib/ai/__measure__/toolPayload.test.ts`, `lib/ai/tools/placeDestinationScope.test.ts` (V3's 29), `serperPlaces.test.ts`, `foodFieldProvenance.test.ts`, `recommendation/entity.test.ts`, `entityScopedEvidence.test.ts`, `fieldMask.test.ts`. Contracts: `apiErrorContract.test.ts`, `anonQuotaContract.test.ts`, `lib/links/clientProviderParity.test.ts`, `platformLinks/crossClientParity.test.ts`, `i18n/clientFeatureParity.test.ts`, `iosParityGuards/Screens`, `webHardcodedUiStrings` ratchet. Plus the G1/G2/G3 suites and both offline replays (`scripts/audit/g1Replay`, `g2Replay`) re-run on the merged tree — their numbers must not move.

## 5. Pre-existing `crossPlatformParity` failure — DONE (`a56720f`)
Cause: `stripComments` works line by line with `.*$`, and JS `.` does not match `\r`; on a CRLF Windows checkout (this worktree: 2 743 files `w/crlf`, index `i/lf`) the comment line documenting the absent "cheapest" flag was never stripped. Fix: `read()` normalises `\r\n` → `\n`. CI (LF) was never red; only Windows checkouts. Side note for the merge: the same CRLF working copies are why git prints "CRLF will be replaced by LF" — `git checkout-index -a -f` after the merge renormalises the worktree under the new `.gitattributes`.

## 6. Post-merge measurement (audit env, no production)
Memory cleared (`clearmem2.mjs`), bearer re-minted, server on the merged commit with the uncommitted capture hook (audit worktree only).
1. **12 turns, all flags OFF**, `AUDIT_SURFACE=web` then `mobile` (6 + 6 from the 36-query plan, incl. the two-venue-sentence and spa queries).
2. **12 turns, flags ON** (`PLACE_GUARD_ATTRIBUTION_V2=1 SNIPPET_PRICE_GUARD_V2=1 MEDIA_PLACEMENT_V2=1`), same split, memory cleared again.
3. Age gate: audit user has a DOB (set 2026-09-17) → expect 200s; one probe with a second audit identity without DOB → 403 `age_verification_required` and **no LLM spend**; one guest probe → 401.
Gate (until the RELEASE GUARDRAILS text arrives): CTA block present in every place reply; 0 mid-sentence media blocks (mobile); 0 fabricated numbers/prices surviving; 0 fragments; no reply ≤ 35 % of model text; kept-ratio median ≥ pre-merge (0.77 flags OFF, 1.0 flags ON on the replay); no "TP. HCM"-style rewrites; age-gate refusals before any tool/model log line.

## 7. Decisions needed before executing
- **D1** guest chat policy (§3) — main's `auth_required` vs V3's anon 5-lifetime.
- **D2** confirm V3's 1500 m GPS radius over main's 2000 (measured; #7d).
- **D3** confirm the migrations are applied by you in the SQL Editor before the release (not by CI).
- **D4** paste the RELEASE GUARDRAILS / RELEASE GATE so §6 can be checked against the real text.

**STOP** — no merge executed, no push, no deploy.
