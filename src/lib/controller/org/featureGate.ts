// Controller V2 — the F-10 feature gate. PURE MODULE.
//
// This predicate used to live in `org/server.ts`, which is where it was first
// needed. It does not belong there: it reads one environment variable and
// touches no client, while `server.ts` imports `createAdminClient` and may
// never enter a client bundle.
//
// It moved for the same reason `userHub` moved to `hubs.ts` — the module
// manifest for `/admin/org/memberships` derives its `status` from this flag,
// and the registry is pure. Importing `server.ts` from the registry would have
// dragged the service-role client into every bundle that reads a nav entry.
//
// `server.ts` re-exports it, so every existing importer is unaffected.

/**
 * True once the operator has enabled DB-backed department memberships.
 *
 * Strict equality with `'true'`, deliberately: `'TRUE'` and `'1'` are typos,
 * not consent, and a feature that turns itself on for a typo is worse than one
 * that stays off.
 */
export function orgMembershipEnabled(): boolean {
  return process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED === 'true'
}
