# Phase 8 M4: evidence-aware guards (TAPPY_AGENT=2, web only)

Branch `p8/agent-runtime` (worktree `wtagent8`), base `d9d42fb` (M3 latency pass). Committed locally, not pushed. Audit: `M4-EVIDENCE-GUARD-AUDIT.md`.

## 1. M4 objective

Deterministic guards must not delete a fact only because it came from web research and is missing from their own data. Provenance
has to change the validation result, without trusting web values blindly. Code still owns integrity, security and hard constraints;
Luna still owns interpretation.

## 2. Guard audit (summary; full table in the audit)

- Every factual guard runs on the settle path of `streamEnrichment.ts`. On an agent turn the whole reply is buffered.
- The guards took evidence **only** from place / product / transport tool rows. `web_search` and pages read in M3 fed none of
  them. Only the source list reached the end of the pipeline, for the `[S#]` links.
- Guards that could delete or rewrite a page-backed, cited value: money (incl. the "unverified" hedge), spec, **travel (RS-C1)**,
  ticket_unit, snippet_price, proximity, place_claim, hours, budget_fit, format_claim, district_claim, unsupported_claim,
  grounding_gate (venue names).
- Hard guards, unchanged: link egress, marketplace naming, leak check, CTA validation, link sanitising.
- Plan-JSON guards: unchanged, because a plan body carries no citation (see §14).

## 3. Evidence provenance model

Reuses the M3 ledger. There is no second evidence system: the ledger now keeps each source's bounded extract for the turn (never
persisted) and exposes `guardView()`.

| Provenance | Meaning | Effect |
|---|---|---|
| `PAGE_EVIDENCE` | cited `[S#]` page read this turn states every value in the sentence | **held out of heuristic guards** (subject to source reliability) |
| `TASK_STATE` | a fresh evidence ref carried from an earlier turn states the values | held out |
| `USER_INPUT` | values are the user's own | existing guard rules (user echo) |
| `SEARCH_SNIPPET` | (reported only) | existing snippet guards |
| `MODEL_KNOWLEDGE` | uncited, or cited but the source does not state it | existing guard rules |
| `UNKNOWN` | nothing checkable in the sentence | existing guard rules |

FACT / INFERENCE / UNKNOWN / CONFLICT are unchanged in the ledger. The guard decision runs on top of them.

## 4. Hard constraints vs heuristics, and the decision policy

- **SUPPORTED:** every checkable value is on a cited source:
  - money (exact VND / USD amount), clock times, durations, numbers with their unit class or unit word, model identifiers (M2 / S24), availability cues;
  - **entity-scoped:** when the sentence names a venue or product, the value must be in a passage that names it too (this closes the area-listicle trap);
  - **weak source:** a source weak for that kind of fact (sourceType matrix) supports only an attributed or explicitly qualified sentence.

  Effect: the sentence is held out of the heuristic guards and restored unchanged, with its citation.
- **CONTRADICTED:** supported, but a numeric ledger conflict has another source with a different value, and the reply mentions neither that source nor its value.
  Effect: the claim is kept and one code-written note names the other source and value. No number is chosen for the user.
- **UNKNOWN:** the guards run exactly as before. "Not in our data" is never treated as "false".
- **INVALID:** impossible times (25:70), inverted or non-positive money, a rating above 5 → never held out.

Heuristics (range, absence ⇒ delete) cannot touch a SUPPORTED sentence. Hard constraints still run before (egress, marketplace,
leak) or after (CTA, link sanitising, grounding gate, risk backstop) on the restored text.

## 5. Guards changed

There are no per-guard patches. One pass (`shieldSupported`) runs between `maskPlanBody` and the money guard and is restored after
`unsupported_claim`. It covers money, spec, travel, ticket_unit, snippet_price, proximity, place_claim, hours, budget_fit,
format_claim, district_claim and unsupported_claim.

Additional changes:
- **grounding_gate:** a bold venue name that a page read this turn also names counts as grounded.
- **The placeholder keeps the sentence's names (venue / product).** The first version blanked them. The test suite caught the
  spec guard then letting an uncited neighbour ("Máy nặng khoảng 1,6 kg") through, because the guard attributes a claim to the
  product named in the sentence before it.
