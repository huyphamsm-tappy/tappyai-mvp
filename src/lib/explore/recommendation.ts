import { createClient } from '@/lib/supabase/server'

export interface RecommendationContext {
  followingIds: string[]
  city: string
  topHashtags: string[]
}

// Returns personalization context for a user — no AI, no ranking logic here.
// Callers use this to parameterize the feed API (following filter, city boost, hashtag weighting).
export async function getRecommendationContext(userId: string): Promise<RecommendationContext> {
  const supabase = createClient()

  const [followsRes, postsRes, interactionsRes] = await Promise.all([
    supabase.from('user_follows').select('following_id').eq('follower_id', userId),
    supabase.from('reviews').select('place_address').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('review_interactions').select('review_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
  ])

  const followingIds = (followsRes.data || []).map(r => r.following_id as string)

  // Infer city from the trailing segment of the user's recent post addresses
  const addresses = (postsRes.data || []).map(r => r.place_address).filter(Boolean) as string[]
  const city = inferCity(addresses)

  // Derive top hashtags from reviews the user has watched
  let topHashtags: string[] = []
  const interactedIds = (interactionsRes.data || []).map(r => r.review_id as string)
  if (interactedIds.length > 0) {
    const { data: reviewHashtags } = await supabase
      .from('reviews')
      .select('hashtags')
      .in('id', interactedIds)
    const freq = new Map<string, number>()
    for (const row of reviewHashtags || []) {
      for (const tag of row.hashtags || []) {
        freq.set(tag, (freq.get(tag) || 0) + 1)
      }
    }
    topHashtags = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag)
  }

  return { followingIds, city, topHashtags }
}

function inferCity(addresses: string[]): string {
  if (addresses.length === 0) return ''
  const candidates = addresses.map(a => a.split(',').pop()?.trim() || '').filter(Boolean)
  if (candidates.length === 0) return ''
  const freq = new Map<string, number>()
  for (const c of candidates) freq.set(c, (freq.get(c) || 0) + 1)
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0][0]
}
