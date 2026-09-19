# COST REPORT — /api/chat, measured 2026-09-18 (Phase 1 of COST OPTIMIZATION)

Environment: audit project `zdaprdfgpbpnxyofagmc`, runtime `:3101`, G1/G2/G3 flags ON, Haiku 4.5 for every role
(`smart`/`fast`/`planning`), authed audit user with GPS = Quận 1. Instrumentation added for this measurement
(commit `6d8fc27`, no behaviour change): a Serper call meter per endpoint and an env-gated per-turn sink
(`AUDIT_USAGE_LOG_FILE`) that records the provider's usage counters, the Serper calls of the turn and the SIZE of
every prompt section. Raw lines: `docs/audit/eval/cost/usage-on.jsonl`, `usage-off.jsonl`; replies:
`docs/audit/eval/cost/{on,off}/*.json`. Generator: `scripts/audit/costrep.mjs`.

Sample: 10 turns of the CONSULTATIVE-40 set, one thread per vertical with its follow-up (F4→F5, F1, F3, S2→S3, T4,
P2→P3, E1), run twice: `CONSULTATIVE_V1=1` and unset. 20 LLM runs of the 120 budget.

## Prices used
Haiku 4.5: input $1.00 /M, cache write $1.25 /M, cache read $0.10 /M, output $5.00 /M. Serper: $0.001 per credit
(`/maps` = 3 credits, `/search` `/shopping` `/images` = 1). Memory extraction (`extractMemoryFromConversation`, a
separate Haiku call on every authed turn, not metered by the sink): **estimate** $0.004 (≈3k in / 150 out).
Token estimates for sections use 2.1 chars/token, calibrated on the cached prefix (45 918 chars ↔ 21 327 tokens) and
on tool results (≈2.04); they are estimates, the totals are the provider's own counters.

## Per turn — CONSULTATIVE_V1 ON

| turn | LLM calls | uncached in | cache write | cache read | out | hit rate | Serper calls (credits) | LLM $ | Serper $ | memory $ | total $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F4 | 2 | 15237 | 21327 | 21327 | 793 | 37% | maps×2 search×4 (10) | $0.0480 | $0.0100 | $0.0040 | $0.0620 |
| F5 | 1 | 4106 | 0 | 21327 | 220 | 84% | - (0) | $0.0073 | $0.0000 | $0.0040 | $0.0113 |
| F1 | 2 | 19383 | 21179 | 21179 | 596 | 34% | maps×2 search×3 (9) | $0.0510 | $0.0090 | $0.0040 | $0.0640 |
| F3 | 2 | 14549 | 0 | 42358 | 602 | 74% | maps×1 search×3 (6) | $0.0218 | $0.0060 | $0.0040 | $0.0318 |
| S2 | 2 | 21108 | 21452 | 21452 | 734 | 34% | search×2 shopping×1 (3) | $0.0537 | $0.0030 | $0.0040 | $0.0607 |
| S3 | 1 | 10117 | 0 | 21327 | 461 | 68% | - (0) | $0.0146 | $0.0000 | $0.0040 | $0.0186 |
| T4 | 2 | 17383 | 0 | 42654 | 703 | 71% | maps×2 search×4 (10) | $0.0252 | $0.0100 | $0.0040 | $0.0392 |
| P2 | 2 | 17429 | 21450 | 21450 | 657 | 36% | maps×2 search×2 (8) | $0.0497 | $0.0080 | $0.0040 | $0.0617 |
| P3 | 1 | 5117 | 0 | 21327 | 287 | 81% | - (0) | $0.0087 | $0.0000 | $0.0040 | $0.0127 |
| E1 | 2 | 20286 | 0 | 42358 | 806 | 68% | maps×1 search×1 (4) | $0.0286 | $0.0040 | $0.0040 | $0.0366 |
| **avg** | | | | | | | | $0.0308 | $0.0050 | $0.0040 | **$0.0398** |

tool turns: 7, avg $0.0508 (cache-warm $0.0368) · no-tool turns: 3, avg $0.0142 · **all, cache-warm: $0.0300/turn**

## Per turn — CONSULTATIVE_V1 OFF

