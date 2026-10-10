# SEC4 slice 4 — `translate` / `scan`: cost-sensitivity table at $1, $5 and $10 per day (2026-10-10)

Status: **decision package. Nothing is implemented; no limit below is in the code.** Extends `SEC4-TRANSLATE-SCAN-PROPOSAL.md` (current behaviour, keying, store-failure semantics, acceptance tests). Baseline `23c34a2`. **Production KV, model, reasoning effort and traffic are UNVERIFIED**, so every number is arithmetic on stated assumptions, not a measurement.

## 1. Assumptions (each is a lever; change it and the tables change)
| # | Assumption | Source / status |
|---|---|---|
| A1 | Prices per 1M tokens: input **$0.125** (uncached input is billed at the cache-write rate), output **$0.50** (`gpt-6-luna`, `src/lib/ai/llm/providers/openai.ts`, "read 2026-09-30") | in the repository; **not re-checked live**; if the plain input rate ($0.10) applies, input costs fall 20 % |
| A2 | The served model is that default; reasoning effort `none` for `smart` and `vision` | defaults in code; `LLM_SMART_MODEL`, `LLM_VISION_MODEL`, `LLM_*_REASONING` in production **UNVERIFIED**. A fallback provider exists (`withFallback`) whose price is **not in the repository** |
| A3 | translate input ≤ 2,000 characters (route cap) ≈ 1 token per character in the worst case (CJK / heavy diacritics) → ≤ 2,040 tokens with the instruction; output ≤ 1,024 (route cap). "Typical" = 400 in / 400 out | caps are in the route; "typical" is a judgement |
| A4 | **scan image tokens are NOT in the repository.** Three scenarios: low 1,000 / base 5,000 / high 15,000 input tokens. Output ≤ 2,048 (route cap); "typical" output 800 | judgement. The request cap is ~7.5 MB of image; how many tokens the provider charges for it depends on its resize/tiling rules and on the client (the page compresses? not verified). **This is the largest uncertainty in the whole table: cost per scan differs by 2.5× (worst output) to 4.3× (typical output) between the low and high scenarios** |
| A5 | Counters are consumed before the provider call; a provider failure still consumes quota (no refund) | proposal §4 |
| A6 | An abuser can obtain many addresses (IPv6 trivially; IPv4 via proxy pools) | threat assumption |

## 2. Per-request cost (USD)
| Route / scenario | input tokens | output tokens | cost per request |
|---|---|---|---|
| translate · typical | 400 | 400 | **0.000250** |
| translate · worst (caps) | 2,040 | 1,024 | **0.000767** |
| scan · low image, typical output | 1,000 | 800 | 0.000525 |
| scan · low image, worst output | 1,000 | 2,048 | 0.001149 |
| scan · **base** image, typical output | 5,000 | 800 | 0.001025 |
| scan · **base** image, worst output | 5,000 | 2,048 | **0.001649** |
| scan · high image, typical output | 15,000 | 800 | 0.002275 |
| scan · high image, worst output | 15,000 | 2,048 | 0.002899 |

## 3. Daily ceiling (calls per VN day) a budget buys — `calls = budget ÷ cost`, rounded down
| Budget / day | translate typical | translate **worst** | scan low·typ | scan base·typ | scan **base·worst** | scan high·worst |
|---|---|---|---|---|---|---|
| **$1** | 4,000 | **1,303** | 1,904 | 975 | **606** | 344 |
| **$5** | 20,000 | **6,518** | 9,523 | 4,878 | **3,032** | 1,724 |
| **$10** | 40,000 | **13,037** | 19,047 | 9,756 | **6,064** | 3,449 |

How to read it: a ceiling set from the **worst-cost column** can never be exceeded in spend by assumption (it over-counts typical use by 3× for translate and 1.6× for scan base), so it is the safe-side choice; a ceiling set from the typical column allows more calls but can overspend by that factor if every call is maximal. For scan, the **high-image** column shows what happens if A4 is wrong on the expensive side: the $5 budget would buy 1,724 worst-case scans, not 3,032 — i.e. a ceiling sized on the base column can overspend its budget by up to ~1.8× until the first measured image-token figure replaces A4.

## 4. Per-client limits (unchanged from the proposal; both numbers are recommendations)
| | burst (per client key) | daily (per client key, existing) | worst spend of one client per day |
|---|---|---|---|
| translate | **10 / minute** (precedent: `viet-content` 10/min + 30/day) | 30 (exists) | 30 × 0.000767 = **$0.023** |
| scan | **5 / minute** (judgement; one photo + upload takes ≥ 10 s) | 20 (exists) | 20 × 0.001649 = **$0.033** (base); $0.058 (high) |

"Client key" = the IP (IPv6 normalised to its /64, a proposal), so a fresh anonymous session does not get a fresh allowance (today's property, kept).

## 5. What a ceiling means for anonymous users
Capacity — how many clients can use their **full** daily allowance before the shared ceiling is reached (worst-cost basis):
| Budget | translate (÷30) | scan base (÷20) | scan high (÷20) |
|---|---|---|---|
| $1 | 43 clients | 30 | 17 |
| $5 | 217 | 151 | 86 |
| $10 | 434 | 303 | 172 |
(On the typical-cost basis these are 3×/1.6× higher.) Real users do not use full allowances; whether the capacity is *enough* depends on daily demand, which is **not in the repository** (E2/E3 in `WEB-HANDOFF-NOTES.md`).

Consequences, stated plainly:
1. **When the ceiling is reached, every anonymous user is refused until VN midnight** (`429`, reason `limit_exceeded`, `Retry-After` to midnight, a "busy today" message). Signed-in users are refused too unless the owner exempts or separates them — the tools are anonymous by contract, so the ceiling is shared.
2. **The ceiling turns a spend attack into an availability attack.** An attacker with enough addresses can burn the day's budget cheaply and lock everyone out; the per-client caps bound a person, not this. That is the price of bounding the bill. Mitigations that need an owner decision: a separate (or larger) ceiling for signed-in callers, an alert at 80 %, and a manual raise path.
3. **Shared networks** (carrier-grade NAT, offices, schools) share one client key: 10/min and 30/day (20 for scan) for the whole network. The share of Vietnamese mobile traffic behind such addresses is **unknown**; the 429 rate by reason after rollout is the measurement.
4. **Store outage** (configured but not answering): fail closed for burst, daily and global — all anonymous users refused with `reason=store_unavailable` (not the daily-limit sentence). Store not configured: in-process fallback; the global ceiling is then per instance only.
5. **Nothing changes for a signed-in or anonymous user until the owner approves numbers**: today there is no burst limit, no global ceiling, and the daily caps (30/20) only.

## 6. Decision rule (no budget is recommended)
Choose the daily budget **B** so that `B ≥ (expected legitimate calls per day) × (typical cost) × safety factor`. Expected legitimate calls are unknown (no production data in the repository); until E2/E3 are supplied, a first deployment could start at the smaller of the owner's tolerated loss and a value that supports the clients the owner expects (§5), and revisit after seven days of measured 429s and provider usage. The ceiling must be set per route; this document does not propose a single number because inventing one would be a guess about traffic and about what the owner will tolerate.

## 7. What is still needed before implementation
Owner: the budget per route (or "calls"), whether signed-in users are separated or exempt, the burst numbers, the "busy today" wording in all locales. Production evidence (E2/E3): daily call and 429 counts, provider token usage including image tokens, effective model/reasoning env, KV working. Then the acceptance tests in `SEC4-TRANSLATE-SCAN-PROPOSAL.md` §5 become the implementation slice; `KNOWN_GAP_BUDGET` 5 → 3.
