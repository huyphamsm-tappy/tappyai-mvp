# AI CONSULTATIVE V1 — design (flag `CONSULTATIVE_V1`, default OFF)

Written 2026-09-18 (overnight job, STEP E) on `merge/main-into-v3` after Steps A–D. Haiku stays the
default model. Everything below is flag-gated and ships OFF; with the flag OFF the pipeline is
byte-identical to Step D.

## 0. What already exists (so V1 builds on it, not beside it)

| Concern | Existing mechanism (all on the branch) | Gap V1 closes |
|---|---|---|
| Understand the situation | `deriveNeedProfile` (budget bilingual, location, domain hints), `deriveDecisionFrame` (goal, criteria, needed evidence), `resolveTripContext` | no **who / occasion / time / mood / hard-constraint** frame; no-diacritic input is read as **English** (measured: 13/14 undiacriticked VI queries → `en`), so intent regexes and the prompt's "reply in the user's language" both mis-fire |
| At most one question | prompt R7 + `clarificationGuard` (`no_reflex` policy, keeps ≤1 question, cool-vaughan) | the policy is wired but computed only for planning turns; V1 decides `allow / no_reflex / none` from the frame |
| Follow-ups | `classifyTurnIntent` (new / follow_up / refinement / clarification_response), decision-evidence carry-forward (ADR-024: prior candidates persisted server-side, reloaded, rendered as a block; `follow_up_question` never re-searches) | "quán này / 3 quán này / chỗ đó" are resolved by the MODEL from the block; when a fact is missing the model is told to say so — it cannot **re-search by name**, and a claim of having searched is unguarded |
| Evidence only | G1 attribution ladder (claims must match a row), G2 band-based price guard, `evidenceProvenance`, `entityTexts` (snippets per entity) | atmosphere / audience words (yên tĩnh, view, gia đình, hẹn hò, sang trọng, ồn) are not extracted from fetched review text as **attributes**, so they neither feed the ranker nor get checked in prose |
| Ranker + pick | `rankCandidates` + `shortlistCandidates` (max 3, `RULE_OF_ONE_TO_THREE_MAX`), `derivePick`, `_tappy_shortlist` in the tool result, decision-first opening rule | shortlist capped at 3; the ranker does not read the frame's occasion/mood attributes; price bands (`priceBand.ts`) are used by the guard but not the ranker |
| Prose shape | R1 (2–4 options, reasons, trade-off, lean), R4 (end with a recommendation), "don't repeat card data", 3-line reply cap | nothing measures the shape; the stream filter cannot tell "re-listed the card" from a reason |
| Memory | `extractMemoryFromConversation` (LLM, extracts location/companions/timing/preferences/budget) | transient words (tối nay, yên tĩnh, gần đây, 500k for this dinner) become durable traits; budgets get invented from a single turn |

## 1. Situation frame (deterministic, before the model)

`src/lib/ai/consultative/situationFrame.ts` — `deriveSituation(userTexts: string[], need: NeedProfile): SituationFrame`

```
SituationFrame {
  who:        'solo' | 'couple' | 'friends' | 'family' | 'group' | 'colleagues' | null   // + partySize?: number
  occasion:   'date' | 'birthday' | 'business' | 'family_meal' | 'hangout' | 'quick_bite' | 'celebration' | null
  time:       'now' | 'tonight' | 'lunch' | 'breakfast' | 'late_night' | 'weekend' | 'tomorrow' | { date } | null
  place:      NeedProfile.location (unchanged) — plus `nearMe: boolean` ("gần đây", GPS present)
  budget:     NeedProfile.budget (unchanged; bilingual extractor already handles 500k / 1tr / 300-500k)
  hard:       string[] of constraints the user STATED: 'quiet' | 'parking' | 'kids' | 'vegetarian' | 'outdoor' |
              'private_room' | 'late_open' | 'delivery' | 'air_con' | 'view' | 'live_music' | 'wheelchair'
  mood:       'chill' | 'lively' | 'romantic' | 'fancy' | 'cheap_good' | null
  assumptions: string[]   // what V1 assumed because nothing was said (rendered to the user as "mình giả sử…")
  confidence: number      // 0..1 — how much of the frame is stated vs assumed
}
```

