import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Product rules — the single source of truth for every backend-owned business
// value. NOTHING in this file may be redefined elsewhere: routes, pages, and
// components import from here, and native clients read the same values via
// GET /api/config. If a value needs to change, change it HERE only.
// (Backend Contract Audit, 2026-07-11 — see docs/architecture/BACKEND_OWNERSHIP.md)
// ─────────────────────────────────────────────────────────────────────────────

// ── The ONE AI question quota (enforced by lib/ai/quota, spent by every AI feature) ─────────
//
// 🚨 ONE POOL, NOT ONE PER FEATURE (owner decision 2026-09-15). A "question" is any user action
// that actually invokes a model: a chat turn in any of the five service areas, a Cảnh báo lừa đảo
// message analysis, a screenshot analysis. Deterministic work — the URL/QR engine, reading the
// knowledge library — never touches it. Enforced server-side in `lib/ai/quota/aiQuestionQuota.ts`;
// clients read these numbers via GET /api/config and /api/subscription for DISPLAY only.
//
/** Logged-in free tier: AI questions per VN day, across the whole product. Temporarily 15 during
 * the free test phase (Pro hidden — no legal entity for payments yet). */
export const FREE_DAILY_LIMIT = 15
/**
 * Anonymous visitors: AI questions for the LIFETIME of the anonymous identity — a one-time trial,
 * not a daily allowance. Five, once; then an account. Not per day, not per session, not per
 * return visit. (Was `ANON_DAILY_LIMIT`, five per VN day, until 2026-09-15.)
 */
export const ANON_LIFETIME_LIMIT = 5

/**
 * How many ranked shopping listings reach the model — the decision set, not the search dump.
 *
 * Serper `/shopping` returns up to 40 priced listings for one query. Every one of them used to be
 * handed to the model, which then wrote about them: measured 3,646–3,803 characters of reply and
 * ~73% of a 14-second turn spent generating text. The ranker has already ordered them, so the tail
 * only ever made the answer longer, never better informed.
 *
 * 🚨 This is a PRESENTATION cap, not a grouping rule. Rows are trimmed, never merged: Serper's
 * `productId` is per-listing (measured: 40 rows, 40 distinct ids) and the rows in one result mix
 * different chips and conditions, so merging them into "one product, many offers" would invent a
 * bargain that does not exist. `_tappy_total_found` travels with the trimmed array so the reply can
 * still say how many listings were found.
 *
 * Six because a shortlist has to hold the shape of a real decision — a cheapest, a best-specified,
 * a most-trusted, and room for the variants that differ — while staying readable in one screen.
 */
export const SHOPPING_SHORTLIST = 6

// ── Feature flags ────────────────────────────────────────────────────────────
/** Pro upsell hidden app-wide during the free test phase. Mirrored by the
 * Android `SHOW_PRO_UPGRADE` gate — flip BOTH together when Pro launches. */
export const SHOW_PRO_UPGRADE = false
/** App Connections (integrations) entry point hidden app-wide (owner product
 * decision 2026-07-17). The feature, its page, and its APIs stay intact — only
 * the UI entry point is gated off. Mirrored by the Android `SHOW_APP_CONNECTIONS`
 * gate — flip BOTH together to re-enable. */
export const SHOW_APP_CONNECTIONS = false
/** Scam Shield — URL/Website/QR risk checker. Mirrors Android
 * `SHOW_SCAM_SHIELD` gate — flip BOTH together. */
export const SHOW_SCAM_SHIELD = true
/**
 * Marketplace — HIDDEN, NOT DELETED.
 *
 * 🚨 The V3 shell advertised Marketplace in the sidebar AND the top tab bar, and
 * the destination behind both was `MarketplaceReserved` — a "Sắp có" page. That
 * is a feature the product does not have, presented in the navigation as one it
 * does, on a build that has not shipped yet. Hidden until it is built.
 *
 * Same shape as `SHOW_APP_CONNECTIONS`: the page, its component and its test all
 * stay exactly where they are, and flipping this one boolean back to `true`
 * restores every entry point at once. Nothing about Marketplace was deleted or
 * refactored, so a later phase picks it up from here rather than rebuilding it.
 *
 * NOT exported through `GET /api/config`: Marketplace has no native counterpart,
 * so there is no gate on Android or iOS for this to mirror, and adding a field
 * to a contract both clients read would be a change they neither need nor expect.
 */
