import { useMemo } from 'react'
import type { TappyPose } from '@/components/TappyMascot'

export interface TappyState {
  category?: string | null
  isStreaming?: boolean
  isSearching?: boolean
  isListening?: boolean
  hasError?: boolean
  isSuccess?: boolean
  isWelcome?: boolean
}

const CATEGORY_POSES: Record<string, TappyPose> = {
  food: 'food',
  travel: 'travel',
  shopping: 'shopping',
  spa: 'spa',
  entertainment: 'entertainment',
  deals: 'deals',
  aitools: 'aitools',
  recommendation: 'recommendation',
  reading: 'reading',
  phone: 'phone',
}

export function getTappyPose(state: TappyState): TappyPose {
  if (state.hasError) return 'sorry'
  if (state.isSuccess) return 'success'
  if (state.isListening) return 'speaking'
  if (state.isSearching) return state.category === 'food' ? 'delivery' : 'searching'
  if (state.isStreaming) return 'thinking'
  if (state.isWelcome) return 'welcome'
  if (state.category && CATEGORY_POSES[state.category]) return CATEGORY_POSES[state.category]
  return 'wave'
}

export function useTappyPose(state: TappyState): TappyPose {
  return useMemo(
    () => getTappyPose(state),
    [state.category, state.isStreaming, state.isSearching, state.isListening, state.hasError, state.isSuccess, state.isWelcome],
  )
}
