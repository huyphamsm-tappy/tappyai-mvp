// Controller V2 — Configuration Provider (FOUNDATION-01 §7).
//
// Precedence: runtime (DB/API) > feature flags > environment > build-time
// defaults, PLUS module configuration declared in manifests, and user/role
// preferences which may never override a security key.
//
// The runtime (DB/API) tier is still an explicit adapter returning undefined:
// it needs the `platform_settings` table of `01_CONTROLLER_V2_ARCHITECTURE.md`
// §4.1, which does not exist. It returns undefined rather than a fake value so
// precedence falls through honestly. Everything below it is live.
//
// Pure module — safe on client and server.

import type { ModuleManifest } from './types'

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

// ── Module configuration (FOUNDATION-01 §7: "plus module configuration") ─────

export interface ModuleConfigDeclaration {
  defaults: Record<string, unknown>
  /** Union of every `configuration.securityKeys` declared by a manifest. */
  securityKeys: ReadonlySet<string>
}

/**
 * Collect the configuration declared by registered manifests.
 *
 * A key declared as a security key by ANY module is a security key for every
 * module. Security is a property of the key, not of who asked; letting one
 * manifest un-declare another's would make the protection depend on iteration
 * order.
 */
export function collectModuleConfig(manifests: readonly ModuleManifest[]): ModuleConfigDeclaration {
  const defaults: Record<string, unknown> = {}
  const securityKeys = new Set<string>()
  for (const m of manifests) {
    for (const [k, v] of Object.entries(m.configuration?.defaults ?? {})) {
      if (!(k in defaults)) defaults[k] = v
    }
    for (const k of m.configuration?.securityKeys ?? []) securityKeys.add(k)
  }
  return { defaults, securityKeys }
}

/**
 * The Controller's configuration provider: manifest defaults, the environment,
 * and the deferred runtime tier, in contract precedence order.
 *
 * `preferenceTiers` is left empty on purpose — no user/role preference source
 * exists yet. Naming one that does not exist would claim a protection nothing
 * is exercising.
 */
export function createControllerConfigProvider(
  manifests: readonly ModuleManifest[],
  extra: readonly ConfigSource[] = []
): ConfigProvider & { isSecurityKey(key: string): boolean } {
  const declared = collectModuleConfig(manifests)
  const provider = createConfigProvider([
    deferredRuntimeSource(),
    envSource(),
    defaultsSource(declared.defaults),
    ...extra,
  ])
  return {
    resolve: (key, opts) => provider.resolve(key, { securityKey: opts?.securityKey ?? declared.securityKeys.has(key) }),
    isSecurityKey: (key) => declared.securityKeys.has(key),
  }
}

/**
 * Read a boolean through the provider.
 *
 * Only the exact strings `'true'` and `'false'` are honoured, and a real boolean
 * passes through — identical to `envBoolean`, deliberately. A typo must not
 * silently coerce a flag to whatever it happens to truthy-evaluate to, and this
 * function is the replacement for direct `envBoolean` reads of Controller
 * config, so a difference here would be a behaviour change disguised as a
 * refactor.
 */
export function configBoolean(provider: ConfigProvider, key: string, fallback: boolean): boolean {
  const raw = provider.resolve(key)
  if (typeof raw === 'boolean') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
