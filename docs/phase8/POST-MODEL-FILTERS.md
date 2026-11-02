# Post-model filters — inventory, groups, decisions (2026-10-11)

Scope: the web settle path (`src/lib/ai/streamEnrichment.ts`, `applyPlaceEnrichmentStreamFilter`) and the runtime steps around it, on the agent
runtime (`TAPPY_AGENT=2`). Counts come ONLY from the logs already saved (165 raw turn logs, 163 distinct run traces, rounds R4–R14 of the audit
runs; no turn was run for this document). "Changed" = the stage's before/after text differed (run-trace `guard` events). Samples are the
sentences that no longer appeared verbatim after the stage (`tappyai_uat_guard_diff`) — a sentence REWRITTEN by a guard also shows there, so a
sample is evidence that a stage touched the sentence, not that it deleted it. Nothing here is a quality grade.

Groups: **1** truth / safety, mandatory · **2** data-format, mandatory · **3** beautifying / voice-forcing.

## Decisions at a glance

| Decision | Stages |
|---|---|
| KEEP as is (group 1/2) | all not listed below |
| FIXED so it stops cutting a legitimate answer (flag on only) | `grounding_gate` (plan day headings "**Ngày 2 – …**" were read as venues), `unverified_figure_line` (one consistent "chưa xác minh" sentence + source buttons, also when no page was read), `entity_name` (quantity phrases "3,45 chỉ", "8 ngày làm việc" are not names), `no_fabrication` (a comparison derived from the example's own figures is kept) |
| OFF behind the flag (group 3) | `answer_first`, `clarification` |
| Already off behind the flag | `pick_sentence`, `pick_sentence_split` (luna.ts `consultativeInAgentEnabled()`), the "pick + why + one alternative ≤ 6 sentences" shape (not applied to agent prose) |

No fact / price / hours / ticket / distance / ScamShield / evidence / injection guard was loosened. Each fix is pinned both ways by a test
(the guard still removes a figure no source states; it no longer removes one a source states or a heading that is not a venue).

## Inventory (stage · file · group · changed turns / chars removed / chars added · what the saved logs show · decision)

| Stage | File | Grp | Changed | Evidence in the saved logs | Decision |
|---|---|---|---|---|---|
| `egress` | `lib/security` model egress (`guardModelEgress`) | 1 | 0 | URL / link allow-list; no change in saved turns | keep |
| `marketplace` | `marketplaceGuard.ts` | 1 | 10 t / 40 / 0 | removes a shop the tools did not hand over, bare photo URLs (10 `bare_photo_url`) | keep |
| `pick_sentence_split` | `consultative/luna.ts` | 3 | 0 | Luna path only | off with the flag (already) |
| `leak` | prompt-echo / secret detector | 1 | 0 | no hit in saved turns | keep |
| `enrichment_inject` | photos / links injector | 2 | 5 t / 6 / 730 | adds media + links around named places | keep |
| `plan_repair` | `repairPlanBlock` | 2 | 0 | JSON repair of `[TAPPY_PLAN]` | keep |
| `plan_price` | `guardPlanPrices` | 1 | 5 t / 62 / 0 | cuts a plan price no source states | keep |
| `plan_local_tips` | `planLocalTipsGuard.ts` | 1 | 9 t / 2001 / 0 | drops tips not tied to a retrieved stop (largest removal after `plan_items`; a tip that names no venue/price/hour and is flagged general survives) | keep (reported: it removes whole tips) |
| `plan_items` | `planItemGuard.ts` | 1/2 | 8 t / 2714 / 442 | only retrieved places in a plan card; wrong-province places removed (Đà Lạt, Cát Bà samples) — this is the real catch | keep |
| `plan_trip_facts` | `planTripFactsGuard.ts` | 1 | 4 t / 901 / 0 | removes dates / departure city the user did not give; one sample removed an honest "mình giả định…" line | keep (assumption wording is the model's; see open points) |
| `travel_ungiven_date` | same | 1 | 1 t / 86 / 0 | removes an assumed calendar date (built after a mismatch with the fare links) | keep |
| `evidence_citation` | `guardEvidence.ts` | 1 | 17 t / 1176 / 39 | holds page-backed sentences out of the heuristic guards; a figure the cited page does not state is not shielded (C3: Samsung spec numbers) | keep (+ today's-date framing ignored) |
| `money` | `moneyGuard.ts` | 1 | 3 t / 256 / 0 | removes a price no row states (Sony Care, Tiki price samples) | keep |
| `spec` | spec guard | 1 | 2 t / 186 / 0 | product specs without a row; two samples are generic advice sentences that mention spec words | keep (reported) |
| `travel` | `travelGuard.ts` | 1 | 14 t / 693 / 168 | hotel / transport prices in plan prose without evidence (C5-old: "1,2–1,6 triệu") | keep |
| `ticket_unit` | ticket guard | 1 | 0 | no change in saved turns | keep |
| `snippet_price` | `snippetPriceGuard` | 1 | 3 t / 338 / 0 | cuts a price that only a search snippet gives (petrol 28.250, Cô Tô rental 200–250k: real unsourced figures) | keep |
| `proximity` | distance guard | 1 | 0 | no change in saved turns | keep |
| `hours` | `hoursGuard.ts` | 1 | 0 | no change in saved turns | keep |
| `budget_fit` | `budgetFitGuard.ts` | 1 | 0 | "in budget" about an unpriced venue | keep |
| `format_claim` | `formatClaimGuard.ts` | 1 | 0 | venue format claims (buffet / nướng) | keep |
| `district_claim` | `districtClaimGuard.ts` | 1 | 0 | district swap | keep |
| `unsupported_claim` | `unsupportedClaimGuard.ts` | 1 | 2 t / 34 / 0 | REWRITES four claim shapes into conditionals (the samples are the rewritten sentences) | keep |
| `no_fabrication` | `noFabricationGate.ts` | 1 | 3 t / 96 / 51 | removes unsourced prices / rates and adds one note (lãi kép: a derived comparison was cut → fixed) | keep + fix |
| `entity_name` | `entityNameGuard.ts` | 1 | 13 t / 0 / 600 | un-bolds + labels a model name the evidence lacks; labelled "3,45 chỉ", "8 ngày làm việc" → fixed | keep + fix |
| `evidence_restore` | `guardEvidence.ts` | 2 | 26 t / 130 / 1787 | puts shielded sentences back | keep |
| `plan_budget_math` | `planBudget` | 2 | 6 t / 0 / 534 | appends code-written arithmetic | keep |
| `pick_sentence` | `luna.ts` | 3 | 2 t / 4 / 0 | "**Mình chọn: X**" mould | off with the flag (already) |
| `answer_first` | `clarificationGuard.ts` | 3 | 4 t / 0 / 0 | moves a leading question to the end | **OFF behind the flag** |
| `clarification` | `clarificationGuard.ts` | 3 | 4 t / 341 / 0 | drops "reflex" questions, caps at one question | **OFF behind the flag** (askGate is the only rule about WHEN to ask) |
| `consultative_v1` | `consultative/*Guard` | 1 | 2 t / 215 / 0 | search-claim + atmosphere guards (shape rules are not applied to agent prose) | keep |
| `scaffold_links_cta` | scaffold strip | 1/2 | 0 | strips model-written CTAs / links | keep |
| `grounding_gate` | `groundingGate.ts` | 1 | 4 t / 86 / 155 | cuts a bold "venue" with no retrieved row; three samples were plan DAY headings → fixed | keep + fix |
| `orphaned_enrichment` | `dropOrphanedEnrichment` | 2 | 0 | image without its name | keep |
| `fallback_narration_tidy` | citation links + list tidy | 2 | 29 t / 5 / 4024 | turns `[S#]` into code-built links, drops orphan list markers / lead-ins | keep |
| `risk_backstop` | `riskBackstop` | 1 | 0 | fixed risk block | keep |
| `verification_lead` | `verificationLead.ts` | 2 | 2 t / 0 / 123 | fare lead line | keep |
| `place_claim` | `placeClaimGuard.ts` | 1 | 7 t / 498 / 0 (83 runs logged) | rating / popularity / distance / ticket claims without a row; some samples are advice sentences with price-like words ("hỏi giá trước…") | keep (reported) |
| `place_geography` | geography guard | 1 | 15 runs | rows outside the destination | keep |
| (non-staged) `bare_list_marker`, `orphan_lead_in`, `citation_integrity` | `agent/runtime` | 2 | 3 runs | tidy of guard leftovers | keep |
| (new, flag on) `unverified_figure_line` | `unverifiedFigure.ts` | 1 | 2 runs | one sentence when every figure was cut + the source buttons | new |

Filters that did not run at all in the saved logs: `egress`, `leak`, `ticket_unit`, `proximity`, `hours`, `budget_fit`, `format_claim`,
`district_claim`, `scaffold_links_cta`, `orphaned_enrichment`, `risk_backstop` (they are place / ticket / safety guards; nothing in the saved turns
exercised them — that is not evidence they are unnecessary).

## What was turned off, and how to see it

With the flag on, `answer_first` and `clarification` do not run; the settle step logs once per turn
`{"type":"tappyai_guard","guard":"filters_disabled_by_flag","filters":["answer_first","clarification"]}`. Flag off: byte-for-byte unchanged.

## Progressive reveal (display only)

Server: with the flag on the response carries `x-tappy-reveal: 1` (not when `CONSULT_REVEAL=off`). The server still runs every guard and sends
the final text once. Client (`lib/chat/useFinishReveal.ts`): when the stream ends it shows the SETTLED text from the start in about 150 frames
(≥ 3 characters per frame, markdown-safe cut points), then the full text. Same bytes, same saved message. Never runs for: no header, reduced
motion, `localStorage.tappy_reveal = "off"`, replies < 60 characters, or a reply loaded from history.

## Proposal for a later phase: real sentence-by-sentence streaming (not done)

What it would take: (1) a SENTENCE-LEVEL verdict function with the same decisions the whole-text guards make — `evidence_citation` /
`judgeText` is already per sentence, but `money`, `snippet_price`, `no_fabrication` (running arithmetic across sentences), `place_claim`,
`grounding_gate` (heading blocks), `entity_name` and the plan-JSON guards look at the WHOLE reply (a figure in sentence 3 depends on a source cited
in sentence 5, and a derived comparison depends on earlier sentences); (2) a hold-back rule: a sentence is released only when every later
sentence can no longer change its verdict (end of paragraph + no pending `[S#]` marker + no open list) — in practice paragraph-level release;
(3) the client must accept an appended-only text (no rewrite of released bytes: `progressiveFlush.ts` already does this for non-agent turns, and
`alignReleasedPrefix` is the guard against duplication, the bug fixed for markers this week); (4) one final reconciliation frame for anything a
late guard still removes (visible "correction"), which is itself a product decision. Effort: roughly 2–3 weeks (verdict refactor of 8 guards +
paragraph hold-back + client reconciliation + a replay suite over the saved turns). Risks: a released sentence cannot be taken back (the exact
failure the buffered design prevents — a price shown, then cut), duplicate or truncated text when released bytes and settled text differ
(seen twice in this branch), and larger latency variance. Recommended first step: measure how often a late guard changes an earlier paragraph in
the saved logs before building anything.