- Lexicon is **diacritic-folded** (`normalizeVN`) and includes slang: `2 ng`, `2 người`, `2 đứa`, `tụi mình`, `gấu`,
  `người yêu`, `crush`, `bạn gái/trai`, `sếp`, `đồng nghiệp`, `gia đình`, `ba mẹ`, `con nít/trẻ em`, `bạn bè/hội bạn`,
  `nhậu`, `date`, `hẹn hò`, `sinh nhật`, `kỷ niệm`, `tiếp khách`, `ăn nhanh`, `ăn vặt`, `tối nay`, `trưa nay`,
  `khuya`, `cuối tuần`, `mai`, `yên tĩnh`, `chill`, `view`, `sang`, `rẻ`, `bình dân`, `ồn`, `sôi động`, `có chỗ đậu xe`,
  `phòng riêng`, `chay`, `ngoài trời`, `máy lạnh`, `xe lăn`.
- Multi-turn: the frame is derived over the last 3 user turns (same window `needProfile` uses), so "cho 2 người" on
  turn 1 still holds on turn 3.
- Rendered to the model as one short block (`===== TINH HUONG =====`), each stated field marked `(user nói)` and each
  assumed one `(giả sử)`. **The assumptions list is what R7 turns into a sentence** ("Mình giả sử hai bạn đi tối nay").

## 2. Language: no-diacritic Vietnamese

`detectLang` / `detectLangConfident` in `intent.ts` gain a **folded-lexicon score**: after diacritic folding, count
tokens that are Vietnamese function/content words with no English homograph (`quan`, `an`, `ngon`, `gan`, `cho`,
`nguoi`, `tim`, `mua`, `re`, `tot`, `nao`, `dau`, `gi`, `co`, `khong`, `toi`, `nay`, `di`, `choi`, `xem`, `phim`,
`hay`, `vui`, `ban`, `minh`, `duoi`, `tren`, `trieu`, `nghin`, `k`, `tr`, `q1`… ~120 entries). If ≥ 2 such tokens and
they outnumber `EN_FUNCTION_WORDS` hits, the text is Vietnamese. English detection is unchanged for genuinely English
text ("best pho in district 1" still `en`: `best`, `in` win). Pinned by a 30-case test (the 15 measured + 15 English /
mixed controls). Applies with the flag OFF too — it is a detector bug, not a consultative feature; recorded as such.

## 3. Follow-ups: reference resolution + named re-search

`src/lib/ai/consultative/referenceResolver.ts` — `resolveReferences(text, priorCandidates): Reference[]`

- Deterministic, diacritic-folded patterns: `quán này / chỗ đó / cái này / quán đầu tiên / quán số 2 / 3 quán này /
  cả 3 / quán X` (a name or head alias from the prior shortlist via `placeAttribution.placesNamedIn`). Resolves to
  concrete prior candidates (ids + names) — never to a new search.
- The resolved candidates are appended to the decision-evidence block as `REFERENCED: [names]` so the model answers
  about exactly those.
- **Missing fact ⇒ real re-search by name.** When the turn asks for a fact (`giờ mở`, `giá`, `số điện thoại`, `địa chỉ`,
  `còn mở không`, `có chỗ đậu xe không`) that the carried prose lacks for a referenced candidate (`priorTextStates`),
  the route puts a one-time instruction in the THAM CHIEU block: call `search_places` ONCE with `query = <name>`,
  `location = <known city>`, answer from the row whose name matches, and say "mình không tìm thấy" when none does.
  **As built (deviation from the first draft):** the search is made by the MODEL on the same single stream, not by
  the route before the model — the architecture lock (`consultativeArchitecture.test.ts`: exactly one `AI.stream()`
  per turn, no `toolChoice`) forbids a forced tool call, and a route-side call would bypass the row-evidence the G1
  place-claim guard reads (a rating quoted from a prompt-only block would be cut as unsupported). The route logs
  `tappyai_consultative_v1 step:'frame' named_refetch:<n>` so compliance is measurable in STEP F; the row-level
  `tappyai_tool_called` line shows whether the model actually searched.
