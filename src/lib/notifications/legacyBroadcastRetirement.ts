// Constants for the retired legacy broadcast endpoint (contract §14.2 step 6).
//
// 🚨 WHY THESE LIVE HERE AND NOT IN THE ROUTE FILE. A Next.js route module may
// only export the fields the framework recognises — the HTTP verbs plus a fixed
// set of config exports. Any other named export fails the build with
// "is not a valid Route export field".
//
// That failure is invisible to this repository's test gate: `npm test`, `tsc`,
// `lint` and the architecture checks all passed with the constant exported from
// the route, because CI does not run `npm run build`. Only the Vercel build
// caught it. Keeping shared route constants in a plain module is what stops the
// next person rediscovering that the slow way.

/**
 * The `audit_log.action` under which every hit on the retired endpoint is
 * recorded. Step 7's observation window is a query for this value, so the route
 * and the query must never drift apart — hence one exported constant rather
 * than the same string typed twice.
 */
export const LEGACY_BROADCAST_RETIRED_ACTION = 'notification.broadcast.legacy_gone'

/** `audit_log.target_type` for the same rows. */
export const LEGACY_BROADCAST_RETIRED_TARGET = 'notification_broadcast_legacy'