- **Citation integrity:**
  - a held sentence that inherits a paragraph marker gets it back if the guards cut the sentence that carried it;
  - a held sentence a guard removed anyway is restored (never silently lost);
  - a marker is removed when every sentence it covers states a number that the cited source never states (misattribution);
  - `[S#]` with no page read is stripped (RS-E1 run 2 sent a raw `[S1]` to the user; M3 gap).
- **Prompt injection:** `isInstructionLike` now also drops "developer mode", "disable / bypass the guards / safety rules" and
  "mark every claim …" sentences. Measured: one such sentence survived page extraction.

## 6. Files changed

| File | Change |
|---|---|
| `src/lib/ai/guardEvidence.ts` (new) | quantities, judge, shield / restore, page-grounded names |
| `src/lib/ai/streamEnrichment.ts` | shield before money, restore after unsupported_claim; page names to grounding gate; trace stages `evidence_citation` / `evidence_restore` |
| `src/lib/ai/agent/runtime/evidence.ts` | per-source extract (+ publication date) for the turn; `guardView()` |
| `src/lib/ai/agent/runtime/index.ts` | `onGuardEvidence` (sources, conflicts, task refs as at turn start); dangling `[S#]` stripped |
| `src/lib/ai/toolResultSplit.ts` | collector fields `guardEvidence`, `evidenceTrace` |
| `src/app/api/chat/route.ts` | 2 wiring lines (agent v2 only) |
| `src/lib/ai/agent/runtime/trace.ts` | trace kind `evidence_guard` (counts + closed reasons, no text) |
| `src/lib/ai/travelGuard.ts` | `AVAIL_RE` exported (reused, not duplicated) |
| `src/lib/ai/agent/guards.ts` | 3 injection patterns |
| tests | `guardEvidence.test.ts` (new, 38), `researchLoop.test.ts` (+3) |
| `scripts/repoHygiene.test.ts` | recording ceiling 2678 → 2868 (M4 eval recordings, deliberate) |

No architecture-locking test changed.

## 7. Regression cases (tests)

Hội An verbatim (RS-C1 raw text) through the real stream filter: the price survives, rendered as a source link. Contrast: the same
reply without provenance is still cut.

Other cases:
- uncited travel price still removed;
- a price outside any old range, page-backed, is kept;
- cited value not on the page: falls to the old guard, identical output to pre-M4, marker removed;
- conflict surfaced with a note; no note when Luna already explains it;
- product spec (battery 18 h, manufacturer page) kept, while an uncited weight next to it is still cut;
- opening hours from the page kept;
- cross-language ("18 giờ" ↔ "18 hours");
- identifier check (M2 page ≠ M4 claim);
- availability cue must be on the page;
- unit mismatch (812 cycles ≠ 812 mAh);
- entity scope (listicle);
- weak-source attribution, and the qualified form (RS-C1 run 2 verbatim);
- publication date;
- INVALID values;
- stale TASK_STATE (constraint signature, model identifier, date);
- prompt-injection page;
- money hedge;
- ticket unit;
- grounding names;
- citation re-attach;
- lost-sentence restore;
- paragraph-marker misattribution (RS-B1 verbatim);
- runtime hands provenance; ask turns hand none;
- no dangling markers.

## 8. Mutation results (each fix removed in turn → the new tests must fail)

| # | Fix removed | Failing tests |
|---|---|---|
| M1 | shield in the settle path | 6 |
| M2 | paragraph-marker inheritance | 6 |
| M3 | entity scope | 1 |
| M4 | weak-source rule | 2 |
| M5 | contradiction note | 1 |
| M6 | identifier staleness | 2 |
| M7 | names kept in the placeholder | 1 |
| M8 | misattributed-marker removal | 3 |
| M9 | citation re-attach | 1 |
| M10 | lost-sentence restore | 1 |
| M11 | INVALID check | 1 |
| M12 | availability-cue check | 1 |
| M13 | page-grounded names | 1 |
| M14 | runtime does not hand provenance | 1 |
| M15 | TASK_STATE support | 1 |
| M16 | injection patterns | 1 |
| M17 | strict unit match | 1 |
| M18 | model-identifier check | 1 |
| M19 | qualified weak-source claim | 1 |
| M20 | dangling-marker removal | 1 |
| M21 | publication date in the extract | 1 |
| M22 | bold emphasis is not an entity name | 1 |