- **"Claims of searching" guard** (`searchClaimGuard.ts`, prose only): sentences claiming a search / a check / a call
  ("mình đã tìm / kiểm tra / xem lại / gọi…") are removed when the turn made no tool call and no `named_refetch`.
  Counted in guard telemetry (`tappyai_guard guard:'search_claim'`).

## 4. Evidence-only attributes

`src/lib/ai/consultative/reviewAttributes.ts` — `extractAttributes(entityTexts: Map<name, string[]>): Map<name, AttributeSet>`

- Runs on text ALREADY fetched (Serper snippets, TikTok/YouTube titles, review excerpts in `entityTexts`); zero new
  calls. Diacritic-folded lexicon → `quiet | lively | view | family | date | fancy | cheap | crowded | slow_service |
  late_open | parking | outdoor | vegetarian | kids`. Each attribute keeps its **evidence snippet** (for the "why").
- Feeds (a) the shortlist evidence the model reads (`_tappy_shortlist[].evidence.attributes`, one line per attribute
  with its snippet) — the only atmosphere words the model may assert; a hard constraint with **no** supporting
  evidence on any candidate is reported on the tool result (`_tappy_hard_gaps`) and named in the prose, not silently
  dropped — and (b) the atmosphere-claim guard in the stream filter (`guardAtmosphereClaims`): an atmosphere/audience
  adjective about a named venue must be backed by that venue's attribute set; the pick sentence is counted, never cut;
  the wish the USER stated is never treated as a venue attribute.
- **As built (deviation):** the RANKER is untouched. Re-ordering by attribute/price band would change the card order,
  which is card data under the RELEASE GUARDRAIL; the model is told to choose for the situation among the shortlist
  and to name the reason. Ranker soft-signals are an open owner decision (see the overnight log).

## 5. Ranker → shortlist 3–5 → model picks

- `RULE_OF_ONE_TO_THREE_MAX` becomes `shortlistMax = consultativeV1 ? 5 : 3`; the roles stay (`best_overall`,
  `value_gem`, `vibe_experience`) + two unlabelled runners-up. The card carousel shows every admitted row anyway; the
  shortlist is what the MODEL may talk about.
