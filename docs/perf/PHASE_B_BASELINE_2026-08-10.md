# Phase B — Cost Optimization: BASELINE

Captured **2026-08-10**, before any cost change (B3 telemetry only).
Branch `perf/chat-cost-phase-b`, commit `3f6816c`.

Everything below is **measured** unless explicitly labelled an estimate.

---

## 1. How it was measured

| | |
|---|---|
| Server | local `next dev` on :3100, production Supabase, real Anthropic API |
| Client | `chatBench.mjs` — 22 scenarios / 24 turns, anonymous, paced 2.5 s |
| Stream metrics | parsed from the AI-SDK data stream (`e:` per step, `d:` final, `9:` tool call) |
| Server metrics | `tappyai_usage` log line (B3), joined by `aggregate.mjs` |
| Pricing | Haiku 4.5 list: **$1.00 / MTok in**, **$5.00 / MTok out**; cache write **×1.25**, cache read **×0.1** |

### Why Preview was not used
The Preview deployment for PR #34 returns `401 {"protection":{"vercel_auth_enabled":true}}`.
Scripted access needs a **Protection Bypass for Automation** token, which is a Vercel
project-settings change and therefore an owner action. Deferred — see §6.

### Known limitations of this baseline
1. **`GOOGLE_PLACES_API_KEY` and `SERPER_API_KEY` are empty locally** (the Vercel
   Sensitive-variable trap — they are *set* in Vercel, they just pull as `""`).
   `search_places` therefore ran the **OSM/Overpass fallback** and `web_search` ran
   **DuckDuckGo**. Tool-result payloads are consequently **smaller than production**.
   This depresses B4's measured share; B4 is measured separately against a
   production-shaped fixture.
2. **Latency is `next dev` latency**, not production. Absolute values are inflated
   and include on-demand compilation. Valid only for *relative* before/after
   comparison in the same mode.
3. **The run is anonymous**, so no `memoryBlock`/`prefBlock` and no memory-extraction
   call. This makes the cache hit rate **far better than production** — see §3.

---

## 2. Totals — 24 turns

| Metric | Value |
|---|---:|
| Turns OK / failed | 24 / 0 |
| LLM calls (stream steps) | **42** |
| Memory-extraction calls | 0 *(anonymous run)* |
| Tool calls | **26** |
| Uncached input tokens | 45 750 (8.4 %) |
| Cache **CREATE** tokens | **179 190 (33.0 %)** — billed ×1.25 |
| Cache **READ** tokens | 318 476 (58.6 %) — billed ×0.1 |
| **True input total** | **543 416** |
| Output tokens | 9 312 |
| Billed input units | 301 585 |
| **Estimated cost** | **$0.34815** |
| Mean latency (dev) | 12 821 ms |
| Mean TTFB (dev) | 1 508 ms |

> ⚠️ The harness's own stream-derived total was $0.09231. That figure is **wrong by
> 3.8×** because Anthropic reports `promptTokens` **excluding** cached tokens. True
> input = `promptTokens + cacheCreationTokens + cacheReadTokens`. Never read
> `promptTokens` alone as "prompt size".

### Per intent

| intent | turns | true input | avg input/turn | output |
|---|---:|---:|---:|---:|
| `chitchat` | 3 | 7 971 | **2 657** | 415 |
| `tool` | 21 | 535 445 | **25 497** | 8 897 |

---

## 3. What the numbers say

**~97 % of all input is the repeated prefix.** The cacheable prefix (tools + system)
measures **13 162 tokens**; a tool turn runs 2 steps and re-sends it each time —
2 × 13 162 = 26 324, against a measured average of 25 497 true input tokens per tool
turn. Tool results and user text are rounding error by comparison.

**The 64 % cache hit rate here is the best case, not the typical case.** Every turn in
this run is anonymous, so all 21 tool turns share one byte-identical prefix, and they
run back-to-back inside the same minute. Production has neither property. The
dedicated cache probe (`src/lib/ai/__measure__/cacheProbe.test.ts`, run with
`TAPPY_MEASURE=1`) isolates it:

| probe | promptTok | cacheCreate | cacheRead |
|---|--:|--:|--:|
| A1 identical (cold) | 7 | 11 056 | 0 |
| A2 identical (warm) | 7 | 0 | 11 056 |
| B1 t = now | 7 | 0 | 11 056 |
| **B2 t = now + 1 min** | 7 | **11 056** | **0** |
| **C1 user A** | 7 | **11 100** | 0 |
| **C2 user B** | 7 | **11 102** | **0** |

- **A** — the `cache_control` wiring is correct.
- **B** — the minute-precision timestamp at the head of the system prompt re-bills the
  whole prefix every minute.
- **C** — per-user memory sits *ahead* of the static base, so two users never share it.
  Cross-user hit rate is **0 %**.

**Chitchat pays for tools it cannot use.** A chitchat turn averages **2 657** input
tokens, of which ~2 400 is the tool-definition block — `maxSteps: 1` means it can never
call one. At 2 657 it is also below Haiku 4.5's **4 096-token minimum cacheable
prefix**, so `cacheCreationTokens` is 0: chitchat can never be cached at all.

---

## 4. Correction to the Phase A audit

> **Phase A finding P0-2 ("`toolChoice:'required'` forces a paid tool call on every
> message over 40 characters") is WRONG. Withdrawn.**

`src/lib/ai/llm/ai.ts` passes the route's `prepareStep` to `streamText` as
`experimental_prepareStep`. In `ai@4.3.19` that option is destructured by
**`generateText` only** (bundle line 4177). `streamText` (line 5193) destructures
`toolChoice` and `maxSteps` but **never** `experimental_prepareStep`, and 4177 is the
option's only occurrence in the bundle.

**The route's entire `prepareStep` block is dead code.** Nothing has ever forced a tool
choice: production has always run at the SDK default, `toolChoice: 'auto'`.

The baseline confirms it behaviourally — scenarios whose regex *should* have forced a
tool did not call one:

| scenario | expected by `prepareStep` | actual |
|---|---|---|
| s03/s04 social-long (>40 chars) | `toolChoice:'required'` → 1 tool | **0 tools** |
| s10 `Gợi ý quán ăn ngon ở Quận 1` | forced `search_places` | **0 tools** |
| s11 same query in English | forced `search_places` | 1 tool |

The inconsistency is model discretion, which is exactly what `auto` produces.

`detectForcedTool` is **not** wasted work — it still shapes `buildMemoryBlock()` and the
`skipDetailBlocks` branch of `buildSystem()`. Only its effect on tool *choice* is inert.

**Consequences for the plan**
- The forced-tool cost defect does not exist, so B5's saving is **0**. B5 is re-scoped
  from "cost fix" to "remove a latent hazard": the `@ts-ignore` in `ai.ts` asserts the
  option "exists in the AI SDK at runtime", which is false for `streamText`. An `ai`
  upgrade (AI SDK 5 *does* support `prepareStep` on `streamText`) would silently
  activate forcing and raise cost with no code change.
- Chitchat's `toolChoice:'none'` is equally inert, so the ~2 400-token tool block is
  charged on every chitchat turn. Not declaring tools for chitchat is a real saving and
  folds into **B2**.

---

## 5. Targets

| Change | Lever | Expected effect on this baseline |
|---|---|---|
| **B1** | day-rounded clock + static prefix first | move CREATE → READ (×1.25 → ×0.1) and make cross-user sharing possible |
| **B2** | one frozen tool set; no tools on chitchat | one cache lineage; chitchat ~2 657 → ~300 input tokens |
| **B4** | keep enrichment out of model context | measured separately (production-shaped fixture) |
| **B5** | delete dead `prepareStep` | 0 saving; removes an upgrade landmine |
| **B6** | gate memory extraction | not visible in this anonymous baseline; measured separately |
| **B7** | drop per-place Places Details; Redis cache | fewer billable upstream calls |

---

## 6. Open item for the owner

Preview deployments are protected by Vercel Authentication, so no script can reach
them. To get one **production-representative** end-to-end run (real Google Places and
Serper payloads, real production latency), the project needs
**Settings → Deployment Protection → Protection Bypass for Automation** enabled and the
secret shared. That is an owner-only settings change; I have not made it. Until then,
tool-payload and latency figures come from the local fallback path and are labelled as
such.