All 22 mutations are caught. Every fix was restored after its mutation run (verified with `git diff`).

## 9. Security results

- Page text is only compared against. It never selects a rule, widens support, or enters the reply, except the bounded numeric
  value of a ledger conflict side, which is already cleaned.
- Injection page test: the instruction sentences are dropped from the extract, and an uncited / unsupported value is still guarded.
- SSRF / safe-fetch: unchanged. The `safePageFetch` suite (40) and the standalone fix in `2b1b4d5` (a different branch) were not touched.
- Non-agent turns: `guardEvidence` is absent, so the pass is inert (test). Legacy and Phase 7 paths are unchanged.

## 10. Evidence / citation results (live eval, real Luna, final code: runs 07-02 and 07-04)

Guard verdicts:
- 5 sentences SUPPORTED (page-backed, held out), 0 lost, 0 re-attached;
- **0 dangling `[S#]`** in any delivered text;
- 8 markers removed as misattributions. Representative ones were checked against the recorded pages (replay of the eval runs):
  - RS-B1: the page read was the **AirPods Pro 3** spec page, the reply gave AirPods Pro 2 figures citing it;
  - RS-E1: the fee was not on the cited government page;
  - RS-G1: IP54 was not in what was read.

  These claims stay and are judged by the old guards, but no longer carry a link saying the page states them.

**Hội An: in both final runs Luna wrote the price, and it was delivered with its source link.**
- In M3 it was cut in both runs.
- In run 07-02, `place_claim` removed only the uncited advice clause "hãy mua vé" ("buy a ticket"), which is pre-M4 behaviour. The
  remaining coverage miss there is Luna's content (no weather / transport section).

Found and fixed during the eval rounds (each now pinned by a verbatim test):
- a hedged 80.000đ from a weakly typed source (qualified claims now count as attributed);
- a raw `[S1]` with no page read (stripped);
- the publication date was missing from the extract ("bài đăng từ 2014");
- bold emphasis ("**khách Việt**") was read as an entity name.

## 11. M3 quality comparison (research set, 9 turns, 2 runs each)

| | M3 latency pass | M4 (final code) |
|---|---|---|
| Turns passing every check | 8/9, 8/9 | **8/9, 8/9** |
| page read when needed | 6/6, 6/6 | 6/6, 6/6 |
| official source used | 4/4, 4/4 | 4/4, 4/4 |
| sources cited | 5/5, 5/5 | 5/5, 5/5 |
| conflict explained | pass | pass |
| seller claim UNKNOWN | pass | pass |
| RS-C1 (Hội An) price delivered | **cut, both runs** | **delivered, both runs** |

The remaining misses are not guard cuts (no M4 stage changed them):
- RS-C1 coverage wording in one run (see §10);
- RS-D1 `conflict_detected` in the other. The ledger built 0 conflicts that run (M3 extraction variance); Luna still explained the
  disagreement.

Earlier intermediate runs (before the last fixes) were 9/9 + 7/9, 8/9 + 8/9, and 8/9 + 9/9. The 7/9 was the two RS-C1 / RS-E1
defects listed in §10.

Regression set (53 turns, code before the last two judge fixes, which only affect cited sentences):

| Run | Pass | Failures |
|---|---|---|
| M3 latency pass | 50/53 | — |
| M4, first run | 49/53 | — |
| M4, last run | 48/53 | D-2 (17-character checker artefact), FU-G1 t2 (same as M3), FU-G1 t3 (continuity), T-1 t1 + t2 |

- T-1 t1: Luna chose `ask_user` ("Bạn muốn đi từ thành phố nào?"); t2 follows from it.
- No M4 stage changed any failing turn (`place_claim` on FU-G1 t2 is the same as in M3).
- Across the two M4 regression runs, the failing set moves between P-2, T-1 and FU-G1: model variance.

## 12. Latency comparison