| turn | LLM calls | uncached in | cache write | cache read | out | hit rate | Serper calls (credits) | LLM $ | Serper $ | memory $ | total $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F4 | 2 | 12917 | 0 | 42654 | 754 | 77% | maps×1 search×4 (7) | $0.0210 | $0.0070 | $0.0040 | $0.0320 |
| F5 | 1 | 2762 | 0 | 21327 | 230 | 89% | - (0) | $0.0060 | $0.0000 | $0.0040 | $0.0100 |
| F1 | 2 | 16537 | 0 | 42358 | 614 | 72% | maps×2 search×3 (9) | $0.0238 | $0.0090 | $0.0040 | $0.0368 |
| F3 | 2 | 11678 | 0 | 42358 | 538 | 78% | maps×2 search×3 (9) | $0.0186 | $0.0090 | $0.0040 | $0.0316 |
| S2 | 2 | 18832 | 0 | 42904 | 699 | 69% | search×2 shopping×1 (3) | $0.0266 | $0.0030 | $0.0040 | $0.0336 |
| S3 | 1 | 8881 | 0 | 21327 | 585 | 71% | - (0) | $0.0139 | $0.0000 | $0.0040 | $0.0179 |
| T4 | 1 | 2087 | 0 | 21327 | 147 | 91% | - (0) | $0.0050 | $0.0000 | $0.0040 | $0.0090 |
| P2 | 2 | 14730 | 0 | 42900 | 537 | 74% | maps×2 search×2 (8) | $0.0217 | $0.0080 | $0.0040 | $0.0337 |
| P3 | 1 | 3566 | 0 | 21327 | 250 | 86% | - (0) | $0.0069 | $0.0000 | $0.0040 | $0.0109 |
| E1 | 2 | 14631 | 0 | 42358 | 652 | 74% | maps×2 search×3 (9) | $0.0221 | $0.0090 | $0.0040 | $0.0351 |
| **avg** | | | | | | | | $0.0166 | $0.0045 | $0.0040 | **$0.0251** |

tool turns: 6, avg $0.0338 · no-tool turns: 4, avg $0.0120 · all: $0.0251/turn. (T4 OFF asked a question and ran
no search — cheaper, but that is the quality difference V1 exists for, not a saving.)

### Reading the two runs honestly
- The ON run was the first traffic after ~1 h idle, so four turns PAID the cache write (21k × $1.25/M ≈ $0.027 each);
  the OFF run then read the same prefix warm. Steady-state (any traffic above one turn per 5 min keeps the prefix
  warm) the comparison is **$0.0300 (ON) vs $0.0251 (OFF) per turn**: V1 adds ≈ +$0.005/turn, all of it the V1
  block (≈1.4k tokens, sent on EVERY step of the turn — 2 steps on a tool turn ⇒ ≈2.8k uncached tokens) plus slightly
  longer output.
- **Cache hit rate** (cached ÷ total input): 68–84% on a warm turn, 34–37% on a cache-write turn. The cached prefix is
  the 21.2–21.5k-token block "tool definitions + static rulebook". It is NOT one prefix: four variants were observed
  (21 327 / 21 179 / 21 450 / 21 452) because the TOOL SET changes with the turn (`search_products` is dropped on
  an "offline" location intent, `search_places` on a film-recommendation turn) — each variant is its own cache
  lineage. With production traffic every variant stays warm; on a quiet deployment each switch costs a write.

## Where the input tokens go (tool turn, V1 ON, per LLM call; F1 as the example)

| section | est. tokens | cached? | notes |
|---|---|---|---|
| tool definitions | ≈2 400 | yes | measured earlier ("declaring them cost ~2,400"); part of the 21.2k prefix |
| static rulebook (`SYSTEM_BASE` + review/CTA/scope/safety/evidence blocks) | ≈18 800 | yes | 45 918 chars; the 22 numbered rules, CTA/link rules, evidence policy |
| dynamic system, of which: | 3 300–5 000 | **no** | sent on every step |
| ├ language + clock + GPS + budget + stage blocks | ≈1 300 | no | |
| ├ decision frame + ranking + rendered-card blocks | ≈1 500 | no | `consultativeChars` minus V1 |
| ├ **CONSULTATIVE_V1 block** (situation + rule overrides) | ≈1 400 | no | ≈2 900 chars |
| ├ memory block | ≈500 | no | `buildMemoryBlock` |
| history (prior turns, sanitized) | 0–400 | no | follow-ups only in this sample; grows with thread length |
| user turn | 10–40 | no | |
| **tool result (step 2 only)** | **8 000–10 500** | no | `search_places`: 10 rows × every field + `price_search_results` + `_tappy_shortlist` + editorial; the single largest uncached item |
| shopping evidence block (S2/S3, in dynamic) | 5 400–8 400 | no | ADR-024 `renderDecisionEvidenceBlock` + synthesis instruction — the reason S3 (no tool) still sends 10k uncached tokens |

