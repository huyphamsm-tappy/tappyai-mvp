# Phase 8 — M3 latency architecture pass (WEB, `TAPPY_AGENT=2`)

Date 2026-10-08 · worktree `D:/TappyAI-wt/wtagent8` · branch `p8/agent-runtime` (local) · on top of M3 `0bd6fae`.

**ANDROID: NOT TOUCHED · iOS: NOT TOUCHED · PRODUCTION: NOT MODIFIED**

Principle applied: **fast by default, deep only when necessary.** Six model rounds is a ceiling, not a workflow. Nothing was removed: page reading, evidence (FACT / INFERENCE / UNKNOWN / CONFLICT), citations, security and source verification are all still there. Only orchestration overhead was cut.

Measurement:
- `scripts/agent-eval/latency.mjs` reads the run traces of an eval run and splits each turn into model / search / page-fetch / extraction / claims-call / tool wall / orchestration time.
- Same 8 research scenarios (9 turns) as M3, plus the 53-turn regression set (M0 + M1 + M2).
- Real Luna, real public pages (recorded locally on first read), Serper record / replay.

## A. Current latency breakdown (M3 before this pass: 18 research turns, two runs)

| component | p50 | p90 | max | mean | share of mean |
|---|---|---|---|---|---|
| **total** | 14.46 s | 21.30 s | 22.68 s | 13.95 s | |
| model (all rounds) | 8.46 s | 12.92 s | 13.22 s | 8.40 s | **60 %** (3.7 rounds × ≈ 2.3 s) |
| per-page claims call | 2.31 s | 7.76 s | 8.30 s | 2.82 s | **20 %** (sequential per page) |
| search | 1.72 s | 4.96 s | 5.27 s | 2.09 s | 15 % (several searches one after another) |
| page fetch (replayed in eval) | 0.01 s | 1.39 s | 1.99 s | 0.37 s | 3 % |
| extraction | 0.00 s | 0.00 s | 0.00 s | 0.00 s | — |
| orchestration | 0.03 s | 0.15 s | 4.03 s | 0.26 s | outlier: tracker wait (RS-F1) |
| model rounds | 3 | 6 | 6 | 3.7 | |
| tool calls · pages | 2 · 1 | 5 · 2 | 5 · 3 | 2.8 · 1.2 | |
| cost / turn | $0.0021 | $0.0047 | $0.0065 | $0.0026 | |

## B. Root cause

1. **Model ↔ tool ping-pong.** Luna makes one tool call per step. "search → open a result → open another → answer" cost one model round per hop (≈ 2.3 s each): model → tool → model → tool → model … up to 6 rounds.
2. **A mandatory Luna call per page** (the M3 claims extraction): 1.5–3 s per page, sequential inside `read_page`, plus usually one more round to digest it.
3. **Sequential searches:** a research turn needing two angles (Vietnamese + English, or a `site:` query) searched one after the other, each in its own round.
4. **The task tracker blocked fast replies.** After the loop, the turn waited up to 4 s for the M2 tracker. A 3 s direct answer took 7 s (RS-F1).
5. **Dead pages** were retried in later rounds: a government PDF, and an unreachable host behind a 4 s connect timeout.

## C. Architecture changes

| change | file | effect |
|---|---|---|
| **No per-page model call.** Candidate evidence is built deterministically from the bounded extract (`candidateClaims`): sentences carrying ≥ 2 of the focus's term groups → STATED (quote = the sentence, value = its quantity); partly matching sentences with a figure → IMPLIED; nothing → NOT FOUND. Structured data stays FACT. The ledger classifies exactly as before (quote verified, reliability by source type × kind, CONFLICT across sources). Bilingual term groups (pin ↔ battery, dung lượng ↔ capacity, giá / lệ phí ↔ price / fee, …) and **unit-aware** comparison (hours never compared with GB, a bare count never with a %). | `runtime/evidence.ts` | −2.8 s mean, −8.3 s worst |
| **Parallel page reads.** One page reader per turn: `read_page` takes 1–3 URLs fetched in parallel. Page budget, de-duplication, failure memo and the 30-minute cache are shared. | `runtime/readPage.ts` | 3 pages ≈ 1 fetch |
| **Search + read in one call.** `web_search` takes 1–3 queries **run in parallel** and `read` 0–3: the best results are opened in parallel in the same call (official / government first, one page per host, never a PDF or a host that failed this turn). If opened pages fail, one second wave tries the next results. Luna still decides (`read: 0` = snippets suffice). Normal research = **2 model rounds**. | `runtime/researchSearch.ts` | −1 to −3 rounds |
| **The tracker is off the reply path.** Its delta is applied after the answer; the route awaits `settled` only before persisting (after the last byte). | `runtime/index.ts`, `route.ts` | −up to 4 s on fast turns |
| **Sufficiency hint** in research results ("N sources · FACT … — if enough, answer now"), and a **research nudge** after two research calls this turn. Both are guidance; the ceilings are unchanged and traced. | `readPage.ts`, `loop.ts` (`stepNote`), `index.ts` | stops chains |
| Instructions: "NHANH theo mặc định, SÂU khi cần": search + open in one step, related pages in one `read_page`, research again only for a missing or conflicting point. | `runtime/prompt.ts` | |
| Connect timeout 4 s → 3 s (total 8 s unchanged). | `security/safePageFetch.ts` | faster failure |

