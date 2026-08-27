import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Product rules — the single source of truth for every backend-owned business
// value. NOTHING in this file may be redefined elsewhere: routes, pages, and
// components import from here, and native clients read the same values via
// GET /api/config. If a value needs to change, change it HERE only.
// (Backend Contract Audit, 2026-07-11 — see docs/architecture/BACKEND_OWNERSHIP.md)
// ─────────────────────────────────────────────────────────────────────────────

// ── Freemium quotas (enforced in POST /api/chat) ────────────────────────────
/** Logged-in free tier: messages per VN day. Temporarily 15 during the free
 * test phase (Pro hidden — no legal entity for payments yet). */
export const FREE_DAILY_LIMIT = 15
/** Anonymous visitors: questions per VN day (httpOnly cookie `tappy_anon`). */
export const ANON_DAILY_LIMIT = 5

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
export const SCAM_SHIELD_DAILY_LIMIT_AUTH = 30
export const SCAM_SHIELD_DAILY_LIMIT_ANON = 10

// ── Upload limits (enforced by /api/upload/video token + composer UX) ───────
export const MAX_PHOTOS_PER_REVIEW = 6
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
