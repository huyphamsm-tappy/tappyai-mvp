import { getRequestUser } from '@/lib/auth/getRequestUser'
import { buildAIContext } from '@/lib/ai/contextBuilder'
import { rankCandidates } from '@/lib/recommendation/recommendationEngine'
import type { AIContextResult } from '@/types/aiContext'
import type { CandidatePlace } from '@/types/recommendation'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// A "share-only" post (user posted a clip/photo without adding a place) carries
// a sentinel place_name instead of a real one, so it must never be ranked as a
// place. Covers the current value and the legacy no-diacritic one.
const SHARE_ONLY_NAMES = new Set(['Chia sẻ', 'Chia se'])
const isShareOnlyPlace = (n?: string | null) => !n?.trim() || SHARE_ONLY_NAMES.has(n.trim())

// GET /api/recommendations — personalized "Gợi ý cho bạn".
// Builds the user's AI context (from preference profile + memory) and ranks
// candidate places (aggregated from community reviews, with saved favorites as
// a fallback) through the deterministic recommendation engine.
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. Personalization context. If the profile is too low-signal, buildAIContext
  //    returns null — fall back to an empty profile so the engine still ranks by
  //    popularity + freshness (everyone gets sensible results).
  const built = await buildAIContext(user.id, supabase)
  const context: AIContextResult = built ?? {
    version: 1,
    generatedAt: new Date().toISOString(),
    confidence: 0,
    profile: {
      city: null, budget: null, favoriteFoods: [], favoriteCategories: [],
      recentInterests: [], travelStyle: [], hiddenTopics: [],
      companions: null, timing: null, personality: null,
    },
  }

  // 2. Candidate places: aggregate visible community reviews by place.
  const { data: reviewRows } = await supabase
    .from('reviews')
    .select('place_id, place_name, place_address, rating, hashtags, created_at')
    .eq('is_hidden', false)
    .not('place_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  const cityOf = (addr: string | null) => {
    if (!addr) return ''
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
    return parts[parts.length - 1] || addr
  }

  type PlaceAgg = { name: string; address: string | null; ratings: number[]; tags: Set<string>; latest: string }
  const byPlace = new Map<string, PlaceAgg>()
  for (const r of reviewRows ?? []) {
    const pid = (r.place_id as string | null)?.trim()
    if (!pid) continue
    if (isShareOnlyPlace(r.place_name as string | null)) continue // skip place-less "sharing" posts
    const e: PlaceAgg = byPlace.get(pid) ?? { name: r.place_name ?? '', address: r.place_address ?? null, ratings: [], tags: new Set<string>(), latest: r.created_at as string }
    if (typeof r.rating === 'number') e.ratings.push(r.rating)
    for (const t of (r.hashtags ?? [])) if (t) e.tags.add(String(t))
    if ((r.created_at as string) > e.latest) e.latest = r.created_at as string
    if (!e.name && r.place_name) e.name = r.place_name
    byPlace.set(pid, e)
  }

  const candidates: CandidatePlace[] = [...byPlace.entries()].map(([placeId, e]) => ({
    placeId,
    placeName: e.name,
    city: cityOf(e.address),
    tags: [...e.tags],
    priceLevel: null,
    reviewCount: e.ratings.length,
    averageRating: e.ratings.length ? e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length : 0,
    latestReviewAt: e.latest,
  }))

  // Fallback: if there aren't enough place-tagged reviews yet, seed candidates
  // from the user's saved favorites so recommendations still populate.
  if (candidates.length < 3) {
    const { data: favRows } = await supabase
      .from('favorites')
      .select('place_id, place_name, place_address, place_type, created_at')
      .eq('user_id', user.id)
      .limit(50)
    const seen = new Set(candidates.map(c => c.placeId))
    for (const f of favRows ?? []) {
      const pid = (f.place_id as string | null)?.trim()
      if (!pid || seen.has(pid)) continue
      seen.add(pid)
      candidates.push({
        placeId: pid,
        placeName: (f.place_name as string) ?? '',
        city: cityOf(f.place_address as string | null),
        tags: f.place_type ? [String(f.place_type)] : [],
        priceLevel: null,
        reviewCount: 0,
        averageRating: 0,
        latestReviewAt: (f.created_at as string) ?? null,
        savedByUser: true,
      })
    }
  }

  const result = rankCandidates(context, candidates)

  return NextResponse.json({
    recommendations: result.recommendations,
    explanation: result.explanation,
    personalized: !!built,
    confidence: context.confidence,
    candidateCount: candidates.length,
  })
}
