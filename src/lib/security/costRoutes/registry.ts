// SEC4 coverage ratchet — the declarations (docs/phase8/SEC4-ROUTE-MATRIX.md). Test-time data only: no route imports this file, and declaring a limiter here
// does not install one. `limiters` must equal what the scanner finds in the route SOURCE, so a declaration cannot drift from the code in either direction.
//
// Groups governed by rule instead of by entry: every cost-bearing `admin/**` route must call `distributedRateLimit` (exceptions below); every cost-bearing
// `cron/**` route must check the cron secret.
//
// How to close a gap: implement the slice, delete the route's `known-gap` entry (or change it to `covered`), and LOWER `KNOWN_GAP_BUDGET` in the same change.
// How a new cost route passes: add an entry with an honest status. Hiding a gap behind `exempt` needs a written reason that review will read.

import type { CostRouteDecl } from './scan'

export const ADMIN_EXCEPTIONS: readonly string[] = [] // slice 5c closed the last one (admin/marketing/campaigns/[id])

/** The number of known-gap entries below. It may only go down. */
export const KNOWN_GAP_BUDGET = 5

export const COST_ROUTES: readonly CostRouteDecl[] = [
  // ── covered ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  { route: 'chat', cost: 'LLM, Serper, Places, TTS', limiters: ['public', 'quota'], key: 'ip burst, user burst, user/anon/ip daily quota, Pro cap, Serper ceiling', status: 'covered', note: 'layered guards; Serper area is frozen. Corrected 2026-10-10: this entry used to list "distributed", which the scan saw only in a COMMENT; the shared store is reached through publicRateLimit' },
  { route: 'viet-content', cost: 'LLM', limiters: ['public'], key: 'ip (10/min + 30/day)', status: 'covered', note: 'publicRateLimit: per-instance only while no KV is configured (production KV unverified)' },
  { route: 'scam-shield/analyze', cost: 'vision LLM', limiters: ['public', 'quota'], key: 'ip burst + shared AI quota', status: 'covered', note: 'publicRateLimit + the shared AI quota (production KV unverified)' },
  { route: 'scam-shield/check', cost: 'provider lookup (Web Risk)', limiters: ['public'], key: 'ip burst + daily', status: 'covered', note: 'publicRateLimit (production KV unverified)' },
  { route: 'scam-shield/qr', cost: 'provider lookup', limiters: ['public'], key: 'ip burst + daily', status: 'covered', note: 'publicRateLimit (production KV unverified)' },
  { route: 'scam-shield/share', cost: 'provider lookup', limiters: ['public'], key: 'ip burst + daily', status: 'covered', note: 'publicRateLimit (production KV unverified)' },
  { route: 'group/[id]/suggest', cost: 'LLM', limiters: ['public'], key: 'user, 5/min (shared store; in-process only when no store is configured; closed when configured but down)', status: 'covered', note: 'slice 2a: publicRateLimit with the previous limit and key' },
  { route: 'explore/process', cost: 'LLM content processing', limiters: ['public'], key: 'user, 20/min', status: 'covered', note: 'slice 2b: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'upload/video', cost: 'signed upload URL minting', limiters: ['public'], key: 'user, 30/min', status: 'covered', note: 'slice 2c: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'voice/tts', cost: 'Google TTS (per character, <= 2000 chars per call)', limiters: ['public'], key: 'user, 30/min', status: 'covered', note: 'slice 2d: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'reviews/upload', cost: 'image processing + storage write', limiters: ['public'], key: 'user, 10/day (VN day)', status: 'covered', note: 'slice 2e: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'profile', cost: 'storage write + server-side image processing (size-capped)', limiters: ['public'], key: 'user, 10/hour (avatar + cover)', status: 'covered', note: 'slice 5a: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'group/[id]/avatar', cost: 'storage write + image processing', limiters: ['public'], key: 'user, 10/hour', status: 'covered', note: 'slice 5a: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'reviews/[id]/like', cost: 'push dispatch per action', limiters: ['public'], key: 'user, 60/min', status: 'covered', note: 'slice 5b: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'users/[id]/follow', cost: 'push dispatch per action', limiters: ['public'], key: 'user, 30/min', status: 'covered', note: 'slice 5b: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'reviews/[id]/comments', cost: 'push dispatch per comment', limiters: ['public'], key: 'user, 10/min (unchanged limit and key)', status: 'covered', note: 'slice 5b: publicRateLimit with the previous limit and key (shared store when configured, in-process only when none is configured, closed when configured but down)' },
  { route: 'notifications/backfill', cost: 'push fan-out', limiters: ['cron'], key: 'CRON_SECRET bearer', status: 'covered', note: 'not user-reachable; closed when the secret is unset' },

  // ── known gaps (each names the missing control and the slice that closes it) ────────────────────────────────────────────────────────────
  { route: 'translate', cost: 'LLM', limiters: ['public'], key: 'ip 30/day', status: 'known-gap', note: 'daily-per-IP only: no burst cap and no global ceiling', slice: 4 },
  { route: 'scan', cost: 'vision LLM', limiters: ['public'], key: 'ip 20/day', status: 'known-gap', note: 'daily-per-IP only: no burst cap and no global ceiling', slice: 4 },
  { route: 'messaging/threads/[id]/messages', cost: 'push dispatch per message (flag off by default)', limiters: ['inprocess'], key: 'user 60/min (per instance)', status: 'known-gap', note: 'in-process only; notification collapse is a separate proposal', slice: 5 },
  { route: 'stripe/checkout', cost: 'Stripe API call; 404 while subscriptionsEnabled()', limiters: [], key: '—', status: 'known-gap', note: 'no limiter. NOT dormant by default: 404 ONLY while SUBSCRIPTIONS_ENABLED is on; with it off (code default, .env example, and the stated release state) it is reachable by any signed-in or anonymous session and calls Stripe. No in-repo Web/Android/iOS caller. Production flag state UNVERIFIED (docs/phase8/SEC4-ROUTE-MATRIX.md)', slice: 5 },
  { route: 'stripe/portal', cost: 'Stripe API call; 404 while subscriptionsEnabled()', limiters: [], key: '—', status: 'known-gap', note: 'no limiter. NOT dormant by default: 404 ONLY while SUBSCRIPTIONS_ENABLED is on; with it off (code default, .env example, and the stated release state) it is reachable by any signed-in or anonymous session and calls Stripe. No in-repo Web/Android/iOS caller. Production flag state UNVERIFIED (docs/phase8/SEC4-ROUTE-MATRIX.md)', slice: 5 },

  // ── exempt: detected by the heuristic but no provider call happens on this path ────────────────────────────────────────────────────────
  { route: 'memory', cost: 'none: POST (the LLM extraction) answers 404 before any work; GET / PATCH / DELETE read and write the own memory of the caller', limiters: [], key: '—', status: 'exempt', note: 'POST /api/memory is disabled (slice 3, docs/phase8/MEMORY-POST-AUDIT.md); the scan still sees the extraction function because memoryService co-locates it, but no route code calls it' },
  { route: 'onboarding', cost: 'none on this path', limiters: [], key: '—', status: 'exempt', note: 'imports memoryService only for updateMemory; the LLM function in that module (extractMemoryFromConversation) is not called here' },
  { route: 'recommendations', cost: 'none on this path', limiters: [], key: '—', status: 'exempt', note: 'imports memoryService/contextBuilder for reads; no LLM call is made by this route' },
  { route: 'suggested-prompts', cost: 'none on this path', limiters: [], key: '—', status: 'exempt', note: 'reads memory and demographics only; the LLM function of memoryService is not called' },
  { route: 'scam-shield/directory', cost: 'none (static dataset)', limiters: [], key: '—', status: 'exempt', note: 'serves the static directory through a barrel that also exports the Web Risk client; no provider call is made' },
  { route: 'shared-results/preview', cost: 'none on this path (validation only)', limiters: ['inprocess'], key: 'ip 60/min', status: 'exempt', note: 'validates a share payload; the provider signal comes from shared libraries it does not call here' },
  { route: 'commerce/handoff', cost: 'none on this path (telemetry sink)', limiters: ['public'], key: 'ip', status: 'exempt', note: 'redirect handoff; the storage signal comes from the observability sink import, not from a billable call' },
  { route: 'webhooks/stripe', cost: 'inbound provider webhook (we are the callee)', limiters: [], key: '—', status: 'exempt', note: 'inbound Stripe webhook authenticated by its signature; it spends no provider money per call' },
]
