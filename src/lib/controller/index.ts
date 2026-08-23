// Controller V2 — kernel public surface (client-safe).
//
// NOTE: the production audit adapter (`auditAdapter.ts`) is intentionally NOT
// re-exported here — it is server-only. Import it directly where the Controller
// is wired on the server.

export { ControllerCore } from './core'
export type { ControllerCoreOptions } from './core'
export * from './types'
export { validateManifest } from './manifest'
export type { ManifestValidation } from './manifest'
export { satisfies, parseVersion } from './version'
export type { SemVer } from './version'
export { deriveNavigation } from './navigationProvider'
export type { NavGroup, NavEntry } from './navigationProvider'
export {
  createConfigProvider,
  defaultsSource,
  envSource,
  deferredRuntimeSource,
  platformSettingsSource,
  TIER_PRECEDENCE,
} from './configProvider'
export type { ConfigProvider, ConfigSource, ConfigTier } from './configProvider'
// K-2. The pure half only: the snapshot and its projection. `platformSettingsServer`
// is NOT re-exported here — it imports the service-role client, and this module
// is reachable from client bundles.
export {
  platformSettingsSnapshot,
  setPlatformSettings,
  resetPlatformSettings,
  snapshotFromRows,
  loadPlatformSettings,
} from './platformSettings'
export type { PlatformSettingRow, PlatformSettingsStore } from './platformSettings'
export { createNoopEventSink, createCollectingEventSink, createObservabilityEventSink } from './events'
export type { CollectingEventSink, ObservabilityRecord, EventObservabilityWriter } from './events'
export { securityHub, securityAuditModule } from './modules/securityAuditModule'
