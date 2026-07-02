import { SupabaseClient } from '@supabase/supabase-js'
import { AIContext, AIContextResult } from '@/types/aiContext'
import { UserPreferenceProfile } from '@/lib/preferences/profileBuilder'
import { getMemory, UserMemory } from '@/lib/memory/memoryService'
import { UserPrefs } from '@/lib/ai/promptBuilder'

const VERSION = 1 as const
const MIN_CONFIDENCE = 0.1
const MAX_ITEMS = 5

// Merge two string arrays: primary fills first, secondary supplements up to maxLen.
// Simple string-equality dedup — no case normalization needed for tag data.
function mergeUnique(primary: string[], secondary: string[], maxLen: number): string[] {
  const seen = new Set(primary)
  const out = primary.slice(0, maxLen)
  for (const item of secondary) {
    if (out.length >= maxLen) break
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

export async function buildAIContext(
  userId: string,
  supabase: SupabaseClient
): Promise<AIContextResult | null> {
  // Read preference_profile and user_memory in parallel — only what we need
  const [prefRes, memRes] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('preference_profile')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('user_memory')
      .select('location_base, preferences, companions, timing, personality, history')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const rawProfile = prefRes.data?.preference_profile as unknown as UserPreferenceProfile | null | undefined
  if (!rawProfile || rawProfile.confidenceScore < MIN_CONFIDENCE) return null

  const memory = (memRes.data ?? null) as UserMemory | null

  // city: behavioral profile first (inferred from reviews), memory fallback
  const city = rawProfile.city || memory?.location_base || null

  // budget: profile-level string ('cheap' | 'mid' | 'high') — simpler and more reliable
  // than per-category budget ranges from memory
  const budget = rawProfile.budget ?? null

  // favoriteFoods: affinity-enriched behavioral data first; supplement from memory
  const memoryFoods = memory?.preferences?.food ?? []
  const favoriteFoods = mergeUnique(
    rawProfile.favoriteFoods,
    memoryFoods,
    MAX_ITEMS
  )

  // favoriteCategories: purely behavioral — no equivalent in user_memory
  const favoriteCategories = rawProfile.favoriteCategories.slice(0, MAX_ITEMS)

  // recentInterests: search queries (profile) + conversation topics (memory.history)
  const memoryHistory = memory?.history ?? []
  const recentInterests = mergeUnique(
    rawProfile.recentInterests,
    memoryHistory.slice().reverse(), // most recent conversation topics first
    MAX_ITEMS
  )

  // hiddenTopics: profile.hiddenTopics is always [] until Phase 5+
  // memory.preferences.avoid is the live source for now
  const avoidList = memory?.preferences?.avoid ?? []
  const hiddenTopics = mergeUnique(
    rawProfile.hiddenTopics,
    avoidList,
    MAX_ITEMS
  )

  const profile: AIContext = {
    city,
    budget,
    favoriteFoods,
    favoriteCategories,
    recentInterests,
    travelStyle: rawProfile.preferredTravelStyle ?? [],
    hiddenTopics,
    companions: memory?.companions ?? null,
    timing: memory?.timing ?? null,
    personality: memory?.personality ?? null,
  }

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    confidence: rawProfile.confidenceScore,
    profile,
  }
}

export interface ChatPromptContext {
  memory: UserMemory | null
  prefs: UserPrefs | null
}

// Raw inputs for the Chat Route's system prompt (formatted downstream by
// promptBuilder's buildMemoryBlock/buildPrefBlock) — single fetch owned here
// instead of duplicated inline in the route.
export async function buildChatPromptContext(
  userId: string,
  supabase: SupabaseClient
): Promise<ChatPromptContext> {
  const [memory, prefResult] = await Promise.all([
    getMemory(userId),
    supabase
      .from('user_preferences')
      .select('budget_level, cuisine_likes, dietary_restrictions, inferred_preferences')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  return {
    memory,
    prefs: (prefResult.data as UserPrefs | null) ?? null,
  }
}