So on a tool turn ≈ 19k uncached tokens = 2 × (dynamic ≈4.5k) + tool result ≈10k; the cached prefix costs only
≈$0.004 for its two reads. **The levers, in order of size: the tool payload (≈50% of uncached), the dynamic system
sent twice (≈45%), Serper credits (a third of the whole turn at $0.005–0.010), the memory-extraction call.**

## Monthly projection (30 days, cache-warm, mix as sampled ≈ 65% tool turns / 35% follow-ups)

| turns/day | V1 ON $/month | V1 OFF $/month | of which Serper (ON) | of which memory extract |
|---|---|---|---|---|
| 1 000 | ≈ $900 | ≈ $750 | ≈ $150 | ≈ $120 |
| 10 000 | ≈ $9 000 | ≈ $7 500 | ≈ $1 500 | ≈ $1 200 |
| 100 000 | ≈ $90 000 | ≈ $75 000 | ≈ $15 000 | ≈ $12 000 |

(Raw, uncorrected averages — with every 4th turn paying a cache write — would read $1 195 / $752 per 1k/day; see the
tables. Anonymous users skip memory extraction, so their turns are ≈$0.004 cheaper.)

## Phase 2 — what each item should save (estimates before applying; measured after)
| # | item | expected effect on a tool turn |
|---|---|---|
| 1 | cache-friendly order | the prefix is already static-first; the win is a STABLE prefix (one tool set) — saves the ≈$0.027 write on each variant switch on quiet deployments; ~0 at scale |
| 2 | delete rules V1 overrides | ≈ −400 to −700 cached tokens → ≈ −$0.0001/turn (cached), plus fewer contradictions |
| 3 | domain-scoped rules | move ≈8–10k of the 18.8k static tokens out of the prefix per turn → mostly cached, so ≈ −$0.001/turn; real win is on cache-write turns and TTFT |
| 4 | trim tool payload to 3–5 candidates | tool result 10k → ≈3k tokens: **≈ −$0.007/turn (−25%)** |
| 5 | shared Serper cache 6–24 h | repeat queries stop paying 3–10 credits: −$0.005–0.010 on a repeated turn; share depends on traffic overlap |
| 6 | history compaction | 0 in this sample (short threads); bounds the growth on long threads |
| 7 | maxTokens | 0 cost (output is billed as generated); guards against runaway replies only |
| 8 | skip the model | greetings / carried-fact follow-ups: **−100% of that turn** (≈$0.011 each) |

Results per item are appended below as they are applied.

## Phase 2 — measured after each item

Method: after every item the same 6-turn subset (F4 → F5 follow-up, S2, P2, E1, T4) was run on the audit env with
all flags ON (`docs/audit/eval/cost/usage-<item>.jsonl`, replies in `cost/<item>/`), memory cleared before each run;
at the end the full CONSULTATIVE-40 (`usage-final40.jsonl`, replies in `docs/audit/eval/runs-cost/`). Costs below are
STEADY-STATE (the static prefix warm; the per-turn dynamic segment write that item 1 introduces is counted as a real
cost). Budget spent in this job: **93 / 120** LLM runs (20 measurement + 24 per-item + 40 final + 9 re-runs).

| after item | tool turn $ | follow-up $ | subset avg $ | cache hit (warm turns) | note |
|---|---|---|---|---|---|
| baseline (V1 ON) | 0.0368 | 0.0142 | 0.0300 | 68–84 % | 10-turn measurement, Phase 1 |
| 1 cache breakpoint on last user msg | 0.0301 | – | 0.0301 | 85–90 % | uncached input on a tool turn 15–20k → 5–11k tokens: step 2 reads the request prefix; a write of ≈3–5k tokens per turn is the price |
| 2 rules V1 overrides removed | (with 4) | | | | **REVERTED** — see below |
| 4 model payload = decision set | 0.0308 | 0.0117 | 0.0245 | 80–86 % | tool result 8–10k → 4.5–6k tokens; uncached input per tool turn ≈ 5k; the first cut trimmed BEFORE the enrichment carve and starved the photo collector (5 `/images` calls per turn — caught by the Serper meter, fixed) |
| 6 history compaction | 0.0303 | | | | 0 on this sample (short threads); bounds long threads (older assistant replies ≤ 420 chars) |
| 7 maxTokens 3072 → 2048 | 0.0303 | | | | 0 by construction (max observed 821); guard only |
| 8 no-model turns | 0.0303 | **0.0000** (carried-fact follow-up) | 0.0221 | | F5 answered from the carried hours in 449 ms, $0; greetings likewise |
| **final 40 (all items)** | **0.0293** | 0.0123 | **0.0247** | **73 %** overall (baseline 55 %) | 191 Serper credits / 40 turns |

