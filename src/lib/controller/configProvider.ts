// Controller V2 — Configuration Provider interface (FOUNDATION-01 §7).
// Interface + precedence resolver only. Runtime (DB/API) adapter is DEFERRED —
// represented by an explicit adapter that returns undefined until implemented,
// never a fake value. Pure module.

export type ConfigTier = 'runtime' | 'flags' | 'env' | 'defaults'

/** Precedence order, highest first. */
export const TIER_PRECEDENCE: readonly ConfigTier[] = ['runtime', 'flags', 'env', 'defaults']

export interface ConfigSource {
  readonly tier: ConfigTier
  get(key: string): unknown | undefined
}

export interface ConfigProvider {
  /**
   * Resolve a key across sources by precedence. `securityKeys` may only be
   * satisfied by non-preference tiers — user/role preference sources are barred
   * from overriding them (security).
   */
  resolve(key: string, opts?: { securityKey?: boolean }): unknown | undefined
}

/** In-memory defaults source (build-time defaults / module manifest defaults). */
export function defaultsSource(values: Record<string, unknown>): ConfigSource {
  return { tier: 'defaults', get: (k) => values[k] }
}

/** Environment source. Reads process.env; never throws. */
export function envSource(prefix = ''): ConfigSource {
  return {
    tier: 'env',
    get: (k) => {
      const envKey = prefix + k
      return typeof process !== 'undefined' && process.env ? process.env[envKey] : undefined
    },
  }
}

/**
 * Runtime (DB/API) source — DEFERRED. Explicitly returns undefined so precedence
 * falls through to flags/env/defaults. A real implementation is wired at a later
 * phase; this adapter documents the boundary rather than faking data.
 */
export function deferredRuntimeSource(): ConfigSource {
  return { tier: 'runtime', get: () => undefined }
}

/**
 * Build a ConfigProvider from sources. Sources are consulted in TIER_PRECEDENCE
 * order regardless of the order supplied. `preferenceTiers` (default: none) marks
 * tiers that represent user/role preference; those are skipped for securityKeys.
 */
export function createConfigProvider(
  sources: readonly ConfigSource[],
  preferenceTiers: readonly ConfigTier[] = []
): ConfigProvider {
  const byTier = new Map<ConfigTier, ConfigSource[]>()
  for (const s of sources) {
    const list = byTier.get(s.tier) ?? []
    list.push(s)
    byTier.set(s.tier, list)
  }
  return {
    resolve(key, opts = {}) {
      for (const tier of TIER_PRECEDENCE) {
        if (opts.securityKey && preferenceTiers.includes(tier)) continue
        for (const src of byTier.get(tier) ?? []) {
          const v = src.get(key)
          if (v !== undefined) return v
        }
      }
      return undefined
    },
  }
}
