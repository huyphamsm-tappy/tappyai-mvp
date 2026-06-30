import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'

// POST /api/reviews/[id]/like  → toggle like (add or remove)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const reviewId = params.id

  // Check if already liked
  const { data: existing } = await supabase
    .from('review_likes')
    .select('id')
    .eq('review_id', reviewId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    // Unlike
    await supabase
      .from('review_likes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', user.id)
    return NextResponse.json({ liked: false })
  } else {
    // Like
    const { error } = await supabase
      .from('review_likes')
      .insert({ review_id: reviewId, user_id: user.id })

    if (error) return NextResponse.json({ error: 'Không thể like' }, { status: 500 })

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

        // Every 5 like events, re-infer preferred_style from recent behavior
        const { count: likeCount } = await supabase
          .from('user_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('event_type', 'like')

        if (likeCount && likeCount % 5 === 0) {
          const { data: events } = await supabase
            .from('user_events')
            .select('event_type, metadata')
            .eq('user_id', user.id)
            .in('event_type', ['like', 'checkin'])
            .order('created_at', { ascending: false })
            .limit(100)

          if (events && events.length > 0) {
            const styleCounts = new Map<string, number>()
            for (const ev of events) {
              const tags = ev.metadata?.style_tags
              if (!Array.isArray(tags)) continue
              for (const tag of tags as string[]) {
                styleCounts.set(tag, (styleCounts.get(tag) ?? 0) + 1)
              }
            }
            const preferred_style = Array.from(styleCounts.entries())
              .filter(([, c]) => c >= 3)
              .sort((a, b) => b[1] - a[1])
              .map(([tag]) => tag)

            if (preferred_style.length > 0) {
              await supabase.from('user_preferences').upsert(
                { user_id: user.id, preferred_style, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
              )
            }
          }
        }
      } catch { /* non-blocking — don't fail the like */ }
    })()

    // Send notification to review owner + check like milestones
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
      const MILESTONES = [5, 10, 50, 100, 500, 1000]
      const newCount = review.like_count || 0
      if (MILESTONES.includes(newCount)) {
        // ON CONFLICT DO NOTHING prevents duplicate milestone rows
        const { data: existing } = await supabase
          .from('review_milestones')
          .select('id')
          .eq('review_id', reviewId)
          .eq('milestone', newCount)
          .maybeSingle()

        if (!existing) {
          await supabase.from('review_milestones').insert({ review_id: reviewId, milestone: newCount })
          sendNotificationToUser(review.user_id, {
            title: `🎉 ${newCount} người đã thích bài của bạn!`,
            body: review.place_name || 'Xem ngay',
            data: { url: `/reviews/${reviewId}` },
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json({ liked: true })
  }
}
