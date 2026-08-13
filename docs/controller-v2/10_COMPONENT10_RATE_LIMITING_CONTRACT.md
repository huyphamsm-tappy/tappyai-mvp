# Controller V2 — Component 10: Rate Limiting — CONTRACT

**Status:** CONTRACT — authoritative and current · **Date:** 2026-08-13
**Baseline:** `origin/main` = `bef923cb4a3083b9ea700d566983cf219c6de808` · production `/api/version` = same
**Component status:** **C10 = NOT DONE**
**Authorized by:** Owner Decision **B = Option B (require C10 spec first)** — see [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md)

**No code was written for this document.** It is specification only. Implementation is separately authorized and is currently blocked on infrastructure the Owner must provision (§9).

---

## 0. Why this document exists

Component 10 had no contract document. That absence was itself the problem: a reviewer looking only at the source would find a rate limiter on every admin route and reasonably conclude the component was done. It is not, and the repository already says so — in three places, under three different identifiers, for the same defect.

| Identifier | Where | Severity | State |
|---|---|---|---|
| **S4** | [`02_PHASE0_AUDIT.md`](02_PHASE0_AUDIT.md) §Security — *"Rate limiting does not limit in production"* | **HIGH** | open |
| **G4** | [`00_LEGACY_AUDIT.md`](00_LEGACY_AUDIT.md) — *"Rate limiting does not limit anything in production"* | — | open |
| **R2** | prior readiness review (cited by both of the above) | — | open |

All three describe one defect. This contract closes it under the name **S4**.

---

## 1. PURPOSE

1. **Close S4.** The approved Component table in [`03_PHASE1_FOUNDATION_DESIGN.md`](03_PHASE1_FOUNDATION_DESIGN.md) defines C10 as:
   > `10 | Rate Limiting | Shared store; real global caps (closes S4)`
   and the Phase 0 remediation table maps it as:
   > `4 | Distributed rate limiting — shared store; real global caps | S4`
2. Keep every admin read and mutation surface rate-limited at its assigned limit.
3. Replace an instance-local approximation with a **real global cap**.

**This is not an architectural preference.** S4 is an open HIGH finding, and the requirement wording is quoted verbatim from the owner-approved scope document (owner approval 2026-08-03, three ordered blocks).

> **Note on document authority.** `00_`, `01_`, `02_` and `03_` carry *"HISTORICAL / SUPERSEDED STATUS"* banners. Those banners scope themselves explicitly to each document's `Status:` line, verdicts, and "not yet done" statements — they do not void design content or security findings. [`STATUS.md`](STATUS.md), the declared single source of truth, contains **no** statement about rate limiting, so nothing supersedes S4.

---

## 2. STORAGE

- The authoritative counter **MUST** live in a **shared store** reachable by every concurrent Vercel serverless instance.
- An in-process `Map` **MUST NOT** be the authoritative counter.
- A per-instance cache in front of the shared store is permitted only if it cannot cause the global cap to be exceeded.

**Implementation note (added 2026-08-13).** The limiter talks to Upstash over its REST endpoint directly with `fetch`, rather than through the `@upstash/redis` SDK. The decision runs as a single Lua script via `EVAL`, so the whole read-prune-count-write sequence is **atomic** inside Redis. That is what makes two of this contract's requirements true rather than merely intended: a rejected request cannot increment the counter, and two concurrent requests cannot both observe `limit - 1` and both be admitted. Adding the SDK would buy nothing here and would put a client object between the code and a single well-understood HTTP call.

`src/lib/scam-shield/cache/redisCache.ts` remains the in-house precedent for *credential handling* — read from the environment, no client when the variables are absent. It is a cache and degrades silently; this limiter is a security control and does the opposite (§8).

---

## 3. KEYING

