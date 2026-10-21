# Phase 8 M4: evidence-aware guards, Step 0 audit

Branch `p8/agent-runtime` (worktree `wtagent8`), base `d9d42fb`. **Web only.** Read-only audit; no code was changed for it.

## 1. Where the reply is guarded

Every factual output guard of the web chat runs in one place: the settle path of
`applyPlaceEnrichmentStreamFilter` (`src/lib/ai/streamEnrichment.ts`, `emitReconstructed`). On a `TAPPY_AGENT=2` turn the whole
reply is buffered (`collector.agentMode`), so every stage below sees the complete text before any byte reaches the user. Each stage
is traced by `gt(stage, before, after)` into the M1 run trace.

Order (settle path): `egress` → `marketplace` → `pick_sentence_split` → `leak` → enrichment / plan stages → **`money` → `spec` →
`travel` → `ticket_unit` → `snippet_price` → `proximity` → `place_claim` → `hours` → `budget_fit` → `format_claim` →
`district_claim` → `unsupported_claim`** → `plan_budget_math` → `pick_sentence` → `answer_first` → `clarification` →
`consultative_v1` (search claims, atmosphere, prose shape, hedge cap) → `scaffold_links_cta` → `grounding_gate` →
`orphaned_enrichment` → `fallback_narration_tidy` (+ `citeSources`) → `risk_backstop` → `verification_lead`.

## 2. How the guards get their evidence today

The guards read evidence **only from specific tool results**, collected while the stream passes (`streamEnrichment.ts` ≈ 3500–3740):

| Evidence variable | Filled from | Used by |
|---|---|---|
| `productRecords`, `specRecords` | `search_products` rows | money, spec |
| `travelFares`, `travelTimes` | `get_flight_prices` fares, `get_transport_options` bus/train snippets | travel |
| `snippetPrices`, `snippetPricesByEntity` | `search_places` `price_search_results` | ticket_unit, snippet_price |
| `placeTexts`, `placeEntityTexts`, ratings / reviews / phones / hours / week / addresses / bands by entity | `search_places` rows, `get_hotel_prices` snippets, travel editorial | place_claim, hours, format, unsupported, district |
| `consultativeV1.carried`, `priorTimes` | the previous reply's card facts | place_claim, hours (follow-ups) |
| names of `places`, `productRecords`, held candidates | tool rows | grounding_gate |

**Missing: the agent's research.** `web_search` results and the pages read by `read_page` / `web_search(read>0)` (M3) feed **none**
of these variables. The M3 evidence ledger (`agent/runtime/evidence.ts`, one per turn, FACT / INFERENCE / UNKNOWN / CONFLICT with sources
and quotes) stays inside the runtime. Only the source list (id, host, url) leaves it, via `onCitationSources` →
`collector.citationSources`, and it is used **only** at the very end to turn `[S#]` markers into links (`citeSources`, inside
`groundedProse`). So every guard treats a page-backed number exactly like a number the model invented.

M2 / M3 task state: `task.research_state.evidence` keeps up to 8 short `EvidenceRef`s (url, host, source type, ≤ 4 claims with their
type, `constraints_sig`). The existing staleness rule: a ref whose `constraints_sig` differs from the task's current constraints is
"read before the constraints changed" (`taskContextLines`). Guards never see these refs.

## 3. The Hội An failure, reproduced from the M3 eval record (`RS-C1`, run 05-12)

Raw Luna text (first paragraph):

> Vé phố cổ hiện được niêm yết **80.000đ/người Việt** và **120.000đ/khách quốc tế**. Vé dành cho việc vào các điểm di tích; nếu chỉ dạo
> phố, ăn uống hoặc chụp ảnh thì theo thông tin được đăng, không cần mua vé. [S2]

`S2` = `webdulichhoian.com/bang-gia-ve-tham-quan-pho-co-hoi-an.html`, read this turn; its text states `80.000đ/người` and
`120.000đ/người`. Delivered: the price sentence was gone, plus the travel hedge "Giờ chạy và giá vé cụ thể mình chưa xác nhận…".