| | M3 latency pass | M4 (final, 2 runs) |
|---|---|---|
| research p50 / p90 / max | 7.25 / 11.84 / 12.96 s | **6.96** / 18.65 / 20.66 s |
| research model time mean | 5.57 s | 6.51 s |
| research rounds mean / max | 2.39 / 3 | **2.22 / 3** |
| research tool calls mean / max | 1.44 / 2 | 1.22 / 2 |
| research search time max | 6.33 s | 10.52 s |
| model time per round, p50 | 2.0–2.3 s | 2.2–2.4 s |
| regression p50 / p90 (last run) | 4.53 / 10.51 s | 5.43 / 11.26 s |
| research cost / turn | $0.0034 | $0.0033 |

- The guard pass costs **≈ 14 ms** on a heavy reply (12 sentences, 4 sources × 12 passages, measured). It adds no model call and
  no network.
- M4 changes neither the loop, the prompt, the limits, page reading, search nor the tracker. Rounds and tool calls are equal or
  lower than M3.
- The p90 / max rise comes from slow new Serper queries (search up to 10.5 s, not replayed) and, in intermediate runs, from turns
  where Luna chose 4–5 rounds, plus one 28.8 s provider stall.
- This is variance outside M4, but research p90 is still above the deep-research target: see §14.

## 13. Full test gates (final code)

- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors (existing warnings only).
- `node scripts/architecture/check.mjs`: 15/15.
- `npm test`: **17,952 passed, 0 failed** (1,086 files; skips and the expected-fail unchanged).
- One intermediate run showed 4 failures in `breakGlassBoundary.test.ts` because I deleted a scratch file while that test was
  scanning the tree. It passes 7/7 on its own, and the final run is green.
- Mutation table (§8): 22 fixes, all caught. M22 = "bold emphasis is not an entity" (1 failing test when removed).

## 14. Remaining risks

1. **Qualitative claims are not provenance-checked** ("không cần mua vé", "rất yên tĩnh"): they have nothing deterministic to
   compare, so they stay with the existing guards (which may still cut them).
2. **Mixed sentences:** a sentence with one page-backed value and one unsupported value is not held out. The guards may cut the
   whole sentence (traced).
3. **The bounded extract is the evidence.** A fact further down a long page that Luna did not see is UNKNOWN even if true. On real
   pages Luna often states figures from its own knowledge with a citation; those markers are now removed and the claims are
   judged as before.
4. **Plan JSON prices** (`plan_price` and similar) cannot use page evidence: there is no citation inside a plan body.
5. **Structured row vs page:** when a merchant row price and a cited official page disagree, the page sentence is kept and the
   card shows the row. Both are visible, but no code-written note links them (only ledger conflicts produce the note).
6. **Pre-existing hours-guard quirk** (not changed, not M4): an unsupported range "7h00 – 21h00" loses only its first time, and
   "21h00 …" survives with the hedge. It behaves the same before and after M4 (test pins equality).
7. **Ledger text-vs-text conflicts:** M3 builds spurious CONFLICTs between long sentence values (seen on RS-C1). The guard ignores
   non-numeric sides, but the model still sees them (M3 evidence quality).
8. **Source typing:** `hoianworldheritage.org.vn` (the official heritage site) is `other`, so its price needs attribution or
   qualification. A travel blog with Organization markup is `official` (M3 risk, unchanged).
9. **Research p90 (18.7 s) is above the 8–15 s deep-research target.** The causes are outside M4: slow new Serper queries, and turns
   where Luna chooses more rounds. The levers are M6 (tool registry), Serper timeouts and prompt guidance.
10. **Bold proper-name heuristic:** entity scope uses capitalised bold names and known row names. A venue written in lowercase bold
    is not scoped, so a listicle value could then support it at page level (narrower than before the fix, still a heuristic).

## 15. Confirmation

- **Android: NOT TOUCHED.**
- **iOS: NOT TOUCHED.**
- **Production: NOT MODIFIED.** No environment variables changed anywhere. TAPPY_AGENT=2 stays dev / eval only.
- **M5 / M6 / M7: NOT STARTED.**
- No push. Committed locally only.