**Why the claims call was not kept:** the eval showed no semantic task that needed it.
- Matching the focus against the extract (with bilingual term groups) recovers the claims: FACT 25–26 per run against M3's 12.
- Conflicts are detected in both runs, including the cross-language case (seller "pin 100%" vs report "Maximum Capacity 74%").
- Luna interprets the evidence in its normal next round anyway.

`addClaims` still accepts model-reported claims (same classification) if a future case needs it.

## D. Model rounds, before → after

| | before (M3) | after |
|---|---|---|
| research set: mean · p90 · max | 3.7 · 6 · 6 | **2.4 · 3 · 3** |
| research set: tool calls mean · max | 2.8 · 5 | **1.4 · 2** |
| regression set: mean · p90 · max | 1.91 · 3 · 6 | **1.75 · 2 · 3** |

Typical shapes now:

| shape | rounds |
|---|---|
| direct | 1 |
| simple search | 2 (search → answer) |
| normal research | 2 (search + parallel reads → answer) |
| deep | 3 (one more targeted search / read) |

## E. p50 / p90, before → after

| | p50 | p90 | max | mean |
|---|---|---|---|---|
| **research set (M3)** | 14.46 s | 21.30 s | 22.68 s | 13.95 s |
| **research set (after, 2 runs)** | **7.25 s** | **11.84 s** | **12.96 s** | **7.85 s** |
| └ model | 8.46 → 5.62 s | 12.92 → 7.50 s | | 8.40 → 5.57 s |
| └ claims call | 2.31 → **0** | 7.76 → **0** | | 2.82 → **0** |
| └ search (incl. reads opened by it) | 1.72 → 1.86 s | 4.96 → 5.03 s | | 2.09 → 2.33 s |
| **regression set (M3)** | 5.04 s | 14.32 s | 25.68 s | 6.71 s |
| **regression set (after)** | **4.53 s** | **10.51 s** | **18.30 s** | **5.95 s** |

Against the target UX (research set, after):

| class | target | measured |
|---|---|---|
| direct (RS-F1) | 1–3 s | 3.1–3.3 s |
| simple search / one official page (RS-B2, RS-G1) | 2–5 s | 3.4–7.3 s |
| normal research (RS-D1, RS-A1, RS-B1, RS-E1) | 4–8 s | 5.4–13.0 s |
| deep | 8–15 s | ≤ 13 s |

**Normal research is not yet inside 4–8 s at the top end.** The remaining time is mostly the two model rounds themselves (≈ 2.4 s each at reasoning effort none), plus long final answers (checklists) whose generation time grows with length. See §I.

## F. Cost, before → after

| | before | after |
|---|---|---|
| research set: mean / turn | $0.0026 | $0.0034 |
| regression set: mean / turn | $0.0037 | $0.0040 |

Luna cost went down: no claims calls, fewer rounds. Serper and pages went up: `web_search` now runs 1–3 queries per call and opens slightly more pages (1.2 → 1.4 per research turn). The net is **+$0.0008 per research turn**. Tunable (fewer default queries) if cost matters more than recall.

## G. Research quality, before → after (quality gate)

| research set | M3 (2 runs) | after (2 runs) |
|---|---|---|
| turns passing all checks | 8/9 · 7/9 | **8/9 · 8/9** |
| page read when needed | 6/6 · 5/6 | **6/6 · 6/6** |
| official source used | 4/4 · 3/4 | **4/4 · 4/4** |
| sources attributed (links) | 5/5 · 4/5 | **5/5 · 5/5** |
| CONFLICT detected · explained | 1/1 · 1/1 (both) | **1/1 · 1/1 (both)** |
| seller claim flagged UNKNOWN | 1/1 (both) | **1/1 (both)** |
| evidence FACT · INFERENCE · UNKNOWN · CONFLICT | 12 · 5 · 30 · 2 / 13 · 0 · 21 · 1 | 26 · 0 · 8 · 2 / 25 · 0 · 10 · 1 |
| regression set (53 turns) | 51/53 | 50/53 |

