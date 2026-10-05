// -- In-app account deletion may only be ON where its clean-up is installed ----------------------------------------------------
//
// ACCOUNT_SELF_DELETE_ENABLED is an environment variable. In Production it was set to `true` days before this code existed, i.e.
// BEFORE the clean-up behind the promise (the BEFORE DELETE trigger that queues files + the Google grant and removes the stores
// with no cascade path - migration 20261005_account_deletion_cleanup.sql). Deploying the route with only that flag as a gate would
// have made deletion live the moment the build went out, with the clean-up missing.
//
// So the flag alone is not enough. The database answers `public.account_deletion_ready()` (true only when that migration is in
// place), and deletion is available only when BOTH say yes. The probe is a public, read-only RPC called with the public anon key,
// the same way `lib/auth/appleCapability.ts` reads Supabase's provider state.
//
// Fail CLOSED: a missing function (migration not applied -> PostgREST 404), an error, a timeout, a redirect, anything but the JSON
// literal `true` -> not ready. Cached 5 minutes (30 s after a failure) so /api/config and the route never hammer the database.

import { selfDeleteEnabled } from './selfDelete'

export const DELETION_READY_TTL_MS = 5 * 60_000
export const DELETION_READY_FAIL_TTL_MS = 30_000
export const DELETION_READY_TIMEOUT_MS = 2_500

export interface DeletionReadyDeps {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

let cache: { key: string; at: number; ttl: number; value: boolean } | null = null
export function __resetDeletionReadyCache(): void { cache = null }

function rpcUrl(raw: string | undefined): URL | null {
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null
  if (u.username || u.password) return null
  return new URL('/rest/v1/rpc/account_deletion_ready', u.origin)
}

/** True ONLY when the database reports the account-deletion clean-up installed. Never throws. */
export async function accountDeletionSchemaReady(deps: DeletionReadyDeps = {}): Promise<boolean> {
  const env = deps.env ?? process.env
  const now = (deps.now ?? Date.now)()
  const url = rpcUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false
  const key = url.origin
  if (cache && cache.key === key && now - cache.at < cache.ttl) return cache.value

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? DELETION_READY_TIMEOUT_MS)
  let ok = false
  let value = false
  try {
    const res = await (deps.fetchImpl ?? fetch)(url.toString(), {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
    })
    if (res.ok) {
      const text = await res.text()
      if (text.length <= 64) { ok = true; value = JSON.parse(text) === true }
    }
  } catch {
    ok = false
    value = false
  } finally {
    clearTimeout(timer)
  }
  cache = { key, at: now, ttl: ok ? DELETION_READY_TTL_MS : DELETION_READY_FAIL_TTL_MS, value }
  return value
}

/**
 * Is in-app account deletion available RIGHT NOW? The environment flag AND the installed clean-up.
 * The flag is checked first, so an environment that never turned it on makes no database call at all.
 */
export async function selfDeleteAvailable(deps: DeletionReadyDeps = {}): Promise<boolean> {
  const env = deps.env ?? process.env
  if (!selfDeleteEnabled(env)) return false
  return accountDeletionSchemaReady(deps)
}
