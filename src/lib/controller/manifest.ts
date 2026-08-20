// Controller V2 — Module Manifest validation (FOUNDATION-01 §3).
// Fail-closed: an invalid manifest yields errors and the module is NEVER
// partially loaded. Pure module (no server imports).

import type { ModuleManifest, Lifecycle, ModuleStatus } from './types'
import { parseVersion } from './version'

const LIFECYCLES: readonly Lifecycle[] = ['experimental', 'beta', 'stable', 'deprecated']
const STATUSES: readonly ModuleStatus[] = ['enabled', 'disabled']

type Unknown = Record<string, unknown>

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export interface ManifestValidation {
  ok: boolean
  errors: string[]
  /** Present only when ok — the input narrowed to a ModuleManifest. */
  manifest?: ModuleManifest
}

/**
 * Validate an untrusted manifest input. Returns every problem found (not just
 * the first) so a module author sees the whole picture, but a single problem is
 * still fatal — the caller must treat `ok:false` as "module unavailable".
 */
export function validateManifest(input: unknown): ManifestValidation {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['manifest is not an object'] }
  }
  const m = input as Unknown

  if (!isNonEmptyString(m.id)) errors.push('id: required non-empty string')
  if (!isNonEmptyString(m.name)) errors.push('name: required non-empty string')
  if (!isNonEmptyString(m.owner)) errors.push('owner: required non-empty string')
  if (!isNonEmptyString(m.hub)) errors.push('hub: required non-empty string')

  if (!isNonEmptyString(m.version)) errors.push('version: required non-empty string')
  else if (!parseVersion(m.version)) errors.push(`version: "${m.version}" is not a valid semver (major.minor.patch)`)

  if (!isStringArray(m.capabilities)) errors.push('capabilities: required string[]')
  if (!isStringArray(m.permissions)) errors.push('permissions: required string[]')
  if (!isStringArray(m.routes)) errors.push('routes: required string[]')

  if (!Array.isArray(m.dependencies)) {
    errors.push('dependencies: required array')
  } else {
    m.dependencies.forEach((d, i) => {
      const dep = d as Unknown
      const hasTarget = isNonEmptyString(dep.moduleId) || isNonEmptyString(dep.capabilityId)
      if (!hasTarget) errors.push(`dependencies[${i}]: needs moduleId or capabilityId`)
      if (!isNonEmptyString(dep.versionRange)) errors.push(`dependencies[${i}]: versionRange required`)
    })
  }

  if (typeof m.navigation !== 'object' || m.navigation === null) {
    errors.push('navigation: required object')
  } else {
    const nav = m.navigation as Unknown
    if (!isNonEmptyString(nav.label)) errors.push('navigation.label: required i18n key')
    if (typeof nav.order !== 'number' || !Number.isFinite(nav.order)) errors.push('navigation.order: required number')
  }

  // `data` is OPTIONAL — absence means the module owns no tables (ADR-024).
  // Validated only when present, and then strictly: a malformed ownership
  // assertion must not register, because the collision check downstream is what
  // keeps two modules off the same table.
  if (m.data !== undefined) {
    if (typeof m.data !== 'object' || m.data === null || Array.isArray(m.data)) {
      errors.push('data: must be an object when present')
    } else {
      const tables = (m.data as Unknown).tables
      if (!isStringArray(tables)) {
        errors.push('data.tables: required string[]')
      } else if (tables.length === 0) {
        // Absence already expresses "owns nothing". An empty array only makes a
        // manifest look like it answered the question.
        errors.push('data.tables: must be non-empty — omit `data` to own no tables')
      } else if (!tables.every(isNonEmptyString)) {
        errors.push('data.tables: table names must be non-empty strings')
      }
    }
  }

  if (!isNonEmptyString(m.lifecycle) || !LIFECYCLES.includes(m.lifecycle as Lifecycle)) {
    errors.push(`lifecycle: must be one of ${LIFECYCLES.join(', ')}`)
  }
  if (!isNonEmptyString(m.status) || !STATUSES.includes(m.status as ModuleStatus)) {
    errors.push(`status: must be one of ${STATUSES.join(', ')}`)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, errors: [], manifest: input as ModuleManifest }
}