**Per-turn cost: $0.0300 → $0.0247 steady-state on the full 40 (−18 %); tool turns $0.0368 → $0.0293 (−20 %);
a carried-fact follow-up $0.0113 → $0.** Uncached input tokens per tool turn: ≈19k → ≈5k (−74 %); the bill is now
dominated by cache reads (10 %), Serper credits and the memory-extraction call.

Monthly (steady-state, V1 ON, mix as in the 40): **1k turns/day ≈ $740** (was ≈ $900) · **10k ≈ $7 400** (was
≈ $9 000) · **100k ≈ $74 000** (was ≈ $90 000).

### Items not applied, and why
- **2 — delete the rules V1 overrides.** Applied as a flag-conditional removal (R1(a), R1b 1..3 wording, R1b
  "viết 1/2/3", R2, R7(b); byte-identical with the flag OFF, pinned by test), then the 40-run pass dropped to 30/40
  with four turns asking a question instead of recommending (F7, F8, S2, T4) → reverted per the rule (`d10a7e9`).
  Re-running those turns after the revert did NOT recover them; clearing the audit user's memory did (F7, T4 pick
  again). So the drop was memory state accumulated across the 40-run pass, not item 2 — but the item stays reverted:
  its saving is ≈150 cached tokens/turn (≈$0.00002) and the eval could not attribute it cleanly.
- **3 — domain-scoped rules.** Riskier than described, not applied: the vertical-specific static text (link rules
  18/18a/18b/19 ≈1.9k tokens, review block ≈1.7k, CTA block ≈2.4k) sits in the CACHED prefix at $0.10/M, so the
  measured saving is ≤ $0.0012 per tool turn (≈4 %) — while it multiplies the cache lineages (5 verticals × the
  tool-set variants already observed) and drops rules on multi-domain turns (a plan needs food + stay + attraction +
  transport; "ăn gì" needs food + shopping links). Not worth the quality risk at this cost.
- **5 — shared Serper cache 6–24 h surviving restarts.** Riskier than described, not applied: (a) the code already
  records that Serper/Maps content is not persisted beyond the 30-min in-process cache because of Google Places
  terms (`serperPlaces.ts`, `product.ts` EMIT_TAPPY_PLACES note) — a durable 6–24 h store of Maps rows is a terms
  decision for the owner; (b) `open_now` is computed at fetch time, so a 6–24 h row would say "đang mở" from
  yesterday unless the cache stored raw records and re-mapped on read (a data-acquisition change); (c) the durable
  store itself (a Supabase table) needs DDL the owner must apply. Expected reduction if approved: Serper is
  $0.005–0.010 per tool turn (191 credits / 40 turns here); the saving equals the share of repeated
  (query, location) pairs across users within the TTL — unknown without production traffic; in this eval every
  query was distinct, so the in-process cache saved 0 and a durable one would have too.

### Cache-friendliness note (item 1)
The prompt order was already static-first (`systemShared` = rulebook + tools, then the request-shaped segment). What
the measurement found instead: the cached prefix has FOUR variants (21 327 / 21 179 / 21 450 / 21 452 tokens)
because the tool SET changes per turn (`search_products` dropped on an "offline" location intent, `search_places` on
a film-recommendation turn). Each variant is its own cache lineage and its own write when cold. Not changed —
dropping a tool deterministically is a quality mechanism — but worth knowing: on a quiet deployment the first turn of
each variant pays ≈$0.027.


## 2026-09-18 owner decisions — measured again (same prices; memory extraction now MEASURED)

Script: `scripts/audit/costseg.mjs <sink> <segment> [--md]` over `docs/audit/eval/cost/usage-owner2.jsonl`
(segments `gate`, `gate2`, `gate3` = large pre-seeded memory; `final` = memory cleared). Memory extraction cost comes
from the `tappyai_usage_memory` lines (real provider usage of the extraction call), no longer an estimate.

