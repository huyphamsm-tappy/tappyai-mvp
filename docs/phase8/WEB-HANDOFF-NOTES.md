# Web-only handoff notes and production evidence still required (2026-10-10)

Scope: Web only. Android/iOS code and workstream C untouched. No push, merge, deploy, production migration, production flag change, or live model/Serper call. This document records hand-offs and the evidence that only production can supply; it changes no behaviour.

## 1. Hand-offs to the separate application phase
| Item | Where | Action (not done here) |
|---|---|---|
| iOS API documentation lists `GET/POST /api/memory` ("POST writes/updates") | `docs/ios/04_API_CONTRACT.md` §2.3 and endpoint table | reconcile: POST was an LLM extraction and is now 404; memory is written with `PATCH`. iOS client never called POST. Not edited (iOS docs are outside this task) |
| Native clients and the `message` notification type | Android/iOS | the collapse (and the flag `MESSAGE_NOTIFICATIONS_ENABLED`) must stay off until both handle the type |
| Stripe routes | Android/iOS trees contain no reference to `/api/stripe/checkout` or `/portal` (searched, nothing edited); owner to confirm no shipped build calls them before any 404 | see `SEC4-ROUTE-MATRIX.md` (2026-10-10 section) |

## 2. Still BLOCKED (unchanged; no work done)
* **SF8** and **E2** — pending explicit policy decisions (`SF8-AUDIT-LOG-PRIVILEGE-DEPENDENCY-AUDIT.md`, `E2-USER-EVENTS-WRITER-AUDIT.md`).
* **8C / 8D / 8E, Realtime Translation, OpenAI Ads** — no confirmed scope.
* **Migration `20261018_chat_honours_user_blocks.sql`** — unapplied; pre-checks and a deployment window must be approved (`MIGRATION-20261018-DEPLOYMENT-REVIEW.md`). The collapse draft shares no objects with it.
* **Messenger media** — deferred.

## 3. Production evidence still required (none of it is available from the repository)
| # | Evidence | Needed for | How the owner can supply it |
|---|---|---|---|
| E1 | Production KV: `KV_REST_API_URL`/`KV_REST_API_TOKEN` set **and answering** (a limiter call succeeds); the Preview deployments' KV (F-062: Preview carries production keys) | every SEC4 "covered" claim; store-failure semantics | a one-off authenticated call from a production function, or Upstash console metrics for the project |
| E2 | Request counts, 429 counts and `X-RateLimit-Reason` split per route (`translate`, `scan`, `voice/tts`, `reviews/upload`, `profile`, `group/[id]/avatar`, like/follow/comments, admin campaign) for ≥ 7 days after release | calibrating limits; spotting CGNAT false positives | Vercel logs (`tappyai_rate_limit` line has no key) |
| E3 | Provider usage for `translate` and `scan`: input/output/image tokens, model actually served, reasoning effort; env `LLM_PROVIDER`, `LLM_SMART_MODEL`, `LLM_VISION_MODEL`, `LLM_*_REASONING` | the cost table in `SEC4-TRANSLATE-SCAN-PROPOSAL.md` | provider dashboard + Vercel env listing (names and values by an authorised person) |
| E4 | `SUBSCRIPTIONS_ENABLED` value in Production and Preview; whether `STRIPE_SECRET_KEY` is valid; any non-zero traffic to `/api/stripe/*` | whether the Stripe routes are live, and whether 404-ing them is safe | env listing + 30 days of request logs |
| E5 | 30-day count of `POST /api/memory` and its user agents | closing the residual risk of the 404 | Vercel logs |
| E6 | `MESSAGE_NOTIFICATIONS_ENABLED` value; peak warm instances; messages per user per minute > 60 events | send-limiter decision; collapse urgency | env listing; logs |
| E7 | Production `notifications` table size, existence of any `type='message'` rows, policies, role `statement_timeout`s (queries in `MESSENGER-COLLAPSE-MIGRATION-REVIEW-PACKAGE.md` §6) | any collapse migration | read-only SQL by the owner |
| E8 | Migration `20261018` pre-check results and window | applying it | `MIGRATION-20261018-DEPLOYMENT-REVIEW.md` |

Until E1–E8 exist, the following are **not claimed**: SEC4 production coverage, production behaviour of the shared limiter, the cost of `translate`/`scan` in production, Stripe route exposure in production, absence of external callers of `POST /api/memory`, production behaviour of the Messenger collapse, and full Phase 8 completion.
