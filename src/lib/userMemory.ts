import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export interface UserPreferences {
  user_id: string
  budget_min: number | null
  budget_max: number | null
  preferred_style: string[]
  dietary_tags: string[]
  disliked_tags: string[]
  usual_party_size: number | null
  updated_at: string
}

export type UserEventType = 'like' | 'skip_suggestion' | 'checkin' | 'view_review' | 'open_app'

export interface UserEventMetadata {
  place_id?: string
  review_id?: string
  style_tags?: string[]
  location?: { lat: number; lng: number }
  time_of_day?: 'morning' | 'afternoon' | 'evening' | 'night'
  [key: string]: unknown
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('user_preferences')
    .select('user_id, budget_min, budget_max, preferred_style, dietary_tags, disliked_tags, usual_party_size, updated_at')
    .eq('user_id', userId)
    .single()
  return data as UserPreferences | null
}

export async function logUserEvent(
  userId: string,
  eventType: UserEventType,
  metadata: UserEventMetadata = {}
): Promise<void> {
  const supabase = createClient()
  const { place_id, review_id, ...rest } = metadata
  await supabase.from('user_events').insert({
    user_id: userId,
    event_type: eventType,
    place_id: place_id ?? null,
    review_id: review_id ?? null,
    metadata: rest,
  })
}

// Looks at the last 100 events and updates preferred_style based on
// style_tags attached to liked/checkin events (threshold: 3+ occurrences).
// Canonical writer for preferred_style. Client-side callers omit `client`
// (browser client); server routes inject their server client.
export async function inferPreferencesFromEvents(userId: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? createClient()

  const { data: events } = await supabase
    .from('user_events')
    .select('event_type, metadata')
    .eq('user_id', userId)
    .in('event_type', ['like', 'checkin'])
    .order('created_at', { ascending: false })
    .limit(100)

  if (!events || events.length === 0) return

  const styleCounts = new Map<string, number>()
  for (const ev of events) {
    const tags = ev.metadata?.style_tags
    if (!Array.isArray(tags)) continue
    for (const tag of tags as string[]) {
      styleCounts.set(tag, (styleCounts.get(tag) ?? 0) + 1)
    }
  }

  const preferred_style = Array.from(styleCounts.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)

  if (preferred_style.length === 0) return

  await supabase.from('user_preferences').upsert(
    { user_id: userId, preferred_style, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
}