Cause: `travelIntent` is true, `travelFares` is empty (no flight / coach tool), so `guardTravelClaimsInText` judges **every** VND amount
UNVERIFIED (fail-closed) and `redactUnsupportedClaims` drops the sentence. Note the citation shape: the `[S2]` marker closes the
paragraph, after the second sentence. A rule that only looks at markers inside the sentence would still miss this case.

The same shape breaks in other guards (same root: no page provenance):

- `ticket_unit`: any ticket / admission price on a ticket turn without a `search_places` snippet;
- `snippet_price`: any food / spa price on a place turn that is not in a Serper price snippet (or not entity-scoped there);
- `money`: a product price that a structured row contradicts or cannot see, or the "unverified" hedge appended when rows had no price;
- `spec`: a battery or weight figure when shopping rows exist but carry none;
- `hours`: opening hours that are not in a place row;
- `place_claim`: rating, review count, distance, phone, "bán vé", ordering, read only from place rows;
- `grounding_gate`: a venue heading named only by a page.

## 4. Guard map

"Can delete an evidence-backed claim?" = can a sentence or clause whose value is stated by a page read this turn, and cited, be removed or
rewritten today. Provenance awareness = what the guard knows about where a value came from.

| Guard | File | Purpose | Hard constraint? | Can delete evidence-backed claim? | Current provenance awareness | M4 action |
|------|------|---------|------------------|------------------------------------|-----------------------------|-----------|
| egress (links / images) | streamEnrichment `guardModelEgress` | links only to URLs this turn handed out; images only owned | **HARD** (security) | no (removes link targets, keeps labels) | tool frames only (by design) | none: stays before the shield |
| marketplace | marketplaceGuard.ts | model may not send the user to a shop it was not given | **HARD** (product rule) | no (suggestion sentences only) | verified links | none |
| leak | lunaSafety / leakCheck | prompt echo / secret shapes | **HARD** (security) | no | n/a | none |
| money | moneyGuard.ts | product price must trace to a structured row (2 % rounding); hedge when rows carry no price | partly: structured contradiction = real evidence; "unverified" hedge = HEURISTIC | **yes** (clause / sentence) | structured shopping rows only | shield page-supported sentences |
| spec | consultative/specGuard.ts | no weight / battery assertion without candidate evidence | HEURISTIC (absence ⇒ delete) | **yes** | shopping rows only | shield |
| travel | travelGuard.ts | fare / schedule / availability fail-closed unless live fare / transport snippet | HEURISTIC for prices and times (absence ⇒ delete); availability = no provider | **yes (RS-C1)** | live fares + transport snippets only | shield; availability shielded only when the cue is in the cited page |
| ticket_unit | travelGuard.ts (`unit:'ticket'`) | showtime / ticket price fail-closed unless venue snippet | HEURISTIC | **yes** | place price snippets | shield |
| snippet_price | snippetPriceGuard.ts | food / spa price must trace to a price snippet (entity-scoped in v2) | HEURISTIC (absence ⇒ delete) | **yes** | Serper price snippets with entity scope | shield, with entity-scoped page support (see §5) |
| proximity | consultative/proximityClaim.ts | "nearest" comparisons vs row distances | evidence contradiction (rows) | rarely (comparative clause) | row distances | shield (page-supported only) |
| place_claim | placeClaimGuard.ts | rating / reviews / distance / phone / tickets / ordering / popularity need row evidence | HEURISTIC (absence ⇒ delete); attribution rules are integrity | **yes** | place rows + entity snippets | shield (numeric / cue-verified sentences) |
| hours | hoursGuard.ts | opening hours must trace to row hours | HEURISTIC (absence ⇒ cut clause) | **yes** | row hours + previous reply | shield |
| budget_fit | budgetFitGuard.ts | "vừa ngân sách" next to a band above the budget | logical contradiction with user budget | no (judgement clause only) | user budget + row band | shield (only when supported) |
| format_claim | formatClaimGuard.ts | IMAX / 4DX asked but unseen | HEURISTIC (hedge / reword) | rewrites | row texts | shield |
| district_claim | districtClaimGuard.ts | venue in another district presented as the asked one | evidence contradiction (row address) | rewrites | row addresses | shield (page value verified, entity-scoped) |
| unsupported_claim | unsupportedClaimGuard.ts | 4 measured unsupported shapes, rewritten | HEURISTIC | rewrites | rows + user text | shield |
| plan_price / plan_items / plan_trip_facts / plan_local_tips / travel_ungiven_date | plan*Guard.ts | [TAPPY_PLAN] JSON integrity and price provenance | schema / integrity = HARD; price = HEURISTIC | yes inside plan JSON | rows | **not changed**: plan JSON carries no `[S#]`, so it cannot be tied to a page (remaining risk) |
| plan_budget_math / trip budget estimate | planBudgetMath / tripBudgetEstimate | code-written arithmetic / labelled estimate | n/a (adds) | no | n/a | none |
| pick_sentence / answer_first / clarification | consultBrain / clarificationGuard | shape of the pick, reflex questions | formatting | no factual deletion | n/a | none |
| consultative_v1: search claims | searchClaimGuard.ts | "mình đã kiểm tra" on a no-tool turn | integrity (work not done) | no (no-tool turns only) | tool calls | none |
| consultative_v1: atmosphere | reviewAttributes.ts | atmosphere words about a named venue need attributes | HEURISTIC | qualitative only | entity snippets | none (qualitative, not verifiable deterministically; remaining risk) |
| consultative_v1: prose shape / hedge cap | proseShape.ts / hedgeCap.ts | listing sentences when cards show them; ≤ 2 hedges (merged) | formatting | listing of card values only | card rows | none |
| grounding_gate | groundingGate.ts | venue names must be retrieved | integrity vs invented venues | **yes** (venue heading named only by a page) | place / product / held names | page-evidence names added as grounded (name found in a page read this turn) |
| risk_backstop | riskBackstop.ts | second-hand purchase risk block | safety rule (adds) | no (adds text) | n/a | none |
| verification_lead | verificationLead.ts | flight / film facts with no source | adds a lead line | no | tool flags | none |
| citeSources | streamEnrichment `citeSources` | `[S#]` → link (sanitised) | **HARD** (link egress) | no | this turn's sources | citation integrity check added before it |

