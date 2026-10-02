// ─────────────────────────────────────────────────────────────────────────────
// The anonymous follow-up guard for public shared results.
//
// A viewer of /r/<slug> may ask Tappy a follow-up without installing or signing
// up. That request goes through the EXISTING chat pipeline — same model, same
// tools, same `ANON_DAILY_LIMIT`, same IP flood guard — with exactly two
// additions, both here:
//
//   1. A per-(slug, identity) daily cap, so one viral link cannot turn a
//      500-person group into 500 × ANON_DAILY_LIMIT inference calls against one
//      result. Server-side, distributed when the store is configured
//      (`publicDailyRateLimit`), configurable in one place (`product.ts`).
//   2. A short, PUBLIC context line for the model — the frozen title and
//      public question of the share, nothing private — so "hỏi câu khác" can
//      refer to what the viewer is looking at. ~60 tokens; no memory lookup.
//
// Identity precedence: verified auth.uid() (anonymous sessions included) →
// first-party anon_id cookie → client IP. The client never names itself.
// ─────────────────────────────────────────────────────────────────────────────

import { publicDailyRateLimit } from '@/lib/security/publicRateLimit'
import { clientIp } from '@/lib/security/rateLimit'
import { SHARE_FOLLOW_UP_DAILY_LIMIT_PER_IDENTITY } from '@/lib/config/product'
import { readAnonIdCookie } from '@/lib/analytics/anonId'
import { isValidSlug } from './slug'
import { bumpSharedResultCounter, getPublicSharedResult } from './sharedResultStore'

export interface FollowUpDecision {
  ok: boolean
  retryAfter: number
  /** A prompt fragment describing the public result, or '' when unavailable. */
  contextBlock: string
}

/** Pure: pick the strongest identity signal available. */
export function followUpIdentity(input: { userId: string | null; cookieHeader: string | null; ip: string }): string {
  if (input.userId) return `uid:${input.userId}`
  const anon = readAnonIdCookie(input.cookieHeader)
  if (anon) return `anon:${anon}`
  return `ip:${input.ip}`
}

/** Pure: the context line. Public fields only; bounded so it cannot bloat the prompt. */
export function buildShareContextBlock(share: { title: string; query: string } | null): string {
  if (!share) return ''
  const title = share.title.replace(/\s+/g, ' ').slice(0, 120)
  const query = share.query.replace(/\s+/g, ' ').slice(0, 200)
  return `\n\n===== NGU CANH KET QUA CONG KHAI =====\nNguoi dung dang xem mot ket qua TappyAI duoc chia se cong khai: "${title}" (cau hoi goc: "${query}"). Ho hoi tiep tu trang do. Khong co thong tin ca nhan hay lich su nao ve nguoi dung nay.\n======================================`
}

/**
 * Enforce the follow-up policy for a share slug. Returns `ok: true` with a
 * context block when admitted. Unknown or withdrawn slugs are admitted with
 * no context (the request is then an ordinary anonymous question) — the
 * public page can never be a lever to deny service elsewhere.
 */
export async function guardShareFollowUp(
  req: Request,
  slug: unknown,
  userId: string | null,
  limit: number = SHARE_FOLLOW_UP_DAILY_LIMIT_PER_IDENTITY,
): Promise<FollowUpDecision> {
  if (!isValidSlug(slug)) return { ok: true, retryAfter: 0, contextBlock: '' }
  const identity = followUpIdentity({ userId, cookieHeader: req.headers.get('cookie'), ip: clientIp(req) })
  const rl = await publicDailyRateLimit(`share-followup:${slug}:${identity}`, limit)
  if (!rl.ok) return { ok: false, retryAfter: rl.retryAfter, contextBlock: '' }

  const share = await getPublicSharedResult(slug)
  if (share) void bumpSharedResultCounter(slug, 'ask')
  return { ok: true, retryAfter: 0, contextBlock: buildShareContextBlock(share ? { title: share.payload.title, query: share.query } : null) }
}
