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

// ── Feature flags ────────────────────────────────────────────────────────────
/** Pro upsell hidden app-wide during the free test phase. Mirrored by the
 * Android `SHOW_PRO_UPGRADE` gate — flip BOTH together when Pro launches. */
export const SHOW_PRO_UPGRADE = false

// ── Upload limits (enforced by /api/upload/video token + composer UX) ───────
export const MAX_PHOTOS_PER_REVIEW = 6
export const MAX_VIDEO_SIZE_MB = 50
/** Advertised clip length — what the user is told. */
export const MAX_VIDEO_DURATION_SEC = 15
/** Tolerant reject threshold: a clip trimmed to "15s" often encodes at
 * 15.04–15.9s, so accept a little above the advertised limit. Backend-only
 * allowance — never surfaced in UI copy. */
export const MAX_VIDEO_DURATION_ACCEPT_SEC = 17

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