| run | turns | tool turns | memory calls | avg $/turn | LLM | Serper | memory | tool turn | no-tool turn | hit rate |
|---|---|---|---|---|---|---|---|---|---|---|
| previous final40 (cost job, same script) | 40 | 29 | 39 (est. $0.004 each → $0.0039/turn) | $0.0263 + $0.0039 = $0.0302 | $0.0216 | $0.0048 | est. | $0.0314 | $0.0128 | 73 % |
| gate (large memory) | 40 | 31 | 6 | $0.0295 | $0.0234 | $0.0059 | $0.0002 | $0.0347 | $0.0127 | 73 % |
| gate3 (large memory, final code) | 40 | 31 | 6 | $0.0286 | $0.0226 | $0.0058 | $0.0002 | $0.0325 | $0.0152 | 74 % |
| **final (memory cleared, final code)** | 40 | 31 | 6 | **$0.0287** | $0.0227 | $0.0058 | $0.0002 | $0.0330 | $0.0158 | 73 % |

Per-turn, final (memory cleared):

| turn | LLM calls | uncached in | cache write | cache read | out | hit | Serper credits | LLM $ | Serper $ | memory $ | total $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | 2 | 5919 | 4782 | 47140 | 655 | 81% | 9 | $0.0199 | $0.0090 | — | $0.0289 |
| F2 | 2 | 3945 | 26762 | 26762 | 642 | 47% | 9 | $0.0433 | $0.0090 | — | $0.0523 |
| F3 | 2 | 3574 | 3914 | 46272 | 568 | 86% | 6 | $0.0159 | $0.0060 | — | $0.0219 |
| F4 | 2 | 4851 | 4184 | 46838 | 714 | 84% | 10 | $0.0183 | $0.0100 | — | $0.0283 |
| F5 (canned) | 0 | 0 | 0 | 0 | 0 | 0% | 0 | $0.0000 | $0.0000 | — | $0.0000 |
| F6 | 2 | 3972 | 5348 | 48002 | 405 | 84% | 9 | $0.0175 | $0.0090 | — | $0.0265 |
| F7 | 2 | 5592 | 5102 | 47756 | 713 | 82% | 6 | $0.0203 | $0.0060 | — | $0.0263 |
| F8 | 2 | 4024 | 25521 | 25521 | 620 | 46% | 6 | $0.0416 | $0.0060 | — | $0.0476 |
| S1 | 2 | 4649 | 29923 | 29923 | 724 | 46% | 3 | $0.0487 | $0.0030 | — | $0.0517 |
| S2 | 2 | 4535 | 29910 | 29910 | 709 | 46% | 3 | $0.0485 | $0.0030 | — | $0.0515 |
| S3 | 1 | 3 | 10325 | 21327 | 498 | 67% | 0 | $0.0175 | $0.0000 | — | $0.0175 |
| S4 | 2 | 4070 | 25105 | 25105 | 632 | 46% | 3 | $0.0411 | $0.0030 | — | $0.0441 |
| S5 | 1 | 3 | 25392 | 0 | 126 | 0% | 0 | $0.0324 | $0.0000 | $0.0013 | $0.0337 |
| S6 | 1 | 3 | 3480 | 21327 | 143 | 86% | 0 | $0.0072 | $0.0000 | — | $0.0072 |
| S7 | 2 | 2281 | 1762 | 44416 | 705 | 92% | 3 | $0.0125 | $0.0030 | — | $0.0155 |
| S8 | 2 | 2331 | 3657 | 46311 | 641 | 89% | 3 | $0.0147 | $0.0030 | — | $0.0177 |
| T1 | 2 | 7560 | 29115 | 29115 | 3778 | 44% | 22 | $0.0658 | $0.0220 | $0.0015 | $0.0893 |
| T2 | 2 | 3639 | 5433 | 48337 | 719 | 84% | 6 | $0.0189 | $0.0060 | $0.0014 | $0.0263 |
| T3 | 1 | 3 | 5188 | 21327 | 195 | 80% | 0 | $0.0096 | $0.0000 | — | $0.0096 |
| T4 | 2 | 2631 | 3914 | 46568 | 690 | 88% | 8 | $0.0156 | $0.0080 | $0.0014 | $0.0250 |
| T5 | 2 | 2406 | 5401 | 47759 | 635 | 86% | 8 | $0.0171 | $0.0080 | — | $0.0251 |
| T6 | 2 | 6467 | 7759 | 50413 | 2196 | 78% | 12 | $0.0322 | $0.0120 | — | $0.0442 |
| T7 | 2 | 394 | 4202 | 46856 | 569 | 91% | 0 | $0.0132 | $0.0000 | $0.0012 | $0.0144 |
| T8 | 2 | 2245 | 5270 | 47924 | 792 | 86% | 13 | $0.0176 | $0.0130 | $0.0015 | $0.0321 |
| P1 | 2 | 4406 | 5139 | 47793 | 653 | 83% | 9 | $0.0189 | $0.0090 | — | $0.0279 |
| P2 | 2 | 4296 | 26796 | 26796 | 617 | 46% | 8 | $0.0436 | $0.0080 | — | $0.0516 |
| P3 | 1 | 3 | 5379 | 21327 | 267 | 80% | 0 | $0.0102 | $0.0000 | — | $0.0102 |
| P4 | 2 | 3532 | 5351 | 47709 | 681 | 84% | 8 | $0.0184 | $0.0080 | — | $0.0264 |
| P5 | 2 | 4240 | 5126 | 47780 | 630 | 84% | 8 | $0.0186 | $0.0080 | — | $0.0266 |
| P6 | 2 | 4008 | 5298 | 47656 | 587 | 84% | 8 | $0.0183 | $0.0080 | — | $0.0263 |
| P7 | 2 | 4261 | 4377 | 46735 | 610 | 84% | 8 | $0.0175 | $0.0080 | — | $0.0255 |
| P8 | 2 | 4251 | 5318 | 47676 | 462 | 83% | 8 | $0.0180 | $0.0080 | — | $0.0260 |
| E1 | 1 | 3 | 5323 | 21179 | 175 | 80% | 0 | $0.0096 | $0.0000 | — | $0.0096 |
| E2 | 2 | 2992 | 5153 | 47807 | 578 | 85% | 8 | $0.0171 | $0.0080 | — | $0.0251 |
| E3 | 2 | 3276 | 5465 | 47823 | 661 | 85% | 8 | $0.0182 | $0.0080 | — | $0.0262 |
| E4 | 2 | 704 | 5570 | 48224 | 294 | 88% | 7 | $0.0140 | $0.0070 | — | $0.0210 |
| E5 | 1 | 3 | 1798 | 21327 | 266 | 92% | 0 | $0.0057 | $0.0000 | — | $0.0057 |
| E6 | 2 | 3432 | 26786 | 26786 | 638 | 47% | 8 | $0.0428 | $0.0080 | — | $0.0508 |
| E7 | 1 | 3 | 25116 | 0 | 287 | 0% | 0 | $0.0328 | $0.0000 | — | $0.0328 |
| E8 | 2 | 2297 | 3702 | 46356 | 696 | 89% | 5 | $0.0150 | $0.0050 | — | $0.0200 |
{
 "label": "final",
 "turns": 40,
 "toolTurns": 31,
 "noToolTurns": 8,
 "cannedTurns": 1,
 "memoryCalls": 6,
 "avgCost": 0.02870717000000001,
 "avgLlm": 0.022696995,
 "avgSerper": 0.005800000000000003,
 "avgMemory": 0.00021017500000000003,
 "avgToolTurn": 0.03296306935483871,
 "avgNoToolTurn": 0.015803956250000004,
 "totalCost": 1.1482868000000004,
 "totalCredits": 232,
 "hitRate": 0.7306936106874923,
 "avgUncachedToolTurn": 3767.0967741935483,
 "avgOut": 654.275,
 "memoryAvgPromptTokens": 935.3333333333334,
 "memoryAvgCompletionTokens": 93.16666666666667
}

