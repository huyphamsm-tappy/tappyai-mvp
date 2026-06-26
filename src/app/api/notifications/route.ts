import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/notifications → returns recent activity (follows + likes) for current user
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ notifications: [] })

  // Follow notifications
  const { data: follows } = await supabase
    .from('user_follows')
    .select('id, follower_id, created_at')
    .eq('following_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15)

  // My review IDs + names
  const { data: myReviews } = await supabase
    .from('reviews')
    .select('id, place_name')
    .eq('user_id', user.id)
    .limit(50)

  const myReviewIds = (myReviews || []).map(r => r.id)
  const reviewNameMap = Object.fromEntries((myReviews || []).map(r => [r.id, r.place_name]))

  // Like notifications on my reviews
  let likes: { id: string; user_id: string; review_id: string; created_at: string }[] = []
  if (myReviewIds.length > 0) {
    const { data } = await supabase
      .from('review_likes')
      .select('id, user_id, review_id, created_at')
      .in('review_id', myReviewIds)
      .neq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15)
    likes = data || []
  }

  // Batch load profiles for all actors
  const profileIds = [
    ...(follows || []).map(f => f.follower_id),
    ...likes.map(l => l.user_id),
  ].filter((v, i, a) => a.indexOf(v) === i)

  let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', profileIds)
    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  }

  const notifications = [
    ...(follows || []).map(f => ({
      id: 'f_' + f.id,
      type: 'follow',
      actor_id: f.follower_id,
      actor_name: profileMap[f.follower_id]?.full_name || 'Ẩn danh',
      actor_avatar: profileMap[f.follower_id]?.avatar_url || null,
      text: 'đã theo dõi bạn',
      url: `/users/${f.follower_id}`,
      created_at: f.created_at,
    })),
    ...likes.map(l => ({
      id: 'l_' + l.id,
      type: 'like',
      actor_id: l.user_id,
      actor_name: profileMap[l.user_id]?.full_name || 'Ẩn danh',
      actor_avatar: profileMap[l.user_id]?.avatar_url || null,
      text: `đã thích bài "${reviewNameMap[l.review_id] || 'của bạn'}"`,
      url: `/reviews/${l.review_id}`,
      created_at: l.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30)

  return NextResponse.json({ notifications })
}
