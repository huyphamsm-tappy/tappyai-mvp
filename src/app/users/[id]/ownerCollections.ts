// The owner's PRIVATE collections on their own Explore profile — loaded on demand,
// only when the owner opens the tab, never for a visitor.
//
// Each reads exactly what the owner's Hồ sơ tab (`ProfileTab`) already reads, from
// the same sources, so the two screens cannot disagree:
//
//   · Đã thích  — `review_likes` rows of THIS user (`.eq('user_id', ownerId)`), then
//                 the reviews. The table's SELECT policy is the public one
//                 (`FOR SELECT USING (true)`, add_review_social.sql); the scoping to
//                 the owner is this module's own filter, and it is only ever called
//                 with the signed-in owner's id. (A per-owner RLS policy for likes
//                 exists as a separate, not-yet-applied change; nothing here
//                 depends on it.)
//   · Đã lưu    — `review_saves` is SELECT-own by RLS: another user's query returns
//                 nothing, by policy, not by UI.
//   · Đã ẩn     — `/api/reviews/mine`, the self-scoped route (`.eq('user_id', session)`)
//                 that is the only reader of the author's `is_hidden = true` rows; the
//                 feed never serves them, to anyone. Media passes the same servable-media
//                 boundary the feed applies.
//
// Held posts of OTHER authors are excluded from liked/saved by the publication
// boundary on `reviews` itself (20260818_publication_boundary_rls.sql).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Review } from '@/app/reviews/feedShared'

const REVIEW_COLUMNS = 'id,user_id,place_name,place_address,rating,body,photos,is_verified,like_count,comment_count,created_at,content_type,media_url,thumbnail,source_type,source_url'
const COLLECTION_LIMIT = 30

async function reviewsByIds(supabase: SupabaseClient, ids: string[]): Promise<Review[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_COLUMNS)
    .in('id', ids)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .order('created_at', { ascending: false })
    .limit(COLLECTION_LIMIT)
  if (error) throw error
  return (data || []) as unknown as Review[]
}

export async function loadLiked(supabase: SupabaseClient, ownerId: string): Promise<Review[]> {
  const { data, error } = await supabase.from('review_likes').select('review_id').eq('user_id', ownerId)
  if (error) throw error
  const rows = await reviewsByIds(supabase, (data || []).map(r => r.review_id as string))
  return rows.map(r => ({ ...r, liked_by_me: true, saved_by_me: r.saved_by_me ?? false, profiles: r.profiles ?? null }))
}

export async function loadSaved(supabase: SupabaseClient, ownerId: string): Promise<Review[]> {
  const { data, error } = await supabase.from('review_saves').select('review_id').eq('user_id', ownerId)
  if (error) throw error
  const rows = await reviewsByIds(supabase, (data || []).map(r => r.review_id as string))
  return rows.map(r => ({ ...r, saved_by_me: true, liked_by_me: r.liked_by_me ?? false, profiles: r.profiles ?? null }))
}

export async function loadHidden(locale: string): Promise<Review[]> {
  const res = await fetch(`/api/reviews/mine?lang=${encodeURIComponent(locale)}`)
  if (!res.ok) throw new Error('mine_failed')
  const data = await res.json()
  return ((data.reviews || []) as Array<Review & { is_hidden?: boolean }>).filter(r => r.is_hidden === true)
}
