import { createAnthropic } from '@ai-sdk/anthropic'

const _anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
})

export type ModelTier = 'simple' | 'standard' | 'planning' | 'vision'

const MODEL_IDS: Record<ModelTier, string> = {
  simple:   'claude-haiku-4-5',
  standard: 'claude-haiku-4-5-20251001',
  planning: 'claude-haiku-4-5-20251001',
  vision:   'claude-haiku-4-5-20251001',
}

export function getModel(tier: ModelTier) {
  return _anthropic(MODEL_IDS[tier])
}
