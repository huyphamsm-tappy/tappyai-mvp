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

  // Recompute watch_time_avg from all interactions for this review
  const { data: interactions } = await supabase
    .from('review_interactions')
    .select('watch_seconds')
    .eq('review_id', params.id)

  if (interactions && interactions.length > 0) {
    const avg = interactions.reduce((sum, r) => sum + (r.watch_seconds || 0), 0) / interactions.length
    await supabase
      .from('reviews')
      .update({ watch_time_avg: Math.round(avg * 10) / 10 })
      .eq('id', params.id)
  }

  return NextResponse.json({ ok: true })
}
