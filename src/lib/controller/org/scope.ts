// Controller V2 — scope evaluation (pure). GLOBAL covers everything; a
// department scope covers only its own department. Fail-closed: an unknown or
// empty scope covers nothing.

import type { DepartmentId, OrgScope } from './types'

export function scopeCovers(scope: OrgScope, target: DepartmentId): boolean {
  return scope === 'GLOBAL' || scope === target
}

export function anyScopeCovers(scopes: readonly OrgScope[], target: DepartmentId): boolean {
  return scopes.some((s) => scopeCovers(s, target))
}
