import { SupabaseClient } from '@supabase/supabase-js'
import { UserPreferenceProfile } from './profileBuilder'
import { collectSignals } from './signalCollector'
import { computeWeightedSignals } from './learningEngine'
import { enrichWithAffinity } from './affinityGraph'
import { buildProfile } from './profileBuilder'

export type { UserPreferenceProfile }

export async function getProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<UserPreferenceProfile | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select('preference_profile')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data?.preference_profile) return null
  return data.preference_profile as unknown as UserPreferenceProfile
}

export async function setProfile(
  userId: string,
  profile: UserPreferenceProfile,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        preference_profile: profile as unknown as Record<string, unknown>,
        profile_updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
}

// collect → compute → affinity → build → cache  (fire-and-forget from event routes)
export async function rebuildProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<UserPreferenceProfile> {
  const [raw, prefsRes] = await Promise.all([
    collectSignals(userId, supabase),
    supabase
      .from('user_preferences')
      .select('budget_level, budget_min, budget_max, preferred_style')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const weighted = computeWeightedSignals(raw)
  const affinity = enrichWithAffinity(weighted, raw.negativeSignals)
  const prefs = prefsRes.data ?? undefined
  const profile = buildProfile(affinity, prefs ?? undefined)
  await setProfile(userId, profile, supabase)
  return profile
}
