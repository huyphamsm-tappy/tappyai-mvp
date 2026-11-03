# SEC4 (rate limiter) — cost-route coverage audit (2026-10-10)

Scope: `p8/agent-runtime` @ `65ce938`. Method: every `src/app/api/**/route.ts` classified by grep of its imports/calls, then each cost route traced to its limiter (read-only; a read-only agent produced the table, the weak-route claims below were re-checked by grep of the route files). **SEC4 stays "not proven for production"**: code presence of a limiter in a library is not coverage, and several cost routes use an in-process limiter or none.

## Limiters that exist
| Limiter | Where | Behaviour |
|---|---|---|
| `distributedRateLimit` | `src/lib/security/distributedRateLimit.ts` | shared Upstash sliding window; no store or store error → **fails closed**; keys prefixed with `VERCEL_ENV` |
| `publicRateLimit` / `publicDailyRateLimit` | `publicRateLimit.ts` | no KV credentials → **falls back to the in-process limiter (per lambda)**; credentials present but store down → fails closed |
| `rateLimit` | `rateLimit.ts` | in-process Map, "scoped per serverless instance" |
| `incrDailyCounter` | `kvCounter.ts` | feeds the Serper daily ceiling; store down → per-instance count + alert (fails over, not closed) |
`middleware.ts` does no rate limiting. `clientIp()` prefers `x-vercel-forwarded-for` / `x-real-ip` (hard to spoof on Vercel).

## Cost routes and their guard
| Route | Cost | Guard (key · limit) | Failure mode |
|---|---|---|---|
| `/api/chat` | LLM, Serper, Places, TTS | IP burst 30/min · user burst 20/min (`publicRateLimit`) · daily AI quota (`consumeAiQuestion`, 10/day free, 5 lifetime anon/guest) · Pro cap 300/day · Serper daily ceiling + per-turn budget | distributed fail-closed with KV, in-process without; quota/identity failure falls to the IP-keyed guest meter |
| `/api/translate` | LLM | `publicDailyRateLimit` 30/day/IP, **no burst cap** | as `publicRateLimit` |
| `/api/scan` | LLM vision | `publicDailyRateLimit` 20/day/IP, **no burst cap** | as `publicRateLimit` |
| `/api/viet-content` | LLM | `publicRateLimit` 10/min + 30/day (IP) | as `publicRateLimit` |
| `/api/scam-shield/analyze` | vision LLM | `publicRateLimit` burst + shared AI quota | as chat |
| `/api/scam-shield/check`, `/qr`, `/share` | provider lookups | `publicRateLimit` + daily (IP) | as `publicRateLimit` |
| `/api/payments/orders`, `/api/admin/**` (all but one), admin notification send/broadcast | payment / push | `distributedRateLimit` | fail-closed |
| `/api/cron/*` (price-check, weekly-recap, morning-brief, deal-notifications: LLM/Serper/push) | LLM, Serper, push fan-out | `cronAuth` bearer `CRON_SECRET` only (not user-reachable); fails closed if the secret is unset | n/a |

## WEAK or UNCOVERED cost routes (verified by grep of the route files)
1. **In-process only (per instance, user-keyed): `/api/voice/tts` (Google TTS, 30/min), `/api/voice/language` (60/min), `/api/group/[id]/suggest` (LLM, 5/min), `/api/explore/process` (LLM, 20/min), `/api/upload/video` (signed upload, 30/min), `/api/reviews/upload` (local `checkRL`, 10/day).** Effective ceiling = number of lambdas × the limit; they were never moved to the distributed limiter.
2. **No limiter at all: `/api/profile`, `/api/group/[id]/avatar` (storage writes), `/api/stripe/checkout`, `/api/stripe/portal` (Stripe API calls; auth only).**
3. **Unauthenticated LLM routes capped by IP-daily only** (`translate`, `scan`): bounded per IP, multiplied by IP rotation; no global ceiling.
4. **Guest chat is keyed by IP** (5 lifetime): a botnet multiplies the allowance; anonymous accounts are minted by `/api/auth/anonymous` (5/min, 30/day per IP).
5. **Without KV credentials every `publicRateLimit` and quota path silently becomes per-instance**, and the Serper ceiling falls to a per-instance count when the store is down.
6. **No coverage ratchet:** no test enumerates the API routes and asserts that a cost route calls a limiter (there is one for forwarded-IP handling). A new cost route can ship with no limiter and no test fails. `publicRouteRateLimits.test.ts` hard-codes 14 public routes and mocks `publicRateLimit`; the C10 contract covers the admin routes only (and states public routes are outside it); `SECURITY-AUDIT-2026-09-30.md` still lists "limiter vẫn theo instance (M4)" as open.

## Cannot be proven without production access
That `KV_*` is set in Production now and the store is healthy (docs record 2026-08-13 / 2026-09-20 only); which path each route takes at runtime (`tappyai_rate_limit` logs only on rejection in chat); live values of `CHAT_IP_BURST_PER_MINUTE`, `PRO_DAILY_CHAT_CAP`, `SERPER_DAILY_CREDIT_CEILING`, `CRON_SECRET`; any WAF/CDN limiting outside the repo; real lambda fan-out; vendor spend.

## Verdict and what is needed (nothing changed in this task)
- **SEC4 = NOT PROVEN / partially covered.** Proven: the limiter library semantics (49 tests), the admin routes (contract + tests), the public routes listed in the 14-case test, chat's layered guards by code.
- **Owner decisions:** (a) is SEC4 = "every cost route behind the distributed limiter", i.e. should items 1–3 be migrated (a behaviour change: per-user shared counters, new 429s) — with a route-by-route list approved; (b) add a coverage ratchet test (an allow-list of today's known-weak routes so new uncovered cost routes fail); (c) production evidence: a read-only check of `KV_*` presence and a log query per route.
