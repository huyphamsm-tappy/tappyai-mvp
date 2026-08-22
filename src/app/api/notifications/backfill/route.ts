import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification } from '@/lib/notifications/emit'
import {
  buildBackfillItems,
  BACKFILL_DEFAULT_SINCE_DAYS,
  type RawFollow, type RawLike, type RawComment, type RawMilestone, type ReviewMeta,
} from '@/lib/notifications/backfill'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/notifications/backfill  — ONE-TIME (ADR-014 cutover).
// CRON_SECRET-protected. Seeds the `notifications` table from existing social
// activity (last 30 days, 100/user cap). Idempotent: refuses to run twice unless
// ?force=1. Backfilled rows are already-read + push-skipped (never spam phones).
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  }

  const admin = createAdminClient()
  const force = new URL(req.url).searchParams.get('force') === '1'

  // Idempotency guard — a prior backfill marks its rows data->>backfill = 'true'.
  const { count: already } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('data->>backfill', 'true')
  if ((already ?? 0) > 0 && !force) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already_backfilled', existing: already })
  }

  const since = new Date(Date.now() - BACKFILL_DEFAULT_SINCE_DAYS * 86_400_000).toISOString()

  // Bounded global scan of the four activity tables (last 30 days).
  const [followsR, likesR, commentsR, milestonesR] = await Promise.all([
    admin.from('user_follows').select('follower_id, following_id, created_at').gte('created_at', since).limit(5000),
    admin.from('review_likes').select('user_id, review_id, created_at').gte('created_at', since).limit(5000),
    admin.from('review_comments').select('user_id, review_id, body, created_at').gte('created_at', since).limit(5000),
    admin.from('review_milestones').select('review_id, milestone, created_at').gte('created_at', since).limit(5000),
  ])

  const follows = (followsR.data ?? []) as RawFollow[]
  const likes = (likesR.data ?? []) as RawLike[]
  const comments = (commentsR.data ?? []) as RawComment[]
  const milestones = (milestonesR.data ?? []) as RawMilestone[]

  // Resolve review owners/place names + actor display names referenced above.
  const reviewIds = Array.from(new Set([
    ...likes.map(l => l.review_id),
    ...comments.map(c => c.review_id),
    ...milestones.map(m => m.review_id),
  ]))
  const actorIds = Array.from(new Set([
    ...follows.map(f => f.follower_id),
    ...likes.map(l => l.user_id),
    ...comments.map(c => c.user_id),
  ]))

  const reviewsById = new Map<string, ReviewMeta>()
  const namesById = new Map<string, string | null>()
  await Promise.all([
    reviewIds.length
      ? admin.from('reviews').select('id, user_id, place_name').in('id', reviewIds).then(({ data }) => {
          for (const r of data ?? []) reviewsById.set(r.id as string, { user_id: r.user_id as string, place_name: r.place_name as string | null })
        })
      : Promise.resolve(),
    actorIds.length
      ? admin.from('profiles').select('id, full_name').in('id', actorIds).then(({ data }) => {
          for (const p of data ?? []) namesById.set(p.id as string, p.full_name as string | null)
        })
      : Promise.resolve(),
  ])

  const items = buildBackfillItems({ follows, likes, comments, milestones, reviewsById, namesById })

  // Insert in bounded batches so one run can't blow the function time budget.
  let inserted = 0
  let failed = 0
  const BATCH = 50
  for (let i = 0; i < items.length; i += BATCH) {
    const results = await Promise.allSettled(items.slice(i, i + BATCH).map(emitNotification))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.id) inserted++
      else failed++
    }
  }

  return NextResponse.json({ ok: true, inserted, failed, candidates: items.length })
}
