// ─── THE PUSH IDENTITY SEAM (client side) ────────────────────────────────────
//
// ONE place that knows how to ask "does this browser's push credential belong to
// the account signed in right now?", used by the two surfaces that need it:
//
//   usePushNotifications  ──┐
//                           ├─► this file ─► /api/notifications/subscribe/*
//   performSignOut        ──┘
//
// 🔑 WHY A SEAM. Written twice, the two copies drift, and the half that drifts
// silently is the fail-closed default — one of them starts falling back to the
// browser's own subscription object, which is exactly the bug this whole change
// exists to remove. `performSignOut` makes the same argument about sign-out.
//
// RESPONSIBILITY BOUNDARY — this file holds NO authorization:
//   · the browser knows the CREDENTIAL (an endpoint / token, nothing about who)
//   · the server knows the AUTHENTICATED IDENTITY (from the session, never body)
//   · the database RPC performs the disown, under auth.uid()
//   · the hook/UI only ever REFLECTS what the server answered
//
// It also creates no `auth.signOut()` call site; sign-out stays a single call
// site in src/lib/auth/signOut.ts.

export type PushProvider = 'webpush' | 'fcm'

const SW_SCRIPT = '/push-sw.js'
const RECONCILE_URL = '/api/notifications/subscribe/reconcile'
const SUBSCRIBE_URL = '/api/notifications/subscribe'

/**
 * The Web Push credential this browser currently holds, or null.
 *
 * Returns null rather than throwing on every failure mode — no service worker,
 * no registration, an unsupported browser, a rejected getSubscription. Callers
 * treat "no credential" as "there is nothing here to reconcile", which is true
 * in all of them.
 */
export async function browserPushCredential(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCRIPT)
    const sub = await reg?.pushManager.getSubscription()
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

let inFlight: Promise<boolean | null> | null = null

/**
 * Reconcile this browser's push credential against the signed-in account.
 *
 * The server releases the credential from any OTHER account and answers whether
 * it belongs to the caller.
 *
 * Returns:
 *   true   — the caller owns an enabled claim on this browser's credential
 *   false  — the caller does not (including: this browser holds no credential)
 *   null   — UNKNOWN. The request failed, timed out, or the app is offline.
 *
 * 🔑 `null` is deliberately distinct from `false`. It is the caller's job to
 * decide, and both current callers fail CLOSED — but a future caller that wants
 * to retry needs to be able to tell "not mine" from "I could not find out".
 *
 * Concurrent calls are DEDUPLICATED. Both a page's own hook and the app-wide
 * login listener legitimately ask this at the same moment on a fresh sign-in;
 * without this they would send two identical writes. The dedupe lasts only for
 * the flight — never across time, because the answer changes.
 */
export async function reconcilePushIdentity(): Promise<boolean | null> {
  if (inFlight) return inFlight

  const p = (async (): Promise<boolean | null> => {
    const credential = await browserPushCredential()
    // No subscription in this browser: there is no claim to reconcile, and the
    // person is definitively not subscribed here. No request needed.
    if (!credential) return false
    try {
      const res = await fetch(RECONCILE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // In the BODY, never the query string. The endpoint names one person's
        // browser and is the single input that can silence it, and URLs are
        // logged, cached and referred onward.
        body: JSON.stringify({ credential }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data?.mine === true
    } catch {
      return null
    }
  })()

  inFlight = p
  void p.finally(() => { if (inFlight === p) inFlight = null })
  return p
}

/**
 * Give up this browser as the caller's push device. Used on sign-out.
 *
 * ONE request, naming the credential.
 *
 * 🚨🚨 THIS CANNOT BE `disown_push_credential`. That RPC releases a credential
 * from every account EXCEPT the caller — by construction it can never touch the
 * caller's own row. At sign-out the claim being released IS the caller's, so
 * calling disown here would look right, return successfully, and do nothing.
 * Releasing your own claim is DELETE /api/notifications/subscribe, and RLS
 * already permits it because it is your own row.
 *
 * 🔑 WHY THE CREDENTIAL IS SENT RATHER THAN INFERRED. One account holds at most
 * one webpush row (UNIQUE(user_id, provider)). If the person subscribed on a
 * second browser afterwards, that row points at the OTHER device while this
 * browser still holds a stale local subscription — deleting by provider alone
 * would switch off push on the device they are still using.
 *
 * An earlier draft asked first ("is this row mine?") and deleted second. Naming
 * the credential in the delete itself removes both the extra round trip inside a
 * 1.5s budget AND the window between the answer and the act, in which the row
 * could have been transferred away by another tab.
 *
 * NEVER THROWS, and never runs longer than `timeoutMs`. Sign-out must not wait
 * on the network, and somebody walking away from a browser is the case this
 * exists for — so it is best effort, and the next account's login reconcile is
 * the backstop when it does not finish.
 */
export async function releaseOwnPushClaim(
  opts: { timeoutMs?: number; provider?: PushProvider } = {},
): Promise<void> {
  const { timeoutMs = 1500, provider = 'webpush' } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const credential = await browserPushCredential()
    // Nothing registered in this browser: there is no claim of ours to release,
    // and a provider-only delete would be the blind one described above.
    if (!credential) return

    await fetch(SUBSCRIBE_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      // Body, never the query string. The server scopes to the session's own
      // user before this narrows any further.
      body: JSON.stringify({ provider, credential }),
      signal: controller.signal,
    })
  } catch {
    // Best effort by contract: an abort, a network failure and a 500 all end the
    // same way — sign-out proceeds.
  } finally {
    clearTimeout(timer)
  }
}
