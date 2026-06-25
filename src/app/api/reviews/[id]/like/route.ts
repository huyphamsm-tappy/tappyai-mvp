import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'

// POST /api/reviews/[id]/like  -> toggle like (add or remove)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

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

    if (error) return NextResponse.json({ error: 'Khong the like' }, { status: 500 })

    // Send notification to review owner
    const { data: review } = await supabase
      .from('reviews')
      .select('user_id, place_name')
      .eq('id', reviewId)
      .single()

    if (review && review.user_id !== user.id) {
      const { data: liker } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      const name = liker?.full_name?.split(' ').pop() || 'Ai do'
      sendNotificationToUser(review.user_id, {
        title: 'liked your review',
        body: review.place_name || 'Xem ngay!',
        data: { url: '/reviews/' + reviewId },
      }).catch(() => {})
    }

    return NextResponse.json({ liked: true })
  }
}