- Keyed by **admin `user_id`**.
- Namespace preserved exactly as today: **`admin:<area>:<action>:<user_id>`**.
- All 14 current keys are distinct; no route pair collides.
- **No IP-based requirement.** `clientIp()` exists in `rateLimit.ts` but no admin route uses it, and no authoritative source requires per-IP limiting for the admin surface. Do not add one.
- Keys may contain a `user_id`. They **MUST NOT** be written to logs or returned in any response body or header.

---

## 4. ALGORITHM

Preserve the current **sliding window** semantics. Stated precisely enough to test:

- A request at time `t` is admitted iff the number of previously admitted requests for the same key with timestamp `> t − windowMs` is **strictly less than** `limit`.
- On admission, `t` is recorded against the key.
- On rejection, **nothing is recorded** — a rejected request must not extend the window.
- `retryAfter` = `max(1, ceil((windowMs − (t − oldestTimestampInWindow)) / 1000))`, in **seconds**.
- Records older than `windowMs` are not counted and are eligible for reclamation.

The public signature stays `rateLimit(key, limit, windowMs)` so that all **29** existing call sites remain unchanged.

---

## 5. ROUTE CONTRACT — the current 11 admin routes

All 11 **MUST** remain rate-limited. Current limits are **preserved as-is**; no authoritative source requires changing them, and symmetry alone is not a reason to change a production limit.

| # | Route | Method | Permission | Same-origin | Key | Limit | Window |
|---|---|---|---|---|---|---|---|
| 1 | `admin/analytics/activation` | GET | `ANALYTICS_ACTIVATION_READ` | ✅ | `admin:analytics:activation:<uid>` | 100 | 60s |
| 2 | `admin/analytics/auth` | GET | `ANALYTICS_AUTH_READ` | ✅ | `admin:analytics:auth:<uid>` | 100 | 60s |
| 3 | `admin/audit` | GET | `AUDIT_LOG_READ` | — | `admin:audit:list:<uid>` | 100 | 60s |
| 4 | `admin/deals` | GET | `COMMERCE_DEALS_READ` | — | `admin:deals:list:<uid>` | 100 | 60s |
| 4 | `admin/deals` | POST | `COMMERCE_DEALS_CREATE` | ✅ | `admin:deals:create:<uid>` | 30 | 60s |
| 5 | `admin/deals/[id]` | PATCH | `COMMERCE_DEALS_UPDATE` | ✅ | `admin:deals:update:<uid>` | 60 | 60s |
| 5 | `admin/deals/[id]` | DELETE | `COMMERCE_DEALS_DELETE` | ✅ | `admin:deals:delete:<uid>` | 30 | 60s |
| 6 | `admin/deals/upload` | POST | `COMMERCE_DEALS_UPLOAD_MEDIA` | ✅ | `admin:deals:upload:<uid>` | 40 | 60s |
| 7 | **`admin/media/wif-check`** | **GET** | **`COMMERCE_DEALS_UPLOAD_MEDIA`** | ✅ | **`admin:media:wif-check:<uid>`** | **10** | **60s** |
| 8 | `admin/org/memberships` | POST | `SECURITY_MEMBERSHIP_MANAGE` | ✅ | `admin:org:assign:<uid>` | 20 | 60s |
| 8 | `admin/org/memberships` | PATCH | `SECURITY_MEMBERSHIP_MANAGE` | ✅ | `admin:org:status:<uid>` | 20 | 60s |
| 8 | `admin/org/memberships` | DELETE | `SECURITY_MEMBERSHIP_MANAGE` | ✅ | `admin:org:remove:<uid>` | 20 | 60s |
| 9 | `admin/rbac/roles/[id]` | DELETE | `SECURITY_ROLES_REVOKE` | ✅ | `admin:rbac:revoke:<uid>` | 20 | 60s |
| 10 | `admin/rbac/roles` | GET | `SECURITY_ROLES_READ` | — | `admin:rbac:list:<uid>` | 100 | 60s |
| 10 | `admin/rbac/roles` | POST | `SECURITY_ROLES_GRANT` | ✅ | `admin:rbac:grant:<uid>` | 20 | 60s |
| 11 | `admin/settings` | GET | `SETTINGS_CONFIG_READ` | — | `admin:settings:get:<uid>` | 100 | 60s |