Per-turn, gate 3 (large memory):

| turn | LLM calls | uncached in | cache write | cache read | out | hit | Serper credits | LLM $ | Serper $ | memory $ | total $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | 2 | 5980 | 5401 | 47759 | 709 | 81% | 9 | $0.0211 | $0.0090 | — | $0.0301 |
| F2 | 2 | 4030 | 26965 | 26965 | 693 | 47% | 6 | $0.0439 | $0.0060 | — | $0.0499 |
| F3 | 2 | 3883 | 4195 | 46553 | 631 | 85% | 6 | $0.0169 | $0.0060 | — | $0.0229 |
| F4 | 2 | 5750 | 4338 | 46992 | 767 | 82% | 10 | $0.0197 | $0.0100 | — | $0.0297 |
| F5 | 1 | 3 | 4406 | 21327 | 200 | 83% | 0 | $0.0086 | $0.0000 | — | $0.0086 |
| F6 | 2 | 3983 | 5545 | 48199 | 594 | 83% | 9 | $0.0187 | $0.0090 | — | $0.0277 |
| F7 | 2 | 5616 | 5256 | 47910 | 748 | 82% | 9 | $0.0207 | $0.0090 | — | $0.0297 |
| F8 | 2 | 3978 | 4469 | 47073 | 617 | 85% | 9 | $0.0174 | $0.0090 | — | $0.0264 |
| S1 | 2 | 4812 | 30099 | 30099 | 713 | 46% | 3 | $0.0490 | $0.0030 | — | $0.0520 |
| S2 | 2 | 4652 | 30086 | 30086 | 566 | 46% | 3 | $0.0481 | $0.0030 | — | $0.0511 |
| S3 | 1 | 3 | 10512 | 21327 | 504 | 67% | 0 | $0.0178 | $0.0000 | — | $0.0178 |
| S4 | 2 | 4062 | 25355 | 25355 | 673 | 46% | 3 | $0.0417 | $0.0030 | — | $0.0447 |
| S5 | 1 | 3 | 25642 | 0 | 138 | 0% | 0 | $0.0327 | $0.0000 | $0.0016 | $0.0344 |
| S6 | 1 | 3 | 3659 | 21327 | 78 | 85% | 0 | $0.0071 | $0.0000 | — | $0.0071 |
| S7 | 2 | 2293 | 2015 | 44669 | 611 | 91% | 3 | $0.0123 | $0.0030 | — | $0.0153 |
| S8 | 2 | 2652 | 3910 | 46564 | 1102 | 88% | 3 | $0.0177 | $0.0030 | — | $0.0207 |
| T1 | 2 | 7075 | 29365 | 29365 | 3625 | 45% | 22 | $0.0648 | $0.0220 | $0.0017 | $0.0886 |
| T2 | 2 | 3627 | 5535 | 48439 | 765 | 84% | 6 | $0.0192 | $0.0060 | $0.0017 | $0.0269 |
| T3 | 1 | 3 | 5582 | 21327 | 215 | 79% | 0 | $0.0102 | $0.0000 | — | $0.0102 |
| T4 | 2 | 2654 | 4140 | 46794 | 727 | 87% | 8 | $0.0161 | $0.0080 | $0.0016 | $0.0257 |
| T5 | 2 | 2413 | 5503 | 47861 | 729 | 86% | 8 | $0.0177 | $0.0080 | — | $0.0257 |
| T6 | 2 | 6472 | 7875 | 50529 | 2260 | 78% | 12 | $0.0327 | $0.0120 | — | $0.0447 |
| T7 | 2 | 400 | 4290 | 46944 | 760 | 91% | 0 | $0.0143 | $0.0000 | $0.0015 | $0.0157 |
| T8 | 2 | 2237 | 5354 | 48008 | 701 | 86% | 13 | $0.0172 | $0.0130 | $0.0017 | $0.0320 |
| P1 | 2 | 3295 | 5251 | 47905 | 544 | 85% | 8 | $0.0174 | $0.0080 | — | $0.0254 |
| P2 | 2 | 4291 | 26908 | 26908 | 625 | 46% | 8 | $0.0437 | $0.0080 | — | $0.0517 |
| P3 | 1 | 3 | 5391 | 21327 | 194 | 80% | 0 | $0.0098 | $0.0000 | — | $0.0098 |
| P4 | 2 | 3536 | 5463 | 47821 | 666 | 84% | 8 | $0.0185 | $0.0080 | — | $0.0265 |
| P5 | 2 | 4244 | 5238 | 47892 | 653 | 83% | 8 | $0.0188 | $0.0080 | — | $0.0268 |
| P6 | 2 | 3839 | 5410 | 47768 | 580 | 84% | 8 | $0.0183 | $0.0080 | — | $0.0263 |
| P7 | 2 | 4260 | 4489 | 46847 | 567 | 84% | 8 | $0.0174 | $0.0080 | — | $0.0254 |
| P8 | 2 | 4190 | 5430 | 47788 | 552 | 83% | 8 | $0.0185 | $0.0080 | — | $0.0265 |
| E1 | 1 | 3 | 5428 | 21179 | 175 | 80% | 0 | $0.0098 | $0.0000 | — | $0.0098 |
| E2 | 2 | 2986 | 5258 | 47912 | 589 | 85% | 8 | $0.0173 | $0.0080 | — | $0.0253 |
| E3 | 2 | 3274 | 5570 | 47928 | 575 | 84% | 5 | $0.0179 | $0.0050 | — | $0.0229 |
| E4 | 2 | 702 | 5601 | 48255 | 339 | 88% | 7 | $0.0142 | $0.0070 | — | $0.0212 |
| E5 | 1 | 3 | 2006 | 21327 | 221 | 91% | 0 | $0.0057 | $0.0000 | — | $0.0057 |
| E6 | 2 | 3154 | 26891 | 26891 | 832 | 47% | 4 | $0.0436 | $0.0040 | — | $0.0476 |
| E7 | 1 | 3 | 25221 | 0 | 283 | 0% | 0 | $0.0329 | $0.0000 | — | $0.0329 |
| E8 | 2 | 2299 | 3910 | 46564 | 706 | 88% | 8 | $0.0154 | $0.0080 | — | $0.0234 |
{
 "label": "gate3",
 "turns": 40,
 "toolTurns": 31,
 "noToolTurns": 9,
 "cannedTurns": 0,
 "memoryCalls": 6,
 "avgCost": 0.0286227475,
 "avgLlm": 0.0226270475,
 "avgSerper": 0.005750000000000003,
 "avgMemory": 0.0002457,
 "avgToolTurn": 0.032532324193548394,
 "avgNoToolTurn": 0.015156427777777783,
 "totalCost": 1.1449099,
 "totalCredits": 230,
 "hitRate": 0.7408871593468075,
 "avgUncachedToolTurn": 3762.548387096774,
 "avgOut": 680.675,
 "memoryAvgPromptTokens": 1190.5,
 "memoryAvgCompletionTokens": 89.5
}