export const SHOW_MARKETPLACE = false
/**
 * Wallet / Tappy Points - HIDDEN, NOT DELETED.
 *
 * 🚨 THE ROW PROMISED A FEATURE THAT DOES NOT EXIST YET, AND IT DID NOT EVEN GO THERE.
 * The V3 sidebar carried "Wallet / Tappy Points" under the account group, and its href was
 * `/subscription` - the pricing page. There is no wallet route, no wallet API and no wallet or
 * points table anywhere in this repository, so the row named a product surface the app has never
 * had and then landed the user somewhere else. That is the same class of claim `SHOW_MARKETPLACE`
 * was added for.
 *
 * Same shape as the flags above: nothing is deleted. The row, its label and its icon stay in
 * `V3Shell`, and flipping this one boolean restores it when a wallet is actually built - at which
 * point its `href` should point at the wallet, not at the subscription page.
 *
 * NOT exported through `GET /api/config`: there is no Android or iOS wallet gate to mirror.
 */
export const SHOW_WALLET = false
export const SCAM_SHIELD_DAILY_LIMIT_AUTH = 30
export const SCAM_SHIELD_DAILY_LIMIT_ANON = 10

// ── Upload limits (enforced by /api/upload/video token + composer UX) ───────
export const MAX_PHOTOS_PER_REVIEW = 6
/** Maximum size of ONE photo, in binary megabytes. Enforced by `POST /api/reviews/upload`.
 *
 * 🚨 It lives here because the composer now TELLS the user this number, and a limit the UI
 * advertises must be the one the server applies. It was a private literal in the route, which is
 * exactly how a picker comes to accept a file the upload then rejects. The route reads this too,
 * so there is one number and no second place to update. */
export const MAX_PHOTO_SIZE_MB = 5
/** Maximum video file size, in BINARY megabytes: every layer multiplies this by 1024 * 1024, so
 * 150 means 157,286,400 bytes. The ceiling is inclusive — a file of exactly that many bytes is
 * accepted and one byte more is not. Raised 50 → 150 once five-minute clips were allowed, since a
 * 50MB cap made most of the new duration range unusable. */
export const MAX_VIDEO_SIZE_MB = 150
/** Advertised clip length — what the user is told (UI copy shows "5 minutes"). */
export const MAX_VIDEO_DURATION_SEC = 300
/** Tolerant reject threshold: a clip a user trimmed to "5 minutes" routinely
 * encodes at 300.04s, and rejecting that reads as a bug. Validation boundary
 * only — UI copy says five minutes, and only the failure message names 5:05. */
export const MAX_VIDEO_DURATION_ACCEPT_SEC = 305

/**
 * The single duration rule. Every layer that decides whether a clip may be
 * uploaded or stored calls this — web composer, the reviews API, and (mirrored
 * in Swift) iOS — so the boundary cannot drift between them.
 *
 * Anything unreadable is rejected rather than defaulted: a NaN or Infinity
 * duration means the browser could not decode the file, and `NaN <= 305` is
 * false anyway, but 0 and negatives would otherwise sail through as "under the
 * limit" when they actually mean "we have no idea how long this is".
 */
export function isAcceptableVideoDuration(seconds: number): boolean {
  if (!Number.isFinite(seconds) || seconds <= 0) return false
  return seconds <= MAX_VIDEO_DURATION_ACCEPT_SEC
}

// ── Link-video providers (product decision — which platforms a user may import from) ─
// SINGLE SOURCE OF TRUTH for web (imported directly) + native (via GET /api/config).
// No client may hardcode its own list — all consume this one so Web/Android/iOS
// stay identical. V1: YouTube only. TikTok/Facebook/Instagram are intentionally
// unsupported (product decision 2026-07-26: TappyAI is an AI-discovery platform,
// not a short-video platform; TikTok overlaps our own feed and its embeds break
// visual consistency). To reintroduce a provider in V2: add its id here, then add
// its detection matcher (lib/links/platforms) and resolver branch (lib/links/resolve).
export const LINK_VIDEO_PROVIDERS = ['youtube'] as const
export type LinkVideoProvider = (typeof LINK_VIDEO_PROVIDERS)[number]