**Route count is 11 as of `bef923cb`.** It was 10 until `admin/media/wif-check` landed with the GCS media bridge (PR #38–#44). Any future admin route is in scope for this contract on the day it is created.

Adding a new admin route without a rate limit is a contract violation.

---

## 6. GUARD ORDER

Fixed, and already correct in **11/11** routes:

```
1. authentication + PDP   requirePermission(req, PERMISSIONS.X)
2. same-origin            isSameOrigin(req)         — mutations only
3. rate limit             rateLimit(key, limit, windowMs)
4. route business logic
```

Consequence to state plainly rather than leave implicit: because the limiter runs **after** authentication, it protects admin surfaces from an authenticated-but-compromised admin. It gives the authentication path itself no protection. That is the existing design and this contract does not change it.

---

## 7. RATE-LIMIT RESPONSE

On rejection a route **MUST** return:

- HTTP **429**
- body `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests" } }`
- header **`Retry-After`**, whose value is the `retryAfter` seconds returned by the limiter for that request

**Current state: FAIL on the header.** All 11 admin routes discard `retryAfter`; `adminError()` sets no headers. Meanwhile **7 public routes already send it** (`chat`, `scam-shield/check`, `scam-shield/qr`, `links/resolve`, `viet-content`, `auth/anonymous`, `auth/claim-anonymous`). The header is the established house pattern, and the value is already computed — it is simply dropped at the admin tier.

---

## 8. FAILURE BEHAVIOUR — **FAIL-CLOSED** · Owner decision 2026-08-13

When the shared store cannot answer, the limiter **MUST reject the request**.

| Condition | Behaviour |
|---|---|
| Shared store unreachable / connection refused | **REJECT** — 429 `RATE_LIMITED` + `Retry-After` |
| Request timeout | **REJECT** |
| Malformed or unexpected response | **REJECT** |
| Transient error (single failed call, store otherwise healthy) | **REJECT** |

### The trade-off, stated plainly

A shared-store outage **will temporarily block admin operations**. That is accepted, and it is the point: silently admitting requests when the counter is unavailable would recreate exactly the condition S4 describes — a cap that appears to exist and does not.

This is a deliberate departure from the `redisCache.ts` precedent, which degrades silently. That precedent is correct for a **cache**, where a miss costs latency. It is wrong for a **security control**, where a miss costs the control itself.

**No break-glass exception is created.** `admin/rbac/roles/[id]` DELETE (role revocation) fails closed like every other admin route, even though it is the natural emergency path. Carving out an undocumented exception would reintroduce the bypass under a friendlier name. If a break-glass mechanism is wanted later, it is a **separate authorized design decision** — not an implementation detail smuggled into C10.

This decision must not be changed silently. Any future move to fail-open requires its own owner authorization and an update to this section.

---

## 9. DISTRIBUTED GUARANTEE

**GUARANTEED once implemented to this contract:**
- A single shared counter per key, observed by all concurrent serverless instances.
- The global cap holds regardless of how many instances serve the traffic.
- Counters survive cold start, instance restart and deployment.

**NOT GUARANTEED unless separately established:**
- Exact behaviour across multiple regions.
- Absence of races under every theoretical concurrency condition — the achieved atomicity depends on the operations the chosen store provides and must be documented by the implementation, not assumed here.
- Any stronger property (fairness, burst shaping, quota carry-over, distributed clock agreement).

**Deliberately out of scope** — no authoritative source requires them: per-IP limiting, `Idempotency-Key`, bulk/heavy/dispatch limit classes, and the limit values in `docs/backoffice/19_Security.md` / `28_API_Governance.md` (both are **"DRAFT — Awaiting Owner Approval"** and are therefore **not binding**; they are noted only because they point the same direction).

---

## 10. TEST CONTRACT

Tests **MUST** exercise the real limiter. **Mocking `rateLimit()` itself does not satisfy this contract.**

Current coverage is exactly that failure: every existing rate-limit test does `vi.mock('@/lib/security/rateLimit', …)`, so the suite proves only *"the route returns 429 when a fake limiter says no"* and proves **nothing** about counting, windows, or isolation.

Required coverage:

| # | Case | Must prove |
|---|---|---|
| 1 | First request | admitted |
| 2 | Requests below limit | all admitted |
| 3 | Boundary — request number `limit` | admitted |
| 4 | `limit + 1` | rejected, `ok === false` |
| 5 | `Retry-After` | > 0 on rejection, and surfaced as an HTTP header by at least one real route |
| 6 | Window expiry | after `windowMs`, the key admits again |
| 7 | Rejection does not extend the window | a rejected request records nothing |
| 8 | Key isolation | one key at its limit does not affect another |
| 9 | Different users | `user_id` A exhausted ⇒ `user_id` B unaffected |
| 10 | Different route namespaces | `admin:deals:create:X` exhausted ⇒ `admin:rbac:grant:X` unaffected |
| 11 | Shared-store behaviour | two independent limiter instances sharing one store enforce **one** combined cap — this is the test that actually proves S4 closed |
| 12 | Failure behaviour | per §8, once decided |

Case 11 is the point of the whole component. A suite that passes without it has not tested C10.

---

## 11. PRODUCTION REQUIREMENTS

1. Shared-store credentials **MUST** exist in the Production environment before rollout (§ below).
2. Production verification **MUST** prove the limiter is actually using the shared store — not merely that a 429 can be produced, which the in-memory limiter already does.
3. **No production mutation may be performed solely to manufacture acceptance evidence.** Verification must be observational, or use a non-destructive read surface.

### Infrastructure — **PROVISIONED 2026-08-13**

Upstash for Redis was installed from the Vercel Marketplace and connected to `tappyai-mvp`:

| | |
|---|---|
| Resource | `upstash-kv-lime-engine` · status **Available** |
| Integration | `upstash-kv` (Upstash for Redis) |
| Connected project | `tappyai-mvp` |
| Environments | Production, Preview, Development |

**The integration provisions `KV_REST_API_*`, not `UPSTASH_REDIS_REST_*`.** The limiter reads whichever pair is present:

| Variable | Status |
|---|---|
| `KV_REST_API_URL` | present — Production, Preview, Development |
| `KV_REST_API_TOKEN` | present — Production, Preview, Development |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | accepted as an alternative; not used by this provisioning path |

Production environment variable count went from 37 to 42 (the integration also adds `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL` and `REDIS_URL`, which this component does not use).

Do not place placeholder values in `.env` files. Do not commit secrets.

---

## 12. Current implementation vs this contract

### Before implementation (2026-08-13, `bef923cb`)

| § | Requirement | Verdict |
|---|---|---|
| 2 | Shared store, global cap | **FAIL** — in-process `Map`; this *is* S4 |
| 3 | Keyed by `user_id`, namespace preserved | PASS |
| 4 | Sliding-window semantics | PASS (per instance) |
| 5 | All 11 routes limited | PASS |
| 6 | Guard order | PASS |
| 7 | 429 + `RATE_LIMITED` + `Retry-After` | **PARTIAL** — header missing on 11/11 |
| 8 | Failure behaviour defined | **EVIDENCE MISSING** |
| 9 | Distributed guarantee documented | **FAIL** — a source comment, not a contract |
| 10 | Real-limiter tests | **FAIL** — 100% mocked |
| 11 | Production shared store | **BLOCKED** — not provisioned |

### After implementation

| § | Requirement | Verdict |
|---|---|---|
| 2 | Shared store, global cap | **PASS** — `src/lib/security/distributedRateLimit.ts`; no in-process counter |
| 3 | Keyed by `user_id`, namespace preserved | **PASS** — 16/16 call sites unchanged in key shape |
| 4 | Sliding-window semantics, atomic | **PASS** — single `EVAL`; rejection provably does not increment |
| 5 | All 11 routes limited, limits unchanged | **PASS** — 11/11, 16/16 methods |
| 6 | Guard order | **PASS** — 11/11 unchanged |
| 7 | 429 + `RATE_LIMITED` + `Retry-After` | **PASS** — header on 16/16, driven by a real route test |
| 8 | Fail-closed | **PASS** — implemented and mutation-proven |
| 9 | Distributed guarantee documented | **PASS** — this document |
| 10 | Real-limiter tests | **PASS** — 26 tests, limiter never mocked; 7 mutations proven RED |
| 11 | Production shared store | **PASS** — provisioned; production verification recorded separately |

## 13. Verdict — **C10 ACCEPTED · S4 CLOSED** (2026-08-13)

Merge commit `c226417`, production `/api/version` = `c226417…`, deployment `tappyai-9jlnhqa3e` Ready.

Production evidence, measured rather than asserted:

| Claim | How it was proven |
|---|---|
| Production reaches the shared store | Under fail-closed, a `200` from an admin route is only possible if the store answered. It answered. |
| The counter lives in **this** store | `SCAN admin:*` against the provisioned instance returned `admin:settings:get:<owner-id>` holding **exactly 100 entries** with a TTL |
| The cap is **global**, not per-instance | 60 concurrent requests across multiple lambdas were cut off at exactly the 100 limit — 34 admitted, 26 refused. A per-process `Map` would have admitted far more. **This is S4, closed.** |
| 429 contract | All 26 refusals: HTTP **429**, `code: RATE_LIMITED`, `Retry-After` present and > 0 |
| Sliding window expires | After the TTL elapsed the same key admitted again, and `ZCARD` fell from 100 to 1 |
| Namespace isolation | With `admin:settings:get` exhausted, `admin:audit:list` and `admin:rbac:list` answered `200`; the store then showed three separate keys |
| Guard order unchanged | Unauthenticated `GET /api/admin/settings` → `401`, i.e. authentication still runs before the limiter |
| No production mutation | `department_membership` 1, `admin_roles` 2, `audit_log` **30 → 30**, `platform_owner` unchanged. ~170 verification reads produced zero audit rows |

The one thing a unit test could not cover — the Lua script executing inside Redis — is covered here: the 100-entry sorted set with a TTL is that script's output.

**Reason:** S4 is an open **HIGH** finding. The current limiter is an in-process per-instance counter, so on Vercel with `N` concurrent lambdas the effective ceiling is `N × limit`. The nominal `20/min` cap on `admin:rbac:grant` — by the Phase 0 audit's own words, *"the most security-sensitive endpoint in the system"* — is therefore not a real cap. That does not satisfy the approved C10 definition, *"Shared store; real global caps (closes S4)"*.

This verdict is tied to that evidence. It is not a generic preference for a stronger architecture.

---

## 14. Implementation sequence (authorized shape, not yet executed)

| Phase | Work | State |
|---|---|---|
| **2.1** | This contract + Owner decisions recorded | ← current |
| **2.2** | Owner provisions Upstash and loads the two variables | **BLOCKED — owner action** |
| 2.3 | Shared-store limiter + `Retry-After`, signature unchanged | not started |
| 2.4 | Real-limiter tests per §10, no mocking of limiter internals | not started |
| 2.5 | Full gates — `npm test`, `tsc`, lint, sql-grants, architecture, CI | not started |
| 2.6 | Commit → PR → CI → merge → production verification | not started |

**2.2 blocks 2.3.** §8 (failure behaviour) blocks the completion of 2.3 independently of 2.2.
