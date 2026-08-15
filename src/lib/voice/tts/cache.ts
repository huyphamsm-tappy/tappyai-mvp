// ── TTS cache keys ───────────────────────────────────────────────────────────
//
// Cloud TTS bills per character, so the cache is a cost control before it is a latency control.
// That makes the KEY the important part: too loose and a configuration change keeps serving
// yesterday's voice for as long as the entry lives; too tight and every trivially different string
// is billed again.
//
// The key covers everything that changes the AUDIO — text, language, voice, speaking rate, pitch —
// and nothing that does not. Notably the voice NAME is in the key rather than a "current voice"
// pointer, which is what makes a voice change invalidate by construction: new name, new key, old
// entries simply become unreachable instead of needing a purge.
//
// The text is hashed, not embedded. A cache key ends up in logs and metrics, and an utterance can
// contain whatever the user just said.

import { createHash } from 'node:crypto'

/**
 * Whitespace-only differences are the same utterance and must not be billed twice.
 *
 * Deliberately NOT lowercased: casing changes how a synthesizer stresses a word ("TAPPY" is not
 * "tappy"), so folding case here would serve audibly wrong audio from the cache.
 */
export function normalizeForTts(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export interface TtsCacheKeyInput {
  text: string
  language: string
  voiceName: string
  speakingRate: number
  pitch: number
}

/** Stable across processes; reveals nothing about what was said. */
export function ttsCacheKey(input: TtsCacheKeyInput): string {
  const canonical = JSON.stringify({
    v: 1, // key format version — bump to invalidate every entry at once
    t: normalizeForTts(input.text),
    l: input.language,
    n: input.voiceName,
    r: input.speakingRate,
    p: input.pitch,
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

export interface TtsCacheEntry {
  audioBase64: string
  mimeType: string
  voiceName: string
}

export interface TtsCache {
  get(key: string): TtsCacheEntry | undefined
  set(key: string, entry: TtsCacheEntry): void
  readonly size: number
}

/**
 * Process-local cache with a bounded entry count.
 *
 * Bounded because audio is large and a serverless instance that never evicts is a slow memory leak.
 * Insertion-order eviction (the oldest key) is deliberate rather than LRU: the win here is repeated
 * playback of the SAME reply within one session, which insertion order already captures, and LRU
 * bookkeeping would cost more than it returns at this size.
 */
export function createTtsCache(maxEntries = 200): TtsCache {
  const map = new Map<string, TtsCacheEntry>()
  return {
    get: (key) => map.get(key),
    set(key, entry) {
      if (map.size >= maxEntries) {
        const oldest = map.keys().next()
        if (!oldest.done) map.delete(oldest.value)
      }
      map.set(key, entry)
    },
    get size() {
      return map.size
    },
  }
}
