import { currentDestination, loginPathFor } from '@/lib/auth/returnTo'

// Owner 28/11/2026: everything except the chat with Tappy needs an account; the server answers 401 login_required (nobody) or 403 account_required (a visitor session).
// A screen that called such an API turns that answer into "go and sign in, then come back here":
//
//     const res = await fetch('/api/...')
//     if (await redirectIfAccountRequired(res)) return
//
// Only those two machine codes count: another 403 (AI consent, a suspended account) keeps its own handling. The body is read from a clone, so the caller can still read it.

export async function redirectIfAccountRequired(res: Response): Promise<boolean> {
  if (res.status !== 401 && res.status !== 403) return false
  let code: unknown = null
  try { code = ((await res.clone().json()) as { error?: unknown } | null)?.error } catch { /* not JSON: not ours */ }
  const signInCase = code === 'login_required' || code === 'account_required' || (res.status === 401 && code === 'unauthorized')
  if (!signInCase) return false
  if (typeof window !== 'undefined') window.location.assign(loginPathFor(currentDestination()))
  return true
}
