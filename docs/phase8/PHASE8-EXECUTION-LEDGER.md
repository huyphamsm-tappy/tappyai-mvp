# PHASE 8 — EXECUTION LEDGER (as of 2026-10-09)

Worktree `D:/TappyAI-wt/wtagent8`, branch `p8/agent-runtime`, code HEAD at the time of writing `83f9379` (ledger committed on top). Nothing is pushed, merged or deployed. Scope source: `PHASE 8.docx` (extracted text: `artifacts/phase8/PHASE8-docx-text.txt`) — Subscription/Payment moved to Phase 7; DEFER and BLOCKED items are not pulled in.

Legend — **DONE**: code + tests + evidence read by someone other than the author, or a live/real check. **IMPLEMENTED**: code and tests exist, behaviour not verified live. **OPEN**: not done. **BLOCKED**: needs credentials, permission, a device or an external source. **DEFERRED**: out of scope by the Phase 8 document. **OWNER**: a decision is required. "Evidence" never means the author's own report alone.

## 1. Agent Runtime (this worktree owns it)
| Package | State | Evidence | Closing step |
|---|---|---|---|
| M0–M7 runtime, WS2 research intelligence, No-Fabrication Gate, post-UAT closure | IMPLEMENTED (earlier live UAT: 0 fabrication in 25 scenarios; some FAIL-QUALITY items fixed afterwards) | commits `0bd6fae`…`6b7d958`; `docs/phase8/*REPORT*.md`; `artifacts/phase8/uat/` | post-credit reruns (below) |
| Serper cost control (credit model, ledger, fan-out, in-flight dedup, cancellation) | IMPLEMENTED; credits reconciled for ONE request only | `c1bcfb8`, `e001afe`; smoke step 1 vs Activity Log | owner: `num` 20/40 smoke, Activity-Log reconciliation |
| Orchestration audit: legacy pre-call before ask | **Not a defect** — canned ask/clarify returns before any pre-call is built; no-tool turns have no tools; agent runtimes null the consult | `legacyAskBeforeSearch.test.ts` (8) | none |
| Research state: `web_search` stored an empty query | DONE (fix + tests; live use in a loop not yet seen) | `8c62c43`, `task.test.ts`, `orchestrationReuse.test.ts` | — |
| Make Plan / Cards (plan names → card + TikTok request) | IMPLEMENTED (reproduced and fixed offline); the user's original "3 Cards" incident NOT reproduced and its runtime unknown | `b8299b1`, `makePlanCards.test.ts` (4); legacy hotel 3-card block (PL-PLAN-CARD-RACE) deliberately untouched | OWNER: trace of the original incident; decision on the legacy trip-plan card block |
| UAT-10 ask-first | root cause fixed in the instruction set (`de8710d`); model-only probe: ASK_FIRST 5/5 → 0/5 but DIRECT_ANSWER 0/5 | `ASK-FIRST-ROOT-CAUSE.md`, `model-probe/REPORT.md` | — |
| Answer before lookup (preserve advice next to a lookup/ask; one bounded Luna check for research lookups) | IMPLEMENTED; **live UAT-10 = PARTIAL/not accepted** (advice came first and was preserved; 1 unverified product name, a mid-answer question, restated criteria) | `83f9379`, `answerBeforeLookup.test.ts` (17; 11 of 12 mutations caught, the 12th (NOTHING_YET parsing) did not apply to the harness string and is covered only by the parse tests), `uat10-e2e-answer-first-2026-10-09/REPORT.md` | OWNER: approve the 3 proposed small fixes + one more live turn |
| Product-name grounding guard ("iPhone 18 Pro Max" not in evidence) | OPEN (proposal only; the Gate covers numbers/claims, not product names) | UAT-10 E2E report | OWNER: design review (false-positive risk) |
| Cache rows carry no `retrieved_at` (freshness of prices reused from L1/L2) | OPEN — blocker before presenting cached prices as current | Serper review finding F | OWNER: tool-result contract change |
| `/shopping` identical retry after timeout (D), sequential shop-info latency (E) | OPEN | Serper review D/E | OWNER |
| Flight follow-up updates flight data only; cinema follow-up only the missing dimension | IMPLEMENTED at the prompt + state level (`followUpContextLines`, plan "KHÔNG lập lại", `followups.test.ts`); no code-level classifier by design | earlier live: UAT-25-t4 0 tools | live re-check with the post-credit rerun |
| Fare for a date / flight status / cinema showtime & ticket price | **No data source** (Travelpayouts removed; Traveloka/Vexere/Moveek access not obtained) → such fields stay `not_verified`; follow-ups can only update what a source provides | `PHASE7-CLOSEOUT.md` §W, `DATA-SOURCE-RESOLUTION.md` | OWNER: commercial access |
| Streaming | **By design buffered**: the Phase 8 runtime emits the final text once, after the settle-path guards; no early-token streaming exists, so no guard-reject-after-stream hazard. Not changed | `agentStreamResult`, settle path tests | revisit only with a guard-per-chunk design |
| Post-credit BLOCKED scenarios (UAT-11/12/14/15/19/21), Make Plan on final code, L2 checks | OPEN (not run; no live spend approved) | — | OWNER: approve a bounded live run |