- The model chooses the pick for THIS situation among the shortlist (the prompt block says: "chọn 1 cho tình huống
  này; các quán khác chỉ nhắc khi có lý do"). The engine's `best_overall` is the default; the model may override
  only with a stated reason tied to the frame (occasion/mood/hard). The pick MUST be a shortlist member — enforced by
  the existing pick-attributable check (G1 telemetry `pick_attributable`).
- Pick first in the carousel: **not done** — moving the pick would change card order = card data (RELEASE GUARDRAIL).
  The pick badge (`#1 · Phổ biến`) already marks the engine's best; if the model's pick differs, the prose names it
  and the card keeps the engine order. Recorded as an open owner decision.

## 6. Prose shape (3–5 sentences)

`src/lib/ai/consultative/proseShape.ts` — `guardProseShape(text, ctx)` (prose only, machine blocks untouched):

1. Pick + why (evidence) — must name a shortlist member in the first sentence (existing decision-first rule).
2. One alternative + trade-off — at most one "ngoài ra / nếu muốn" sentence.
3. One useful heads-up (hours / booking / distance) — optional.
4. At most one question — `clarificationGuard('no_reflex')` when the frame's confidence ≥ 0.6, `'allow'` below.
5. **No card-data re-listing**: a sentence whose only content is `rating + count`, `address`, `hours`, `phone` for a
   card venue (regexes over the row's own values) is dropped when the surface renders cards. A reason sentence that
   USES a value ("4.7⭐ từ 961 đánh giá là bằng chứng đủ mạnh") is kept — the rule is "value alone = listing".
6. Hard cap: 6 sentences before the follow-up chips; the least informative sentences (no venue, no number, no
   frame word) go first. Never cuts the pick sentence.

Telemetry: `tappyai_guard guard:'prose_shape' {sentences_in, sentences_out, listing_removed, questions_removed}`.

## 7. Prompt rules removed / overridden under the flag (listed, per the brief)

| Rule | Conflict | V1 |
|---|---|---|
| R1(a) "đưa 2-4 lựa chọn" | V1 = ONE pick + one alternative in prose (the carousel carries the rest) | overridden by the V1 block: "1 lựa chọn chính + tối đa 1 lựa chọn thay thế" |
| R1b "Nếu 2: viết 2. Nếu 3: viết tối đa 3" | same | overridden: shortlist is what you MAY mention, not what you must |
| R2 "tối đa 3 bullet" | V1 prose has no bullets | overridden: "không dùng bullet trong phần tư vấn" |
| R7(b) "gợi ý 2-3 lựa chọn trước, rồi hỏi" | V1: one pick, then ≤1 question only if it changes the pick | overridden |
| Reply length cap (3 lines, `renderedDecisionBlock`) | V1 wants 3–5 sentences | relaxed to 5 sentences + 1 question |
| "KHONG HOI 'ban muon an loai gi'" reflex rule | kept (agrees) | kept |
| R4 end with a recommendation | agrees | kept |
| Memory prompt "trích xuất … budget" | invents budgets | see §8 |

All other rules (tools, links, CCP, TikTok, evidence-gap, relaxation, safety) are untouched.

## 8. Memory

- `extractMemoryFromConversation` gains a **post-filter** under the flag (`memoryTransientFilter.ts`): values that are
  transient words (`tối nay`, `trưa nay`, `hôm nay`, `cuối tuần này`, `gần đây`, `ở đây`, `lần này`) are dropped from
  `timing`/`preferences`; `budget` is written only when the user stated it as a habit ("mình thường… / budget của mình
  là…") — a per-turn amount ("500k cho tối nay") never becomes the durable budget. Atmosphere words (`yên tĩnh`,
  `chill`) are dropped from `preferences` unless stated with a habitual marker ("mình thích", "mình hay").
- The extraction prompt itself is not changed (same model call, same cost); the filter is deterministic.

## 9. Cost / tokens

- Deterministic modules add ~0 model tokens; the situation + V1 rule block adds ≈ 250–350 prompt tokens per turn
  (cached segment where the prompt builder already caches). Named re-search adds one Serper `/maps` call only on a
  follow-up that asks a missing fact (bounded by the existing `placesBudget`). No extra LLM call. Haiku default unchanged.
- Measured after the build in `docs/audit/eval/`: prompt tokens per turn flag OFF vs ON from `tappyai_usage`.

## 10. Test plan (tests-first)

Unit: `situationFrame.test.ts` (30 phrasings incl. no-diacritic + slang), `intent.langNoDiacritics.test.ts` (30),
`referenceResolver.test.ts` (this/that/ordinal/count/name, missing-fact detection), `reviewAttributes.test.ts`
(evidence kept, user wish ignored), `proseShape.test.ts` (listing removed, reason kept, cap, pick never cut),
`searchClaimGuard.test.ts`, `memoryTransientFilter.test.ts`, `shortlist` max 5 under the flag. Route contract:
flag OFF ⇒ no block, no guards (byte-identical), flag ON ⇒ block present, `named_refetch` logged only on a missing fact.
Then STEP F's 40-query eval (all flags ON) against the RELEASE GATE.
