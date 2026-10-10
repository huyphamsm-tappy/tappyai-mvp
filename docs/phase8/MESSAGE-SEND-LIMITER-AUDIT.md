# Message-send limiter — separate audit (2026-10-10)

Status: **audit only. The send path (`POST /api/messaging/threads/[id]/messages`) and its limiter are unchanged.** Baseline `4bfb3d4`. Production KV configuration and runtime wiring: **UNVERIFIED**.

## 1. What exists
| Item | Fact (source) |
|---|---|
| Order in `POST` | session → anonymous refusal → `rateLimit('messaging:send:<user id>', 60, 60_000)` → parse JSON → validate body (1..4000 chars) → thread lookup (RLS) → `INSERT chat_messages` → `notifyThreadRecipients` |
| Limiter | the **in-process** `rateLimit` (a `Map` per serverless instance). Same user can send 60 / min *per warm instance*; the real ceiling is `60 × N instances` per minute. No external dependency, so **no outage mode exists today** |
| Key | the user id (not the IP); anonymous sessions are refused before the limiter |
| Refusal | `429 {error:'rate_limit', message: rate.tooFast}` |
| Web client on any non-2xx | `ThreadView.send` shows the generic send error and **keeps the draft** (it clears the draft only after a 2xx); it ignores the server message, so the user does not read "too fast" |
| Per-send cost, flag **off** (default) | one thread lookup + one insert (+ a DB trigger touching `chat_threads.last_message_at`). No provider spend |
| Per-send cost, flag **on** (`MESSAGE_NOTIFICATIONS_ENABLED === 'true'`, default off, production state **UNVERIFIED**) | roster select + sender profile select + **per recipient** one `notifications` insert + web-push / FCM dispatch + one update. A group thread has up to 49 other members (`chat_create_group` caps at 49) → up to ~49 inserts + 49 push attempts per message |
| Mobile clients | not examined (out of scope); they do not handle the `message` notification type, which is why the flag is off |

So the economic exposure of the send route is **database writes**, and — only when the notification flag is on — **push fan-out proportional to group size**. It is an abuse/availability limit, not a provider-spend limit.

## 2. User impact during a shared-store outage — the three options
(An option only becomes relevant if the owner wants the limit shared across instances; today there is no store dependency.)

| | A. Keep per-instance (status quo) | B. Shared limiter, **fail closed** (`publicRateLimit` as it behaves today) | C. Shared limiter, **fail open to the in-process limiter** on a store failure |
|---|---|---|---|
| Store healthy | up to `60 × N` / min / user (imprecise) | exactly 60 / min / user | exactly 60 / min / user |
| **Store down: can people send?** | yes, always | **no — every send in the product answers 429** while the database is healthy | yes |
| What the user sees (Web) | nothing | the generic "could not send" error, draft kept; retries fail until the store returns. Not a "too fast" message, so it reads as a Messenger outage | nothing (maybe a slower first call while the store times out — see below) |
| Blast radius | none | **platform-wide**: one cache outage = total Messenger send outage | none |
| Abuse window during the outage | `60 × N` / min / user | closed | `60 × N` / min / user (same as A) — the degraded period equals today's guarantee |
| Recovery | n/a | automatic when the store answers | automatic |
| Observability | none | refusals would log `reason=store_unavailable` once the route uses the `rateLimitedResponse` helper (added in `7570304`; this route does not use it today) | needs a *new* log/metric so the degraded period is visible (no refusal occurs, so nothing is logged today) |
| Implementation cost | none | route change only | **new limiter mode**: `publicRateLimit` has no fail-open option; adding one is a change to shared security code and must not weaken the paid-provider routes (needs a per-call option, default closed, and tests) |
| Latency risk | none | a store timeout adds latency to every send, then refuses | same timeout latency, then proceeds; a short per-call timeout is advisable |

**Why B is the wrong default for this route:** the cost it protects is a database row. The thing it breaks is the product. The paid-provider routes (`translate`, `scan`, TTS, …) accept fail-closed because the alternative is an unbounded bill; here the alternative is "60 × N messages a minute from one signed-in account" for the length of an outage.

**Recommendation (not a decision):** leave the send path as it is (A) until there is evidence of abuse that the per-instance limit does not stop. If a precise cross-instance limit is wanted, use **C**, and implement it as an explicit per-call option on the shared helper so the other routes keep failing closed. This also keeps §7d of the collapse proposal intact: the notification collapse deliberately has **no KV dependency**.

## 3. Evidence needed before any change
* Typical and peak number of warm instances for the project (Vercel), to know what `60 × N` really is.
* Production `MESSAGE_NOTIFICATIONS_ENABLED` value (if on, push fan-out is the real cost driver, and the collapse proposal matters more than the limiter).
* Any observed send abuse (messages per user per minute > 60) in production logs — none is in the repository.
* KV outage history / SLA for the production store; confirmation the KV pair is set for Production and answers.

## 4. Acceptance tests for a future change (not written; the change is not approved)
1. Store healthy: 61st send in a minute from one user is refused; another user unaffected.
2. Store down, option C: sends succeed, the in-process limit still applies, one structured "degraded" log line per window, no 429 for a healthy user.
3. Store down, option B (if chosen): 429 with `reason=store_unavailable`, and a message that is not "too fast".
4. The paid-provider routes keep failing closed (regression test on the shared helper's default).
5. The send API contract (request, response, status codes for success/404/400) is byte-identical.
6. Mutation: fail-open default, missing await, wrong key (IP instead of user) each fail the suite.

## 5. Owner decisions
1. Keep per-instance (A), or move to a shared limit (B or C)?
2. If shared: is a degraded (per-instance) window during an outage acceptable (C)?
3. Is a per-minute number other than 60 wanted for groups (fan-out) versus direct threads?
