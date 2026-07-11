// Public entry point for the AI layer. Business code imports ONLY from here.
//
//   Application → AI (capability layer) → AIProvider (adapter) → vendor SDK
//
// Never import '@ai-sdk/*' or a vendor SDK outside src/lib/ai/llm/providers/.

export { AI } from './ai'
export { getProvider } from './registry'
export type { AIProvider } from './provider'
export type {
  ProviderId,
  ModelRole,
  AIGenerateOptions,
  AIStreamOptions,
  AIVisionOptions,
} from './types'
