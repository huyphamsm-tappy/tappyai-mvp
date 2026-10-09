# PHASE 8 — EXECUTION LEDGER (updated 2026-10-09, second pass)

Worktree `D:/TappyAI-wt/wtagent8`, branch `p8/agent-runtime`; code HEAD at the time of writing `000d248` (this ledger is committed on top). Nothing is pushed, merged or deployed. Scope source: `PHASE 8.docx` (extracted: `artifacts/phase8/PHASE8-docx-text.txt`) — Subscription/Payment moved to Phase 7; DEFER and BLOCKED items are not pulled in.

Legend — **DONE**: code + tests + evidence read by someone other than the author, or a live/real check. **IMPLEMENTED**: code and tests exist, behaviour not verified live. **OPEN**: not done. **BLOCKED**: needs credentials, permission, a device or an external source. **DEFERRED**: out of scope by the Phase 8 document. **OWNER**: a decision is required. "Evidence" never means the author's own report alone.

## 1. Agent Runtime (this worktree owns it)
| Package | State | Evidence | Closing step |
|---|---|---|---|
| M0–M7, WS2 research intelligence, No-Fabrication Gate, post-UAT closure | IMPLEMENTED (earlier live UAT: 0 fabrication in 25 scenarios; FAIL-QUALITY items fixed afterwards, not all re-run live) | commits `0bd6fae`…`6b7d958`; `docs/phase8/*REPORT*.md`; `artifacts/phase8/uat/` | post-credit reruns (below) |
| Serper cost control (credit model, ledger, fan-out, in-flight dedup, cancellation) | IMPLEMENTED; credits reconciled for ONE request only | `c1bcfb8`, `e001afe`; smoke step 1 vs Activity Log | OWNER: `num` 20/40 smoke, Activity-Log reconciliation |
| `/shopping` identical resend after a timeout (review finding D) | **FIXED** (blocked for 30 s; fast HTTP errors unaffected) | `b5c1f00`, `shoppingRetry.test.ts` (5) | — |
| Shop-info sequencing (finding E: +≤ 6 s after the parallel batch) | **UNCHANGED by decision** (credits vs latency; asked only when something was found) — covered by `serperCostControl.test.ts` | — | OWNER |
| **Freshness contract**: `retrieved_at` through L1/L2/in-flight; freshness by kind of data; gate note | **IMPLEMENTED** (offline: 41 tests, 15/15 mutations); **not seen live** | `b5c1f00`; `freshness.ts`, `retrievalClock.ts`, `freshness.test.ts`, `freshnessContract.test.ts` | one live turn that reads a cached price |
| Legacy pre-call before ask | Not a defect — locked by tests | `legacyAskBeforeSearch.test.ts` | — |
| Research state (`web_search` empty query) | DONE (fix + tests) | `8c62c43` | — |
| Make Plan / Cards (plan names → card + TikTok request) | IMPLEMENTED; frame sequence and plan integrity locked on HEAD; the user's original "3 Cards" incident NOT reproduced (runtime unknown); the legacy trip-plan hotel 3-card block (PL-PLAN-CARD-RACE) untouched | `b8299b1`, `000d248`, `makePlanCards.test.ts` (6) | OWNER: trace of the original incident; decision on the legacy block |
| UAT-10 ask-first | root cause fixed in the instruction set (`de8710d`) | `ASK-FIRST-ROOT-CAUSE.md`, `model-probe/REPORT.md` | — |
| Answer before lookup | IMPLEMENTED; live UAT-10 (first pass) = PARTIAL | `83f9379`, `uat10-e2e-answer-first-2026-10-09/REPORT.md` | one more live turn (below) |
| UAT-10 defects: product name outside evidence · two questions · restated criteria | **IMPLEMENTED offline** (entity-name guard; preface without questions; near-verbatim echo removal; shown text quoted to the post-lookup step); a PARAPHRASE of the advice cannot be detected by code and remains the instruction's job | `6d229f9`, `uat10Defects.test.ts` (13; fail on the pre-fix code, 12/12 mutations) | **one live UAT-10 turn, max 8 credits — plan below, awaiting owner approval** |
| Flight follow-up (flight data only) / cinema follow-up (missing dimension only) | IMPLEMENTED at prompt + state level (`followUpContextLines`, plan "KHÔNG lập lại", `followups.test.ts`); no code classifier by design | earlier live: UAT-25-t4 0 tools | live re-check with the post-credit rerun |
| Fare for a date / flight status / cinema showtime & ticket price | **No data source** → fields stay `not_verified`; follow-ups can only refresh what a source provides | `PHASE7-CLOSEOUT.md` §W, `DATA-SOURCE-RESOLUTION.md` | OWNER: commercial access (Traveloka, Vexere, Moveek) |
| Streaming | **By design buffered**: the runtime emits the final text once, after the settle-path guards (no early tokens, so no "guard rejects after streaming" hazard). Unchanged | settle-path tests | revisit only with a per-chunk guard design |
| Post-credit BLOCKED scenarios (UAT-11/12/14/15/19/21), Make Plan on final code, L2 checks | OPEN (no live spend approved) | — | OWNER: bounded live run |

