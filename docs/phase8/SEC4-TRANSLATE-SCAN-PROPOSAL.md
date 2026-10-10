# SEC4 slice 4 — `translate` and `scan`: cost-based PROPOSAL (2026-10-10)

Status: **proposal only (cost-sensitivity at $1/$5/$10 per day: `SEC4-TRANSLATE-SCAN-SENSITIVITY.md`). Nothing in `src/app/api/translate` or `src/app/api/scan` was changed, and no limit below is implemented.** Every number in §3–§4 is a *recommendation derived from stated assumptions*; the assumptions are listed in §6 and the owner supplies the budget. Baseline `4bfb3d4`. Production KV configuration and runtime wiring remain **UNVERIFIED**.

## 1. Current behaviour (read from the code)
| | `POST /api/translate` | `POST /api/scan` |
|---|---|---|
| Caller | `(app)/translate/page.tsx` — one request per explicit button press (no auto-translate, no debounce loop) | `(app)/scan/page.tsx` — one request per explicit "scan" press |
| Authentication | none; anonymous allowed (`anonymousWriteBoundary`: "anonymous tool") | none; anonymous allowed |
| Limiter | `publicDailyRateLimit('translate:<ip>', 30)` — **daily only** | `publicDailyRateLimit('scan:<ip>', 20)` — **daily only** |
| Burst cap | **none** — 30 requests can be fired in one second | **none** |
| Global ceiling | **none** | **none** |
| Key | `clientIp(req)`: `x-vercel-forwarded-for` → `x-real-ip` → rightmost `x-forwarded-for` → `'unknown'` (shared bucket) | same |
| Day boundary | VN calendar day (date is part of the key) | same |
| Store semantics | store configured → shared; **no store configured → in-process only**; **configured but not answering → fail closed** (429) | same |
| Input bounds | `text` ≤ 2000 chars (400 `too_long`); empty → 400; target language from an allowlist, unknown → Vietnamese | base64 ≤ 10,000,000 chars (≈ 7.5 MB binary), MIME allowlist (else JPEG); no dimension limit |
| Model call | `AI.generate({ role: 'smart', maxTokens: 1024 })` | `AI.vision({ role: 'vision', maxTokens: 2048 })` |
| Order of work | limiter → parse → validate → model | limiter → parse → size check → model (the whole body is parsed *after* the limiter, so a refused request costs a header read plus one store call) |
| Refusal body | `429 {error:'rate_limit', message: translate.dailyLimit}` — **no `reason`**, so a store outage prints the *daily-limit* sentence | `429 … rate.scanLimit` — same |

Neither route was migrated to `rateLimitedResponse`, so the quota-vs-outage distinction added in `7570304` is **not yet visible** here.

## 2. Cost drivers
* **Model price (in-repo, not live):** `src/lib/ai/llm/providers/openai.ts` carries list prices for the default model `gpt-6-luna` (read 2026-09-30): input $0.10 / 1M, cache-write $0.125 / 1M (uncached input is billed at the cache-write rate), output $0.50 / 1M. The `smart` and `vision` roles run at reasoning effort `none` unless `LLM_<ROLE>_REASONING` is set (**environment value UNVERIFIED**; a higher effort would add reasoning tokens and invalidate §3). `LLM_SMART_MODEL` / `LLM_VISION_MODEL` may override the model (**production values UNVERIFIED**). A fallback provider exists (`withFallback`); its price is **not in the repository**.
* **translate:** input ≤ 2000 chars. Worst case for tokenisation is ~1 token per character (CJK / heavy diacritics) → ≈ 2,040 input tokens with the instruction; output ≤ 1,024 tokens.
* **scan:** input is an image. **Vision token count for this model is not in the repository** (assumption A3 below); output ≤ 2,048 tokens. The image body itself also costs function memory/bandwidth (≤ ~7.5 MB per request) even when refused *after* parsing — the refusal happens before parsing, so that part is already avoided.
* **Worst-case spend per call** (arithmetic, using the list prices above and assumptions A1–A3): translate ≈ 2,040 × $0.125e-6 + 1,024 × $0.50e-6 ≈ **$0.00077**; scan ≈ 5,000 × $0.125e-6 + 2,048 × $0.50e-6 ≈ **$0.00165**.
* **Worst case per IP per day with today's caps:** translate 30 × $0.00077 ≈ **$0.023**; scan 20 × $0.00165 ≈ **$0.033**.

The per-call cost is small. **The exposure is not one IP; it is the number of distinct keys an attacker can mint.** The key is the IP: an IPv4 attacker with a proxy pool, or any IPv6 attacker (a single /64 is 2⁶⁴ distinct addresses), gets a fresh 30 / 20 per address, so the per-IP daily cap bounds a *person*, not the *bill*. Only a **global ceiling** bounds the bill.

## 3. Recommended controls (proposals; none implemented)
### 3.1 Burst limit per client
| Route | Recommended | Basis |
|---|---|---|
| translate | **10 / minute / client key** (in addition to the existing 30 / day) | exact precedent: `viet-content` uses 10 / min + 30 / day for the same kind of anonymous text tool. A human pressing a button and reading the result is far below 10 / min. |
| scan | **5 / minute / client key** (in addition to 20 / day) | assumption A4: a scan needs a photo capture or file pick plus an upload (typically ≥ 10 s). No in-repo precedent for a vision burst; this is a judgement. |

### 3.2 Global daily ceiling (the control that bounds the bill)
One shared counter per route, key `translate:global:<VN date>` / `scan:global:<VN date>`. **The number is a budget decision.** The mapping, from the worst-case per-call cost in §2 (so it over-counts real spend and therefore errs safe):

