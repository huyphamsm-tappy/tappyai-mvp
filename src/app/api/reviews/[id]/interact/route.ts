import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/reviews/[id]/interact  { watch_seconds, completion_rate }
// Records watch time and updates watch_time_avg on the review.
// Unauthenticated requests are silently ignored.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  // Sync watch_time_avg + completion_rate AVG, and increment view_count if first view
  const { data: interactions } = await supabase
    .from('review_interactions')
    .select('watch_seconds, completion_rate')
    .eq('review_id', params.id)

  if (interactions && interactions.length > 0) {
    const n = interactions.length
    const avgWatch = interactions.reduce((s, r) => s + (r.watch_seconds || 0), 0) / n
    const avgCompletion = interactions.reduce((s, r) => s + (r.completion_rate || 0), 0) / n
    await supabase.from('reviews').update({
      watch_time_avg: Math.round(avgWatch * 10) / 10,
      completion_rate: Math.round(avgCompletion * 1000) / 1000,
    }).eq('id', params.id)
  }

  if (isFirstView) {
    await supabase.rpc('increment_review_view', { p_review_id: params.id })
  }

  return NextResponse.json({ ok: true })
}