// ── Authentication providers (product decision — which sign-in methods exist) ─
// Served to clients via GET /api/config. Clients render buttons from this list;
// HOW each provider works (Supabase, custom OAuth, …) stays backend-internal.
export const AUTH_PROVIDERS = [
  { id: 'google', enabled: true },
  { id: 'zalo', enabled: true },
  { id: 'email', enabled: true },
] as const

// ── Commerce Capability Platform (CCP) gates — owner decisions 13 Sep 2026 ──
// CCP is built as an isolated module (src/lib/ccp) and is OFF by default until
// each phase clears the release gate (IMPLEMENTED → TESTED → PRODUCTION
// VERIFIED → OWNER APPROVED). Nothing outside src/lib/ccp changes behaviour
// while CCP_ENABLED is false. Flip flags HERE only. These flags are server-side: nothing exposes
// them through /api/config, and Phase 6 (13 Sep 2026) wires CCP into the SERVER-owned action
// channel only (row attachment → recommendation/actions → web live view), so no client reads them.
/** Master switch for CCP-resolved commerce links. ON since A3 (owner, 2026-09-20): Tier 1 providers
 * wrap through the network's deeplink, Tier 2 hand off direct — which tier is the `commerce_providers`
 * table's answer (src/lib/ccp/registry/runtime.ts), never a code edit. */
export const CCP_ENABLED = true
/**
 * A3 (owner standing rule, 2026-09-20): NEVER fetch a merchant / operator site's HTML. The event
 * page schedule read (eventSchedule.ts) is a bounded GET of a Ticketbox page — a merchant page —
 * and stays OFF. With it off an event link carries no stated schedule; a past event is not judged.
 */
export const CCP_MERCHANT_PAGE_READ_ENABLED = false
/** D7: ACCESSTRADE feed fields (title/price/image) are NEVER displayed until the
 * written data-rights confirmation is on file. Link-only until then. */
export const CCP_FEED_DISPLAY_ENABLED = false
/** D6: feed ingestion only over an authenticated HTTPS endpoint. ON since B5 (2026-09-20) for the
 * merchants the runtime registry marks Tier 1 with an Accesstrade campaign (src/lib/commerce/feedIngest.ts);
 * the transport policy in ccp/feeds/source.ts is unchanged. */
export const CCP_FEED_INGEST_ENABLED = true
/** D4: affiliate wrapping is applied only when a validated wrapper exists AND
 * this is on. Direct links remain the fallback either way. */
export const CCP_AFFILIATE_WRAPPING_ENABLED = true
/** Per-adapter gates (D10: exactly five MVP adapters). */
export const CCP_ADAPTERS = {
  CCP_ADAPTER_DMX: true,
  CCP_ADAPTER_TRIPCOM: true,
  CCP_ADAPTER_CGV: true,
  CCP_ADAPTER_KLOOK: true,
  /** Shopping marketplaces (owner decision 14 Sep 2026: Shopee and TikTok Shop are mandatory first-class providers; Lazada desired). */
  CCP_ADAPTER_SHOPEE: true,
  CCP_ADAPTER_TIKTOKSHOP: true,
  CCP_ADAPTER_LAZADA: true,
  /** Provider Integration Completion Pass (14 Sep 2026): travel search / detail providers and events.
   * Every one of these works on DIRECT links; affiliate approval only adds a tracking wrapper. */
  CCP_ADAPTER_BOOKING: true,
  CCP_ADAPTER_AGODA: true,
  CCP_ADAPTER_TRAVELOKA: true,
  CCP_ADAPTER_VEXERE: true,
  CCP_ADAPTER_VIETNAMAIRLINES: true,
  CCP_ADAPTER_VIETJET: true,
  CCP_ADAPTER_TICKETBOX: true,
  /** Handoff-only registry entries (CellphoneS, GrabFood, ShopeeFood) — facts + passthrough, no grammar. */
  CCP_HANDOFF_ONLY: true,
} as const

// ── Onboarding choices (product catalog, identical on every platform) ────────
// The web onboarding page renders these directly; native clients read them from
// GET /api/config. Interest ids are the backend vocabulary stored in memory/
// preferences — labels are i18n keys resolved client-side (presentation).
export const ONBOARDING_INTERESTS = [
  { id: 'food', emoji: '🍜', key: 'tag.food' },
  { id: 'spa', emoji: '💆', key: 'tag.spa' },
  { id: 'travel', emoji: '✈️', key: 'tag.travel' },
  { id: 'shopping', emoji: '🛍️', key: 'tag.shopping' },
  { id: 'entertainment', emoji: '🎉', key: 'tag.entertainment' },
  { id: 'hotel', emoji: '🏨', key: 'tag.hotel' },
] as const