- **FACT** is more frequent and still verified: quote in the page + reliable source for the kind.
- **UNKNOWN** stays where it belongs: a page that does not say, or a weak source's claim.
- **CONFLICT** is unchanged (both runs).
- **INFERENCE** appears less in research runs. Deterministic matching assigns it only when a page partly matches; most inference now lives where it belongs, in Luna's reasoning over FACT / UNKNOWN evidence ("nếu số liệu đúng thì…"). It is still produced and unit-tested.
- **The remaining research miss is explainable and is not research quality.** RS-C1 (Hội An) missed in both runs. In the run inspected, Luna's raw reply began with *"Nguồn cập nhật gần đây nêu vé **80.000đ** … **120.000đ** … [S2]"*, and the **travel guard deleted that sentence** (trace: `guard stage travel, removed 25`, and the opening sentence is gone from the delivered text). Page evidence is not yet guard evidence. This is an **M4 regression case**, recorded and not fixed here.
- **The 8/9 and 7/9 M3 runs remain explainable:**
  - RS-D1 is a checker wording miss;
  - RS-B1 had an upstream 404, and is now handled by the second wave / other results;
  - RS-C1 is the guard above.
- **Regression misses:**
  - D-2 "1 inch = 2,54 cm." is a correct 17-character answer, failing the eval's ≥ 20-character "non-empty" check (a checker artefact);
  - P-2 and FU-G1 t2 are the known variance cases.

## H. Tests

New / changed: **+11 tests**.
- `research.test.ts` (now 43):
  - deterministic FACT / INFERENCE / UNKNOWN (not found + weak seller) / CONFLICT;
  - **cross-language CONFLICT**; unit-aware comparison;
  - **parallel fetch** (3 pages, peak concurrency 3, ≈ one fetch time);
  - page budget across one call; failure memo;
  - web_search: **parallel queries** (peak 2), merge, official-first page choice, one per host, PDF / failed-host skip, **second wave** on failure, sufficiency note.
- `runtime.test.ts`: research nudge appended to non-final steps only, and traced.
- `researchLoop.test.ts`:
  - normal research in **1 tool call / 2 model rounds** (search + official page opened in the same call);
  - all M3 loop properties kept: conflict + citations + trace order, no crawl chain, user link, budgets, search optional, evidence in the task, invalidation.
- `taskTracker.test.ts`: the tracker lands after the reply (`settled`) and a late tracker is still aborted.
- Route tests updated for the new call shapes. The citation still survives the real stream pipeline as a sanitised link.

Security and SSRF: `safePageFetch.test.ts` (39) unchanged and green; prompt-injection tests unchanged and green.

Found by the full suite and fixed:
- Some servers send a compressed body although we ask for `identity`; three such pages reached the extractor as binary text. The fetcher now refuses a non-identity `content-encoding` (`unsupported_encoding`, new test). It does not decompress, since that would bypass the byte cap.
- Eval page recordings moved out of the repository tree (system temp folder; repo hygiene scans `scripts/`).

**Regression (final tree):** `npm test` 1,085 files / **17,911 passed, 0 failed** (1 expected-fail, 84 skipped: live / paid suites) · `tsc --noEmit` 0 · `npm run lint` 0 errors · `architecture:check` 15/15 · control-byte guard clean · `repoHygiene` recording ceiling 2542 → 2678 (deliberate, the latency-pass eval runs).

## I. Remaining risks

1. **Per-round model latency (≈ 2.4 s at effort none, ~7.8 k-token prompt) is now the floor.** The prompt carries ~13 tool schemas on every step. The M6 deferred tool registry is the planned lever. Streaming the final answer would cut perceived latency but conflicts with buffered guards (M4 / M7 topic).
2. **Long answers are slow to generate** (a 6 s final round for a checklist). That is answer length, not orchestration.
3. **Route after-loop work** (card photos / TikTok on place turns) adds ≈ 2 s at p90 on ordinary turns. It sits outside the agent loop and is a candidate for parallelising with the final model round later.
4. **Deterministic matching is lexical:** paraphrases without any shared term group are missed (the page is still summarised by its passages, which Luna reads). The term groups are a curated list, so new domains may need entries.
5. **Cost +$0.0008 per research turn** from parallel queries and slightly more pages.
6. **Guards still delete page-sourced figures** (RS-C1 travel guard) → M4.

ANDROID: NOT TOUCHED · iOS: NOT TOUCHED · PRODUCTION: NOT MODIFIED