## 2026-09-19 E1/F8 live confirmation — 12 turns, $0.2867 total (sink `docs/audit/eval/cost/usage-owner3.jsonl`)

Segments `e1f8-run1..5` (E1 + F8 each, memory cleared before every run) and `f8gap-run1..2` (F8 after the
hard-constraint-gap fix `4758f7b`). Report: `docs/audit/live-e1-f8-2026-09-19.md`.

| turn | LLM calls | uncached in | cache write | cache read | out | hit | Serper credits | LLM $ | Serper $ | total $ |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 run1 | 2 | 4880 | 26009 | 26009 | 712 | 46% | 9 | $0.0436 | $0.0090 | $0.0526 |
| F8 run1 | 2 | 4474 | 25485 | 25485 | 579 | 46% | 6 | $0.0418 | $0.0060 | $0.0478 |
| E1 run2 | 2 | 4884 | 4831 | 47187 | 737 | 83% | 0 | $0.0193 | $0.0000 | $0.0193 |
| F8 run2 (asked, no tool) | 1 | 3 | 4184 | 21301 | 168 | 84% | 0 | $0.0082 | $0.0000 | $0.0082 |
| E1 run3 | 2 | 4908 | 4831 | 47187 | 686 | 83% | 1 | $0.0191 | $0.0010 | $0.0201 |
| F8 run3 | 2 | 4474 | 4184 | 46786 | 540 | 84% | 0 | $0.0171 | $0.0000 | $0.0171 |
| E1 run4 | 2 | 4911 | 0 | 52018 | 705 | 91% | 0 | $0.0136 | $0.0000 | $0.0136 |
| F8 run4 | 2 | 4474 | 4184 | 46786 | 636 | 84% | 0 | $0.0176 | $0.0000 | $0.0176 |
| E1 run5 | 2 | 4880 | 4831 | 47187 | 671 | 83% | 0 | $0.0190 | $0.0000 | $0.0190 |
| F8 run5 | 2 | 4474 | 0 | 50970 | 546 | 92% | 0 | $0.0123 | $0.0000 | $0.0123 |
| F8 gap run1 | 2 | 3817 | 25056 | 25056 | 675 | 46% | 6 | $0.0410 | $0.0060 | $0.0470 |
| F8 gap run2 | 2 | 3817 | 0 | 50112 | 656 | 93% | 0 | $0.0121 | $0.0000 | $0.0121 |

Repeated identical queries in one server session hit the in-process Serper cache (0 credits); a cold turn costs
6–9 credits as on 2026-09-18. A new prompt (first run after a code change) pays the cache write (46 % hit), later
runs read it (83–93 %). No memory extraction call fired on any of the 12 turns (neither prompt carries a durable
or destination signal).