export const ONBOARDING_CITIES: readonly string[] = [
  'TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Nha Trang', 'Vũng Tàu', 'Hội An', 'Phú Quốc',
]

// ── Vietnam quota-day helpers ────────────────────────────────────────────────
// All daily quotas reset at 00:00 Việt Nam (UTC+7) — matching the product copy
// ("Reset lúc 00:00 mỗi ngày theo giờ Việt Nam", "quay lại ngày mai").
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/** Start of the current VN day, as a Date (for `gte` timestamp queries). */
export function vnMidnight(now: Date = new Date()): Date {
  return new Date(Math.floor((now.getTime() + VN_OFFSET_MS) / 86400000) * 86400000 - VN_OFFSET_MS)
}

/** The current VN day as YYYY-MM-DD (for date-keyed counters/cookies). */
export function vnToday(nowMs: number = Date.now()): string {
  return new Date(Math.floor((nowMs + VN_OFFSET_MS) / 86400000) * 86400000).toISOString().slice(0, 10)
}

// ── Shared quota measurement ─────────────────────────────────────────────────
/** Count the user messages sent today (VN day) — THE quota measurement used by
 * both the /api/chat enforcement and the subscription page display, so the two
 * can never disagree. MVP approximation: sums `role:'user'` entries in today's
 * updated conversations. */
export async function countTodayUserMessages(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('conversations')
    .select('messages')
    .eq('user_id', userId)
    .gte('updated_at', vnMidnight().toISOString())
  return (data || []).reduce((sum, c) => {
    const msgs = Array.isArray(c.messages) ? c.messages : []
    return sum + msgs.filter((m: { role: string }) => m.role === 'user').length
  }, 0)
}

// ── Unified Recommendation Data Architecture (rev 2) ─────────────────────────
//
// Two staged flags. Both default OFF, and both gate BEHAVIOUR, not code: the
// pipeline builds canonical entities and recommendations either way, so the data
// layer is exercised and tested on every turn while what reaches a client stays
// exactly what reaches it today.

/**
 * Emit the `[TAPPY_PLACES]` marker into the assistant text.
 *
 * 🚨 OFF UNTIL ALL THREE CLIENTS CAN STRIP IT. Rule 6 of
 * `shared/structured-content/marker-fixtures.json`: adding a marker server-side
 * requires web, Android and iOS updated in the same change. Android and iOS are
 * outside this task's scope, and a marker they cannot strip renders as raw JSON
 * in the chat — which is exactly the defect that suite was created to catch,
 * twice, in production.
 *
 * 🚨 A SECOND BLOCKER, INDEPENDENT OF THE CLIENTS. A marker is permanent
 * storage, and Google Places terms forbid storing Places content (see
 * `mayPersist` in lib/recommendation/marker.ts). While Google is the place
 * source, the persisted payload for a place is limited to exempt identifiers and
 * our own derived values.
 */
export const EMIT_TAPPY_PLACES = false

/**
 * Send the turn's place decision to the WEB client as a message ANNOTATION.
 *
 * 🚨 THIS IS NOT `EMIT_TAPPY_PLACES` WITH A DIFFERENT NAME, AND IT DOES NOT
 * LIFT EITHER OF THAT FLAG'S BLOCKERS - it renders them inapplicable:
 *
 *   1. A MARKER IS A SHARED CONTRACT. `[TAPPY_PLACES]` lives in the message
 *      TEXT, so a client that has never been told to strip it renders raw JSON.
 *      An annotation is a separate frame on the data stream (`8:`). Android
 *      reads only `0:` frames (`RealChatRepository`) and iOS maps every unknown
 *      prefix to `.unknown` (`StreamingClient`), so both ignore it by
 *      construction - there is nothing for them to fail to strip.
 *
 *   2. A MARKER IS STORAGE. It is frozen into the text and saved with the
 *      conversation, which Google Places terms forbid for Places content. An
 *      annotation is never persisted: the chat saves `{role, content}` only, so
 *      the decision lives for the session and is gone on reload. That is the
 *      "use it for the request, do not store it" shape the terms require, and it
 *      is why the card can carry the name, rating and hours that the persisted
 *      projection has to drop.
 *
 * The trade-off is honest and is the reason both flags exist rather than one:
 * a reloaded conversation shows the prose without the card. Making it durable
 * needs the marker, and the marker needs Android, iOS and a provider whose terms
 * allow storage - which is exactly what `EMIT_TAPPY_PLACES` is waiting for.
 */
