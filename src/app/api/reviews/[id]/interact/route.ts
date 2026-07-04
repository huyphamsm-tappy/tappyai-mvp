import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'

// POST /api/reviews/[id]/interact  { watch_seconds, completion_rate }
// Records watch time and updates watch_time_avg on the review.
// Unauthenticated requests are silently ignored.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ ok: true })

  let body: { watch_seconds?: number; completion_rate?: number } = {}
  try { body = await req.json() } catch { /* empty */ }

  const watchSeconds = Math.max(0, Math.min(Number(body.watch_seconds) || 0, 86400))
  const completionRate = Math.max(0, Math.min(Number(body.completion_rate) || 0, 1))

  if (watchSeconds === 0) return NextResponse.json({ ok: true })

  // Fetch existing row to compute GREATEST client-side (upsert doesn't support GREATEST)
  const { data: existing } = await supabase
    .from('review_interactions')
    .select('watch_seconds, completion_rate')
    .eq('user_id', user.id)
    .eq('review_id', params.id)
    .maybeSingle()

  // First valid watch (≥3s) increments view_count exactly once per user per review
  const isFirstView = !existing && watchSeconds >= 3

  const finalWatch = existing ? Math.max(existing.watch_seconds, watchSeconds) : watchSeconds
  const finalRate = existing ? Math.max(existing.completion_rate, completionRate) : completionRate

  await supabase.from('review_interactions').upsert(
    {
      user_id: user.id,
      review_id: params.id,
      watch_seconds: finalWatch,
      completion_rate: finalRate,
    },
    { onConflict: 'user_id,review_id' }
  )

  // Sync watch_time_avg + completion_rate. Must run via a SECURITY DEFINER RPC:
  // a user-scoped `reviews.update(...)` is silently dropped by RLS for reviews
  // the viewer doesn't own (the normal case — you watch other people's videos),
  // so the stats never updated and ranking broke. The RPC recomputes both
  // averages from review_interactions and writes them with definer privileges.
  await supabase.rpc('sync_review_watch_stats', { p_review_id: params.id })

  if (isFirstView) {
    await supabase.rpc('increment_review_view', { p_review_id: params.id })
  }

  rebuildProfile(user.id, supabase).catch(() => {})

  return NextResponse.json({ ok: true })
}
