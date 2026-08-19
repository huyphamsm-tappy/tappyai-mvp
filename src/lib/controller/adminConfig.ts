// Controller V2 — the Controller's configuration, resolved through the
// Configuration Provider rather than read straight from `process.env`.
//
// FOUNDATION-01 §11 records `BACKOFFICE_ENABLED` as **REFACTOR → Config
// Provider flag**, blocked on "config model". The config model is frozen
// (§7) and the provider exists, so this is that refactor: the flag keeps its
// exact value and semantics, and gains a single resolution path.
//
// Why bother, when the answer is the same today: the provider is where the
// runtime (DB/API) tier lands when `platform_settings` exists. A flag read
// directly from `process.env` at the call site cannot be overridden at runtime
// without finding and editing every reader — which is the situation this
// architecture exists to remove.

import { ADMIN_MODULES } from './registry/adminModules'
import { createControllerConfigProvider, configBoolean } from './configProvider'

/**
 * Built once from the registered manifests. `envSource` reads `process.env` at
 * resolve time, not at construction, so this caches nothing that can go stale.
 */
const provider = createControllerConfigProvider(ADMIN_MODULES)

/** The Controller's own configuration provider. */
export function controllerConfig() {
  return provider
}

/**
 * Is the back office enabled? Default `true` — the historical default, kept
 * because changing it here would silently disable the Controller in every
 * environment that has never set the variable.
 */
export function backofficeEnabled(): boolean {
  return configBoolean(provider, 'BACKOFFICE_ENABLED', true)
}

/** The three environments the Controller distinguishes. */
export type ControllerEnv = 'production' | 'preview' | 'local'

/**
 * Map a raw `VERCEL_ENV` to what the Controller shows an operator.
 *
 * One mapping, not one per caller: the Home computed this inline and the
 * Context Bar needs the same answer on every page. Two copies of a ternary is
 * how "preview" starts rendering as "production" on exactly one screen.
 *
 * Anything unrecognised — including `development` and an unset variable — is
 * `local`. An environment the deployment cannot name is not production.
 */
export function controllerEnv(raw: string | undefined = process.env.VERCEL_ENV): ControllerEnv {
  return raw === 'production' ? 'production' : raw === 'preview' ? 'preview' : 'local'
}