export const EMIT_PLACES_ANNOTATION = true

/**
 * Let the SERVER author `[CTA_BUTTONS]` from the deterministic action list,
 * instead of the model writing URLs from prompt templates.
 *
 * Same wire format, same three parsers, same fixtures — only the author changes.
 * OFF until the prompt rule that tells the model to stop emitting its own block
 * ships with it, because two blocks in one reply means the first one wins and
 * the choice of which is arbitrary.
 */
export const SERVER_AUTHORED_CTA = false

/**
 * G1 — PLACE_GUARD_ATTRIBUTION_V2.
 *
 * Switches `guardPlaceClaimsInText` to the identity-first attribution ladder
 * (`placeAttribution.ts` → `attributePlace`), the L5 number-identity check, the
 * coherence pass and the evidence-only fallback sentence. Measured on the
 * 2026-09-17 V3 baseline: with token-only attribution the guard deleted the
 * decision sentence of chain names ("MASSAGE HẠ SPA QUẬN 1") and names carrying
 * an address, leaving fragments or a one-line reply (13/36 turns; #15-r1 kept
 * 46 chars of a 441-token answer).
 *
 * Read from the environment at call time so a regression can be rolled back
 * by configuration rather than by redeploying code.
 *
 * DEFAULT ON since Session C (owner decision, 2026-09-22). With v1 the pick sentence was
 * deleted whenever the model wrote a venue by its short form and Serper's row carried a
 * "| tagline" ("ViDa Cafe | CÀ PHÊ NGON QUẬN 3 …") — even with a CORRECT review count
 * (unit harness) — so the card marked a pick the prose never named (golden G3a, T3 t2). The
 * full golden set was replayed with v2 on (`docs/uat/evidence/golden/final2-v2`): on the
 * place cases nothing got worse and the two lost picks came back; the guard removed the same
 * number of sentences (7/248 vs 7/279). `PLACE_GUARD_ATTRIBUTION_V2=0` (or `false`) rolls back.
 */
export function placeGuardAttributionV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.PLACE_GUARD_ATTRIBUTION_V2
  if (v === '0' || v === 'false') return false
  return true
}

/**
 * G2 — SNIPPET_PRICE_GUARD_V2.
 *
 * Switches `guardSnippetPricesInText` to band evidence (the provider's own
 * `price_range_text` / `price_range`, parsed by `recommendation/priceBand.ts`),
 * the G1 identity attribution, and the R3′ clause cut. Measured on the
 * 2026-09-17 V3 capture: 13 of the 17 price sentences the guard removed quoted
 * the venue's own band — the model was copying the card, not inventing.
 * Same shape as the G1 flag: read at call time, default OFF.
 */
export function snippetPriceGuardV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SNIPPET_PRICE_GUARD_V2
  return v === '1' || v === 'true'
}

/**
 * G3 — MEDIA_PLACEMENT_V2.
 *
 * `injectPlaceEnrichment` inserts a venue's photo / TikTok / order-link lines at
 * the END OF THE BLOCK that mentions the venue (paragraph, list item, table,
 * quote, code fence) instead of at the next venue's mention offset, which put
 * the block mid-sentence whenever two venues shared a sentence (13 of 69 blocks
 * on the 2026-09-17 mobile-path replay). Lines and markers are byte-identical;
 * only the offset moves. Web is unaffected (the decision card owns enrichment).
 * Same shape as the other flags: read at call time, default OFF.
 */
export function mediaPlacementV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.MEDIA_PLACEMENT_V2
  return v === '1' || v === 'true'
}

/**
 * AI CONSULTATIVE V1 (overnight 2026-09-18, design in docs/audit/consultative-v1-design.md).
 *
 * Situation frame + no-diacritic Vietnamese detection + reference resolution with named re-search
 * + evidence-only attributes + shortlist of 3–5 + prose-shape guard + transient-memory filter.
 * Everything behind this flag; OFF = byte-identical pipeline. Same shape as the other flags:
 * read at call time, default OFF.
 */
export function consultativeV1Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CONSULTATIVE_V1
  return v === '1' || v === 'true'
}
