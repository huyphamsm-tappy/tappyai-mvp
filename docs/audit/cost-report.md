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
_(appended per item)_