## 5. Decisions for M4 (from this audit)

1. **One mechanism, not per-guard patches.** The guards share one gap (no page provenance) and one shape (sentence or clause removal
   over the prose). M4 judges each sentence once against the M3 ledger, before the factual guards run. Sentences SUPPORTED by page
   evidence are held out of the heuristic guards and restored unchanged afterwards. Hard guards (egress, marketplace, leak, link
   sanitising) run before or after this pass and still apply.
2. **Support is verified, not trusted.** A sentence is SUPPORTED only when
   - it carries a `[S#]` marker of a page read this turn: its own, or the next marker in the same paragraph line;
   - every checkable value in it (money, time, percent, number + unit / next word) is found in the cited source's text;
   - an availability cue (còn vé / hết hàng / in stock …), if present, is also in the source;
   - when the sentence names a venue or product, the value is in the same page passage as that name (entity scope; the area-listicle
     trap from food prose provenance).
   Otherwise the old guard behaviour applies unchanged.
3. **Not found ≠ false.** UNKNOWN (uncited, or cited but not found) keeps today's behaviour: remove or qualify, per guard.
4. **CONTRADICTED.** If a ledger conflict (numeric, same unit) has the cited value on one side and another source on the other, and the
   reply mentions neither the other value nor the other source, the claim is kept and a short code-written note naming the other source
   is appended (Luna's own explanation, when present, suppresses it).
5. **INVALID** values (impossible times, inverted ranges, non-positive money, rating above its scale) are never held out.
6. **TASK_STATE**: references carried from earlier turns support a value only when they are fresh (same `constraints_sig`, the existing
   rule) **and** the current message names no identifier that the reference does not (M2 → M4, a different date). The tracker updates
   the signature after the reply, so the identifier check closes that window.
7. **Citation integrity**: a held-out sentence keeps its marker; if its paragraph's marker is lost elsewhere, it is re-attached. A
   marker on a sentence whose values its source does not state is removed (no misattribution).
8. **SEARCH_SNIPPET** stays with the existing snippet guards (entity-scope rules already exist there); it is reported in the trace,
   not used to hold sentences out.

Plan JSON price guards (§4) are out of reach of this mechanism: there is no citation inside the plan body. Recorded as a remaining risk.