### Cache / state layers — four different mechanisms
1. **LLM prompt/prefix caching** — provider side; the repo only does usage accounting. It does not prevent tool calls.
2. **Tool-result / evidence cache** — L1 in-memory (search 5 min, shopping 15, maps 30, images 15) and L2 shared KV (search/shopping/maps). Exact keys. **Now carries the real fetch time** (`retrieved_at`; L2 envelope v3; legacy entries read as "time unknown"). Not shared in the UAT launcher.
3. **In-flight deduplication** — `serperFlight`: identical concurrent requests share one fetch; per-caller cancellation; joiners now receive the leader's fetch time.
4. **Conversation / research state** — `task.ts`: constraints, preferences, entities, ≤ 12 searches (one entry per query), 8 findings, 8 evidence refs; follow-up state (flight/movie/plan/cards) in `agentContext`.
Still missing: recognising a paraphrased question as the same lookup (by decision: Luna decides from the visible research state), stored raw rows for "fetch only the missing part".

## 2. Phase 8 work packages (`PHASE 8.docx` §3)
This session does not own them (other worktrees/sessions or owner access). Status comes from repository evidence read read-only; nothing is marked DONE on a report alone.
| WP | Scope | State | Evidence / what is missing | Owner / dependency |
|---|---|---|---|---|
| WP-01 | SEC1/I6 production RLS/grant check, 6 RC migrations review, Secure email change, conditional inputs | **BLOCKED** | needs production read access; Secure email change is a Supabase dashboard setting; security review exists: `docs/security/SECURITY-REVIEW-2026-10-01.md` on `wtsec-p8` (22 fixes intact @`3fce8b7`) | owner: production read permission + dashboard |
| WP-02 | I1 migration numbering, I2 flags/config, I3 cherry-pick, I5 docs | OPEN / UNVERIFIED | `DEPLOY_PHASE8.md`, `ENV-RELEASE-CHECKLIST.md` exist on `phase8-master`/`wtsec-p8`; known merge risk (59 conflicts); no evidence the slice-by-slice cherry-pick plan is final | security/Phase 8 session |
| WP-03 | iOS baseline sync + CI | IMPLEMENTED (iOS session) | memory 07/10: TestFlight build 142 VALID at `9a3c1aa`, CI green; `wtios` HEAD is now `8009f07` (newer) → re-check | iOS session |
| WP-04 | SEC4 limiter, SEC9 magic-byte, SF8 `audit_log`, E2 `user_events` | **PARTIAL (code present, acceptance unverified)** | on the Phase 7 main (`wtp7`, read-only): SEC9 — `sniffImageType` (`@/lib/security/imageType`) used by profile/avatar/reviews routes; SF8 — `audit_log` + audit chain migrations (`20260713…`, `20260807_audit_chain.sql`) and admin audit routes; E2 — `user_events` in migrations and chat route/crons; SEC4 limiter listed by the document as already absorbed. Slice acceptance tests/review not read | security session |
| WP-05 | C1 memory text, C2 scam cache KV, C3 indexes | **OPEN** | no migration or code found by name (`memory_text`, `scam_cache`) on the Phase 7 main | Web/DB session |
| WP-06 | Safety UI Web/Android/iOS | PARTIAL | backend: `user_blocks`, `user_reports`, moderation standards, `banned_identity_hash` migrations are on the Phase 7 main; Web UI merged, flags ON on Preview only (memory 02/10); iOS final UAT note: comment/user report flag off; Android/iOS device testing not evidenced | owner devices; mobile sessions |
| WP-09 | Sign in with Apple + server config + device test | **BLOCKED** | Supabase Apple provider DISABLED on audit and prod (memory 05/10); 5.1.1(v) revocation open | owner: dashboard config + real device |
| WP-10 | Integration → parity → security re-review → final UAT | OPEN | depends on the slices above; the Agent Runtime branch is web-only and unmerged | after WP-01…09 |
No Android/iOS file and no production resource was touched; handoff = the "Closing step"/"dependency" columns.

## 3. Open / blocked / deferred / owner decisions
- **Awaiting owner approval: ONE live UAT-10 turn, hard cap 8 Serper credits (plan in the final report).** If it fails, no second turn.
- OWNER: trace of the original "3 Cards after Make Plan" incident; decision on the legacy trip-plan hotel 3-card block.
- OWNER: Serper `num` 20/40 smoke + Activity-Log reconciliation; shop-info sequencing (E).
- OWNER: commercial access for fares/status/showtimes.
- BLOCKED: WP-01 (production read), WP-09 (Apple provider + device), WP-06 device tests.
- DEFERRED by the Phase 8 document: E3/AI1, M1–M6, C4/C6, CM1, L3/L4, X1/X2, SEC8-ext, SEC10/11/13, SF4/5-ext, SF7, SF9. BLOCKED/OWNER by the document: E1, E4, SEC14, X3.
- Backlog outside the Agent diff: `PHASE8-BACKLOG.md`; observability: `AI-OBSERVABILITY-CONVERSATION-INTELLIGENCE.md`.

