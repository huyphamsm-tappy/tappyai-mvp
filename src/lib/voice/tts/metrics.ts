// ── TTS usage counters ───────────────────────────────────────────────────────
//
// Exists so cost can be MEASURED rather than estimated. `charactersSynthesized` is the number Cloud
// TTS actually bills on, and it counts only characters that were really sent — a cache hit adds
// nothing, and a failed call adds nothing, because neither produced billable synthesis.
//
// Kept as a plain injectable object rather than a module-level singleton so a test can assert
// against a fresh instance, and so a future exporter can read a snapshot without this file knowing
// anything about logging.

export interface TtsMetricsSnapshot {
  requests: number
  cacheHits: number
  cacheMisses: number
  /** Characters actually sent to the provider — the billable figure. */
  charactersSynthesized: number
  errors: number
  totalLatencyMs: number
  /** Share of requests served without calling the provider. */
  hitRate: number
  /** Mean provider latency across synthesized (not cached) calls. */
  avgSynthesisMs: number
}

export interface TtsMetrics {
  recordRequest(): void
  recordCacheHit(): void
  recordCacheMiss(): void
  recordSynthesis(characters: number, latencyMs: number): void
  recordError(): void
  snapshot(): TtsMetricsSnapshot
}

export function createTtsMetrics(): TtsMetrics {
  let requests = 0
  let cacheHits = 0
  let cacheMisses = 0
  let charactersSynthesized = 0
  let errors = 0
  let totalLatencyMs = 0
  let synthesisCount = 0

  return {
    recordRequest: () => { requests++ },
    recordCacheHit: () => { cacheHits++ },
    recordCacheMiss: () => { cacheMisses++ },
    recordSynthesis(characters, latencyMs) {
      charactersSynthesized += characters
      totalLatencyMs += latencyMs
      synthesisCount++
    },
    recordError: () => { errors++ },
    snapshot: () => ({
      requests,
      cacheHits,
      cacheMisses,
      charactersSynthesized,
      errors,
      totalLatencyMs,
      // Derived from the counters rather than tracked separately, so it cannot disagree with them.
      hitRate: requests === 0 ? 0 : cacheHits / requests,
      avgSynthesisMs: synthesisCount === 0 ? 0 : totalLatencyMs / synthesisCount,
    }),
  }
}
