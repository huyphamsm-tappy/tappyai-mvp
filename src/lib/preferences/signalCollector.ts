import { SupabaseClient } from '@supabase/supabase-js'
import { EventType, NegativeEventType, NegativeSignal, SIGNAL_WINDOW_DAYS, RECENT_INTEREST_DAYS } from './config'

export interface TimestampedEvent {
  type: EventType
  tags: string[]    // hashtags from the related review
  city: string      // last comma segment of place_address (data normalization)
  timestamp: string // ISO string
}

export interface RawSignals {
  events: TimestampedEvent[]
  recentSearches: string[]    // deduplicated queries, last RECENT_INTEREST_DAYS only
  negativeSignals: NegativeSignal[] // hide / not_interested / report events
}

function extractCity(address: string | null | undefined): string {
  if (!address) return ''
  return address.split(',').pop()?.trim() || ''
}

type ReviewJoin = { hashtags?: string[] | null; place_address?: string | null } | null

export async function collectSignals(userId: string, supabase: SupabaseClient): Promise<RawSignals> {
  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const since30d = new Date(Date.now() - RECENT_INTEREST_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [likesRes, savesRes, interactionsRes, eventsRes, ownPostsRes, followsRes] = await Promise.all([
    supabase
      .from('review_likes')
      .select('created_at, reviews(hashtags, place_address)')
      .eq('user_id', userId)
      .gte('created_at', since)
      .limit(100),

    supabase
      .from('review_saves')
      .select('created_at, reviews(hashtags, place_address)')
      .eq('user_id', userId)
      .gte('created_at', since)
      .limit(100),

    supabase
      .from('review_interactions')
      .select('created_at, completion_rate, reviews(hashtags, place_address)')
      .eq('user_id', userId)
      .gte('created_at', since)
      .limit(100),

    supabase
      .from('user_events')
      .select('event_type, metadata, created_at')
      .eq('user_id', userId)
      .in('event_type', ['chat_search', 'review_share', 'hide', 'not_interested', 'report'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('reviews')
      .select('created_at, hashtags, place_address')
      .eq('user_id', userId)
      .gte('created_at', since)
      .limit(50),

    supabase
      .from('user_follows')
      .select('created_at')
      .eq('follower_id', userId)
      .gte('created_at', since)
      .limit(100),
  ])

  const events: TimestampedEvent[] = []

  for (const row of likesRes.data || []) {
    const r = (row as unknown as { reviews: ReviewJoin }).reviews
    events.push({
      type: 'like',
      tags: r?.hashtags || [],
      city: extractCity(r?.place_address),
      timestamp: (row as unknown as { created_at: string }).created_at,
    })
  }

  for (const row of savesRes.data || []) {
    const r = (row as unknown as { reviews: ReviewJoin }).reviews
    events.push({
      type: 'save',
      tags: r?.hashtags || [],
      city: extractCity(r?.place_address),
      timestamp: (row as unknown as { created_at: string }).created_at,
    })
  }

  for (const row of interactionsRes.data || []) {
    const r = (row as unknown as { reviews: ReviewJoin }).reviews
    const completionRate = (row as unknown as { completion_rate: number }).completion_rate || 0
    const type: EventType = completionRate >= 0.8 ? 'watch_complete' : 'view'
    events.push({
      type,
      tags: r?.hashtags || [],
      city: extractCity(r?.place_address),
      timestamp: (row as unknown as { created_at: string }).created_at,
    })
  }

  const NEGATIVE_TYPES = new Set<string>(['hide', 'not_interested', 'report'])
  const negativeSignals: NegativeSignal[] = []
  const searchQueryMap = new Map<string, string>() // query → first seen timestamp (for dedup)

  for (const row of eventsRes.data || []) {
    const ts = (row as unknown as { created_at: string }).created_at
    const meta = row.metadata as Record<string, unknown> | null | undefined

    if (row.event_type === 'review_share') {
      events.push({ type: 'share', tags: [], city: '', timestamp: ts })
    } else if (row.event_type === 'chat_search') {
      const query = meta?.query
      if (typeof query === 'string' && query.trim()) {
        events.push({ type: 'search', tags: [], city: '', timestamp: ts })
        if (ts >= since30d && !searchQueryMap.has(query.trim())) {
          searchQueryMap.set(query.trim(), ts)
        }
      }
    } else if (NEGATIVE_TYPES.has(row.event_type)) {
      const rawTags = meta?.hashtags
      negativeSignals.push({
        type: row.event_type as NegativeEventType,
        tags: Array.isArray(rawTags) ? (rawTags as string[]) : [],
      })
    }
  }

  for (const row of ownPostsRes.data || []) {
    events.push({
      type: 'write_review',
      tags: (row as unknown as { hashtags?: string[] | null }).hashtags || [],
      city: extractCity((row as unknown as { place_address?: string | null }).place_address),
      timestamp: (row as unknown as { created_at: string }).created_at,
    })
  }

  for (const row of followsRes.data || []) {
    events.push({
      type: 'follow',
      tags: [],
      city: '',
      timestamp: (row as unknown as { created_at: string }).created_at,
    })
  }

  return {
    events,
    recentSearches: Array.from(searchQueryMap.keys()).slice(0, 10),
    negativeSignals,
  }
}