| Daily budget for the route | translate calls / day | scan calls / day |
|---|---|---|
| $1 | 1,303 | 606 |
| $5 | 6,518 | 3,032 |
| $20 | 26,076 | 12,128 |

(`calls = budget ÷ worst-case cost`; recomputing with actual usage records will give a higher ceiling for the same budget.) **Recommendation:** choose the budget, apply the table, alarm at 80 %, and revisit after one week of measured usage. *The repository contains no production usage data for either route* (`UNVERIFIED`), so the ceiling cannot be calibrated against real demand here.

### 3.3 Keying
* Keep the IP as the primary key (the routes are anonymous by contract; a fresh anonymous session must not mint a fresh allowance — this property exists today and must be kept).
* **IPv6:** key on the /64 prefix, not the full address, for these two routes (otherwise the per-client caps are trivially bypassed). Needs a small normaliser plus tests; `clientIp` itself is shared by many routes and is **not** to be changed in this slice.
* Known false-positive: carrier-grade NAT and office networks put many people behind one address; they share 10 / min and 30 / day. The VN mobile-carrier share of traffic is unknown (**UNVERIFIED**); watch the 429 rate by `X-RateLimit-Reason` after rollout.
* The existing `'unknown'` bucket (no resolvable address) stays shared on purpose.

### 3.4 Store-failure semantics
| Situation | Recommended |
|---|---|
| Store not configured (preview, local, fork) | in-process fallback for burst and daily (as today); **the global ceiling is then per-instance only** and the docs/log line must say so |
| Store configured but not answering | **fail closed** for all three counters (these are spend routes, owner decision D2 already applies to them). Refusal is `429` with `X-RateLimit-Reason: store_unavailable` and `Retry-After`; the body must **not** say "daily limit". Needs a new server message key in every locale (the i18n ratchet requires all locales) |
| Global ceiling reached | `429`, reason `limit_exceeded`, `Retry-After` to the next VN midnight, a "service is busy today" message |
| Burst / daily reached | `429`, reason `limit_exceeded`, existing messages |
| Malformed store reply | classified as `store_unavailable` (already how `distributedRateLimit` behaves since `7570304`) |

Alternative considered: fail open to in-process during an outage. It would keep the tools working but remove the only real cap during exactly the period nobody is watching; rejected for spend routes (contrast with the message-send route, where the cost is a database row — see `MESSAGE-SEND-LIMITER-AUDIT.md`).

## 4. Order of checks (to keep a refusal cheap)
`burst → daily → global → parse → validate → provider`. A refused request must not parse the body or touch the provider. (Today: daily → parse → validate → provider; the parse of a 10 MB scan body happens only after the daily check.) Counters are consumed *before* the provider call, so a provider failure still consumes quota — the same trade-off the neighbouring routes already make; refunding on provider failure is **not** proposed.

## 5. Acceptance tests (must exist before implementation is merged)
1. Burst: the 11th translate (6th scan) within a minute from one key is refused; a different key is unaffected; the window slides.
2. Daily: unchanged limits (30 / 20), VN-midnight rollover (injected clock).
3. Global: the request after the ceiling is refused for *every* key; 80 % crossing emits one structured log line.
4. IPv6: two addresses in one /64 share the counters; two different /64s do not; IPv4 unchanged.
5. Store semantics: not configured → in-process; configured+down → closed with `reason=store_unavailable` for burst, daily **and** global; the message is not the daily-limit sentence; no provider call in any refusal.
6. Refusal is cheap: the body is not read and the provider function is not called (mock call counts).
7. Mutation: removing any one of the three counters, swapping the check order, or consuming after the provider call fails the suite.
8. Registry: both entries become `covered` with limiters `public` (and the burst/global recorded in the key text); `KNOWN_GAP_BUDGET` 5 → 3.

## 6. Assumptions (each one changes a number if it is wrong)
* **A1** Prices are the in-repo `gpt-6-luna` list prices read on 2026-09-30; the production model may differ.
* **A2** Reasoning effort is `none` for `smart` and `vision` in production (default; env UNVERIFIED).
* **A3** An uploaded image costs ≤ 5,000 input tokens. *Not in the repository.* The first measured provider usage record replaces this (whether the existing observability events carry per-call token usage for these two routes was NOT verified; the provider dashboard is the reliable source).
* **A4** A human cannot complete more than ~5 scans or ~10 translations a minute through the current UI.
* **A5** The shared store is Upstash KV reached through the same helper the other public routes use; production wiring is **UNVERIFIED**.
* **A6** An attacker can obtain many distinct addresses (IPv6 certainly; IPv4 via proxy pools).

## 7. Owner decisions needed
1. The daily budget (or the call ceiling) per route.
2. Burst numbers — accept 10 / 5 per minute or give others.
3. Whether either tool should require a signed-in account in future (this proposal keeps them anonymous).
4. Approval of fail-closed on a store outage, and the wording of the new "temporarily unavailable" message (all locales).
5. Authorisation to read production usage (request counts per day per route, token usage) so §3.2 can be calibrated.

## 8. Evidence still required from production
Daily request counts and 429 counts for `/api/translate` and `/api/scan`; provider usage records (input/output tokens, image tokens) for both roles; the effective `LLM_PROVIDER`, `LLM_SMART_MODEL`, `LLM_VISION_MODEL`, `LLM_*_REASONING` values; confirmation that the KV pair is set in *Production* and answers (`Preview` also carries production keys, finding F-062).