## 4. Verification state of this worktree (HEAD `000d248`)
tsc clean; eslint 0 errors (47 pre-existing warnings); full vitest (default timeouts) **18,471 passed · 0 failed · 84 skipped · 1 todo of 18,556**. Mutation harnesses re-run sequentially on the final code: M6 11/11, M7 13/13, WS-final 20/20, WS2 24/24 caught; the UAT-10 defect harness 12/12; the freshness harness 14/15 (the 15th, F11 timestamps-as-evidence, was a mis-written mutation and was re-run corrected: caught); the first answer-first harness is now partly stale (M7/M9 strings changed, M8 superseded) — its intents are covered by the UAT-10 defect harness. `m4_mutate` is a stale harness (M1/M2 patterns gone since `6b7d958`, M3 survived) — pre-existing, unrelated.

## 5. Owner decisions of 2026-10-09 and the result (appended)
- **UAT-10 live turn (approved, one, cap 8 credits): executed → FAIL on the lookup-scope criterion.** Report: `artifacts/phase8/uat/uat10-e2e-defects-fixed-2026-10-09/REPORT.md`. 5 model calls, 3 tool calls (1 executed, 2 refused), 7 Serper requests sent / 7 refused by the ceiling, **estimated 8 · provider-reported 8 · ledger 8 · Activity Log NOT reconciled**. The three earlier defects did not recur; one `search_products` call spent the whole ceiling on card enrichment. No second turn.
- 3-Cards incident: the legacy 3-hotel-card contract is unchanged; trace request in `THREE-CARDS-TRACE-REQUEST.md`.
- Shop-info sequencing and commercial data access: unchanged / deferred (capability register in the closure matrix).
- Per-WP verdicts, evidence and blockers: `PHASE8-CLOSURE-MATRIX.md` (supersedes §2 of this file where they differ).

## 6. Third round (owner decisions after UAT-10) — appended
- **Product-card enrichment policy: IMPLEMENTED offline** (`89fbea5`): purchase links opt-in via `purchase_links`; advice/criteria/comparison = one `/shopping` request (worst case 3 credits); links mode capped after a 4-credit verification reserve (worst case 14 = 6 required + 8 optional); per-call log `tappyai_product_enrichment`; shopping/place labels follow Luna's ranking (none or low confidence = nothing crowned). Regression-tested with a mocked provider only; **no live request was made**; UAT-10 stays FAIL until a new explicit approval and a new live turn.
- **C1–C3 / SEC9 integration: STOPPED at preflight** — conflicts and missing prerequisites; exact blockers and options in `WP05-SEC9-INTEGRATION-PREFLIGHT.md`. Nothing cherry-picked, no migration improvised.
- **3 Cards**: contract unchanged; trace request in `THREE-CARDS-TRACE-REQUEST.md`; BLOCKED on the trace.
- WP-01 / WP-06 / WP-09 stay BLOCKED; required resources are listed per item in `PHASE8-CLOSURE-MATRIX.md`.

## 7. Option A executed (owner decision) — appended
- **`b69f340` (local, p8/agent-runtime): C1, C2, C3 ported by path** from `dbc41e5`; trimmed registry with the 2 flags (default OFF); migration `20261005_p8_cost_indexes` in `MIGRATION_ORDER.txt` and `apply-migration.sh` (APPLY). Tests: `costWins.test.ts` 8/8 (5/5 mutations caught after one added assertion), real-Postgres `p8_cost_indexes` 4/4, `migrationOrder` + `applyMigrationPolicy` pass, tsc and eslint clean, full suite 18,500+ passed; 2 failures in the run were (a) the policy test that demanded the new migration be listed (fixed in the same commit) and (b) `mergeGuard` timeout under load (passes isolated, 10/10); a 1 ms timing assertion in `freshnessContract.test.ts` was relaxed (the product value is correct to within a ms).
- **SEC9: no port** — `completeUploadResponse` already verifies bytes (F-102/F-103) for every minted client-direct kind, unconditionally; the flagged P8 hook would be a weaker duplicate. Correction recorded in the closure matrix.
- **Step C (mocked providers only)** re-confirmed by `enrichmentPolicy.test.ts` + `recommendationLabels.test.ts` (in the 455-test media/agent run): advice requests = 1 `/shopping` request and no vendor-link search; `purchase_links: true` only for explicit purchase intent; the optional budget leaves the 4-credit verification reserve untouched; low-confidence or missing Luna ranking crowns nothing. No live request made.
- **Step D:** WP-02 I1 PASS (I2/I3/I5 open), WP-03 CI PASS (merge open), WP-04 SEC4/SF8/SEC9 conditional PASS, E2 UNVERIFIED (no authoritative criteria readable), WP-10 open; WP-01, WP-06, WP-09 and the 3-Cards incident stay BLOCKED. **Agent architecture and Phase 8 are NOT COMPLETE.**
