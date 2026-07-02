import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { inferPreferencesFromEvents } from '@/lib/userMemory'

// POST /api/reviews/[id]/like  → toggle like (optimistic insert, delete on 23505)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const reviewId = params.id

  const { error } = await supabase
    .from('review_likes')
    .insert({ review_id: reviewId, user_id: user.id })

  if (error?.code === '23505') {
    // Already liked → unlike
    await supabase
      .from('review_likes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', user.id)
    rebuildProfile(user.id, supabase).catch(() => {})
    return NextResponse.json({ liked: false })
  }

  if (error) return NextResponse.json({ error: 'Không thể like' }, { status: 500 })

  // Insert succeeded → liked=true
  rebuildProfile(user.id, supabase).catch(() => {})

  // Log the like event (fire-and-forget)
  ;(async () => {
    try {
      await supabase.from('user_events').insert({
        user_id: user.id,
        event_type: 'like',
        review_id: reviewId,
        place_id: null,
        metadata: {},
      })

      // Every 5 like events, re-infer preferred_style from recent behavior.
      // Delegates to the canonical writer in userMemory.ts (server client injected).
      const { count: likeCount } = await supabase
        .from('user_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'like')

      if (likeCount && likeCount % 5 === 0) {
        await inferPreferencesFromEvents(user.id, supabase)
      }
    } catch { /* non-blocking */ }
  })()

  // Notification + milestone (only on successful insert)
  const { data: review } = await supabase
    .from('reviews')
    .select('user_id, place_name, like_count')
    .eq('id', reviewId)
    .single()

  if (review && review.user_id !== user.id) {
    const { data: liker } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    const name = liker?.full_name?.split(' ').pop() || 'Ai đó'
    sendNotificationToUser(review.user_id, {
      title: `❤️ ${name} thích review của bạn`,
      body: review.place_name || 'Xem ngay!',
      data: { url: `/reviews/${reviewId}` },
    }).catch(() => {})

    // Milestone notification (5, 10, 50, 100, 500, 1000 likes)
    const MILESTONES = [5, 10, 25, 50, 100]
    const newCount = review.like_count || 0
    if (MILESTONES.includes(newCount)) {
      const { error: msError } = await supabase
        .from('review_milestones')
        .insert({ review_id: reviewId, milestone: newCount })
      if (!msError) {
        sendNotificationToUser(review.user_id, {
          title: `🎉 ${newCount} người đã thích bài của bạn!`,
          body: review.place_name || 'Xem ngay',
          data: { url: `/reviews/${reviewId}` },
        }).catch(() => {})
      }
      // msError.code === '23505' → duplicate milestone, skip silently
    }
  }

  return NextResponse.json({ liked: true })
}
