// Explore video VID-03: assembles the REAL dependencies of the moderation step (private-bucket reader, AI consent, the OpenAI adapters, the two switches) for the routes and the sweep.
// Never throws: a provider that cannot be built (no credentials) means "moderation unavailable" (null), and the video simply stays in `moderating`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAllowedUserIds } from '@/lib/ai/consent/aiDataConsent'
import { moderateImageWithOpenAI, moderateTextWithOpenAI } from '@/lib/ai/llm/providers/openaiModeration'
import { transcribeSpeechWithOpenAI } from '@/lib/ai/llm/providers/openaiTranscribe'
import type { MediaProvider } from '../types'
import { hasClipConsent } from './clipConsent'
import { supabaseOverlayStore } from './overlay/overlayStore'
import { overlayTextOf } from './overlay/schema'
import { videoModerationAutoRejectEnabled, videoSpeechTranscribeEnabled } from './flags'
import type { EvidenceReader, ModerationDeps, OverlayTextSource } from './moderationStep'
import { getVideoSourceProvider } from './sourceStorage'
import type { VideoAssetStore } from './uploadFlow'

/** The audio-only file of a five-minute clip is a few MB; the transcription provider takes 25 MB at most. */
const MAX_EVIDENCE_BYTES = 26 * 1024 * 1024

/** The whole object, or null when it does not exist. A storage error is thrown (the step retries); a file too big to be evidence is thrown too. */
export async function readWholeObject(provider: MediaProvider, key: string, maxBytes = MAX_EVIDENCE_BYTES): Promise<Uint8Array | null> {
  if (!provider.statObject || !provider.readRange) throw new Error('storage provider cannot read objects')
  const found = await provider.statObject(key)
  if (!found) return null
  if (found.size <= 0) return null
  if (found.size > maxBytes) throw new Error('evidence object too large')
  return provider.readRange(key, 0, found.size)
}

export function buildModerationDeps(args: {
  store: VideoAssetStore
  admin: SupabaseClient
  env?: Record<string, string | undefined>
  req?: Pick<Request, 'headers'> | null
  overlay?: OverlayTextSource
}): ModerationDeps | null {
  try {
    const env = args.env ?? process.env
    const source = getVideoSourceProvider(env, args.req)
    if (!source) return null
    const reader: EvidenceReader = { read: (key) => readWholeObject(source.provider, key) }
    return {
      store: args.store,
      reader,
      // BOTH must hold before any frame, word or text goes to a provider: the existing AI-data consent (iOS-era accounts that refused) AND the account's acceptance of the clip conditions.
      consent: { isAllowed: async (ownerId) => (await loadAllowedUserIds(args.admin, [ownerId])).has(ownerId) && (await hasClipConsent(args.admin, ownerId)) },
      moderateImage: (bytes, mime) => moderateImageWithOpenAI(bytes, mime),
      moderateText: (texts) => moderateTextWithOpenAI(texts),
      transcribe: (audio, info) => transcribeSpeechWithOpenAI(audio, info),
      // The user's own text layers are moderated too: read from the saved overlay document (nothing saved = no text).
      overlay: args.overlay ?? { textOf: async (assetId) => { const stored = await supabaseOverlayStore(args.admin).get(assetId); return stored ? overlayTextOf(stored.doc) : [] } },
      speechEnabled: videoSpeechTranscribeEnabled(env),
      autoRejectEnabled: videoModerationAutoRejectEnabled(env),
    }
  } catch {
    return null
  }
}