### Cache / state layers — what exists, and what does not (they are different mechanisms)
1. **LLM prompt/prefix caching** — provider-side; the repo only does usage accounting (`cachedInputTokens`). Observed: the 2nd identical prompt in a short window was a cache hit (probe A5). It does not prevent tool calls.
2. **Tool-result / evidence cache** — L1 in-memory per process (search 5 min, shopping 15, maps 30, images 15) and L2 shared KV for search/shopping/maps; exact keys; no `retrieved_at`; not shared in the UAT launcher.
3. **In-flight deduplication** — `serperFlight`: identical concurrent requests share one fetch; per-caller cancellation.
4. **Conversation / research state** — `task.ts`: constraints, preferences, entities, up to 12 searches (one entry per query), 8 findings, 8 evidence refs; the last 5 searches / 3 sources are shown to Luna; follow-up state (flight/movie/plan/cards) in `agentContext`.
Missing: recognising a paraphrased question as the same lookup (no semantic dedupe, by decision — Luna decides from the visible research state), stored raw rows for "fetch only the missing part", per-field freshness on cached rows.

## 2. Phase 8 work packages (`PHASE 8.docx` §3)
This session does not own them (other worktrees/sessions or owner access). Status is taken from repository evidence read-only; nothing here is marked DONE on the strength of a report.
| WP | Scope | State | Evidence / what is missing | Owner / dependency |
|---|---|---|---|---|
| WP-01 | SEC1/I6 production RLS/grant check, 6 RC migrations review, Secure email change, conditional inputs | BLOCKED | needs read access to production; Secure email change is a Supabase dashboard setting (memory: must stay ON); security review exists: `docs/security/SECURITY-REVIEW-2026-10-01.md` (worktree `wtsec-p8`, 22 fixes intact @`3fce8b7`) | owner: prod read permission |
| WP-02 | I1 migration numbering, I2 flags/config, I3 cherry-pick, I5 docs | OPEN/UNVERIFIED | `DEPLOY_PHASE8.md` and `ENV-RELEASE-CHECKLIST.md` exist on `phase8-master`/`wtsec-p8`; merge risk recorded (59 conflicts); no evidence the slice-by-slice cherry-pick plan is final | security/Phase 8 session |
| WP-03 | iOS baseline sync + CI | IMPLEMENTED (iOS session) | memory 07/10: TestFlight build 142 VALID at `9a3c1aa`, CI green; `wtios` HEAD is now `8009f07` (newer commit) → re-check needed | iOS session; I do not edit iOS |
| WP-04 | SEC4 limiter, SEC9 magic-byte, SF8 `audit_log`, E2 `user_events` | UNVERIFIED | code present on the Phase 7 main (grep: admin audit routes, `user_events` in chat route/crons, image-type checks in profile/avatar routes); the Phase 8 document lists the limiter as already absorbed; acceptance tests/review for the slice not read by this session | security session |
| WP-05 | C1 memory text, C2 scam cache KV, C3 indexes | OPEN/UNVERIFIED | no evidence found in this worktree | Web/DB session |
| WP-06 | Safety UI Web/Android/iOS | PARTIAL | Web: blocks/reports/moderation merged, flags ON on Preview only (memory 02/10); iOS final UAT note: comment/user report flag off; Android/iOS device testing not evidenced | owner devices; mobile sessions |
| WP-09 | Sign in with Apple + server config + device test | BLOCKED | memory 05/10: Supabase Apple provider DISABLED on audit and prod; 5.1.1(v) revocation open | owner: dashboard config + real device |
| WP-10 | Integration → parity → security re-review → final UAT | OPEN | depends on the slices above; the Agent Runtime branch is web-only and not yet merged | after WP-01…09 |
Handoff items for the sessions that own WP-01…WP-10 are the "Closing step"/"dependency" columns above; no Android/iOS file was touched here.

## 3. Open / blocked / deferred / owner decisions (one list)
- OWNER: approve the 3 small UAT-10 fixes (question hygiene, restated criteria, product-name grounding) and one more bounded live turn.
- OWNER: trace of the original "3 Cards after Make Plan" incident (runtime + flag); decision on the legacy trip-plan hotel 3-card block.
- OWNER: Serper `num` 20/40 smoke + Activity-Log reconciliation; `retrieved_at` contract (F); shopping retry (D) / latency (E).
- OWNER: commercial access for flight fares/status and cinema showtimes (Traveloka, Vexere, Moveek).
- BLOCKED: WP-01 (production read), WP-09 (Apple provider + device), WP-06 device tests.
- DEFERRED by the Phase 8 document: E3/AI1, M1–M6, C4/C6, CM1, L3/L4, X1/X2, SEC8-ext, SEC10/11/13, SF4/5-ext, SF7, SF9. BLOCKED/OWNER by the document: E1, E4, SEC14, X3.
- Backlog outside the Agent diff: `PHASE8-BACKLOG.md`; AI observability: `AI-OBSERVABILITY-CONVERSATION-INTELLIGENCE.md`.

## 4. Verification state of this worktree
tsc and eslint clean; full vitest 18,418 passed / 3 failed / 84 skipped / 1 todo of 18,506 — the 3 failures (`controlBytes`, `flightSource`, `jsonLd`) are load timeouts in the full run and pass in isolation (11/11). Mutation harnesses run sequentially after the change: M6 11/11, M7 13/13, WS-final 20/20, WS2 24/24, answer-first 11/12 applied and caught (M4 only after adding a test; M7 not applicable); `m4_mutate` is stale (M1/M2 patterns no longer exist since `6b7d958`; M3 survived with 0 failures) — pre-existing, unrelated to this change, unverified.
