// Controller V2 — Component 3 (RBAC): the permission cache.
//
// Resolving a permission set is pure map/set work over data the principal cache
// already fetched, so this cache exists to avoid recomputation, not to avoid
// I/O. That matters for its safety properties: it can be small, short-lived and
// aggressively invalidated without costing a database round-trip.
//
// SAFETY PROPERTIES, in the order they matter:
//
//   1. NO STALE PRIVILEGE ESCALATION. A revoked role must stop authorizing.
//      Entries are keyed on the ROLE SET they were computed from, so if an
//      actor's roles change the old entry can never match — even before TTL
//      expiry and even if someone forgets to call invalidate().
//   2. VERSION SAFE. Entries carry the registry version; a registry change
//      discards them rather than serving a set computed against old rules.
//   3. DETERMINISTIC. Same actor + same roles + same registry ⇒ same set, with
//      permissions sorted. No randomness, no iteration-order dependence.
//
// Per-instance and in-memory, matching the existing principal cache (ADR-003).

import type { AdminRole } from '@/lib/admin/roles'
import type { PermissionId, ResolvedPermissionSet } from './types'

/**
 * Deliberately shorter than the 60s principal cache. The principal cache is the
 * one that gates a database read; this one only saves set arithmetic, so there
 * is no reason to hold a privilege decision any longer than necessary.
 */
export const PERMISSION_CACHE_TTL_MS = 30_000

interface CacheEntry {
  set: ResolvedPermissionSet
  /** Identity of the role list this entry was computed from — see property 1. */
  rolesKey: string
  registryVersion: string
  expiresAt: number
}

/**
 * Stable identity for a role list. Sorted so ['admin','analyst'] and
 * ['analyst','admin'] are the same key, and delimited so no combination of role
 * names can collide with another.
 */
export function rolesCacheKey(roles: readonly AdminRole[]): string {
  return [...roles].sort().join('|')
}

export interface PermissionCache {
  get(
    userId: string,
    roles: readonly AdminRole[],
    registryVersion: string,
    now?: number
  ): ResolvedPermissionSet | undefined
  set(
    userId: string,
    roles: readonly AdminRole[],
    registryVersion: string,
    value: ResolvedPermissionSet,
    now?: number
  ): void
  invalidate(userId: string): void
  clear(): void
  /** Diagnostics only — never an authorization input. */
  stats(): { size: number; hits: number; misses: number }
}

export function createPermissionCache(ttlMs: number = PERMISSION_CACHE_TTL_MS): PermissionCache {
  const store = new Map<string, CacheEntry>()
  let hits = 0
  let misses = 0

  return {
    get(userId, roles, registryVersion, now = Date.now()) {
      const entry = store.get(userId)
      if (!entry) {
        misses++
        return undefined
      }
      // Any one of these being stale means the entry cannot be trusted. Drop it
      // rather than repairing it — a wrong permission set is worse than a miss.
      const stale =
        entry.expiresAt <= now ||
        entry.registryVersion !== registryVersion ||
        entry.rolesKey !== rolesCacheKey(roles)
      if (stale) {
        store.delete(userId)
        misses++
        return undefined
      }
      hits++
      return entry.set
    },

    set(userId, roles, registryVersion, value, now = Date.now()) {
      store.set(userId, {
        set: value,
        rolesKey: rolesCacheKey(roles),
        registryVersion,
        expiresAt: now + ttlMs,
      })
    },

    invalidate(userId) {
      store.delete(userId)
    },

    clear() {
      store.clear()
    },

    stats: () => ({ size: store.size, hits, misses }),
  }
}

/** Build the immutable resolved set handed to callers and stored in the cache. */
export function makeResolvedSet(
  userId: string,
  permissions: readonly PermissionId[],
  roles: readonly AdminRole[],
  registryVersion: string,
  now: number = Date.now()
): ResolvedPermissionSet {
  const lookup = new Set(permissions)
  return Object.freeze({
    userId,
    permissions: Object.freeze([...permissions]),
    has: (permission: PermissionId) => lookup.has(permission),
    roles: Object.freeze([...roles]),
    registryVersion,
    resolvedAt: now,
  })
}

/** The process-wide cache used by the default engine. */
export const permissionCache = createPermissionCache()
