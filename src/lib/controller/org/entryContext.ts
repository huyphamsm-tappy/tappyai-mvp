// Controller V2.2 — the department ENTRY resolver (Owner Decision D14).
//
// WHAT THIS DECIDES: which department context an actor ENTERS the Controller
// with, and whether they must be asked. Nothing else.
//
// ⚠️ THIS IS PRESENTATION CONTEXT, NOT AUTHORIZATION. D14 is explicit, and it is
// worth restating at the one place a URL parameter meets department data:
//
//   URL `dept`   → navigation / presentation context
//   membership   → whether that requested context is VALID for this actor
//   PDP / RBAC   → the authority over what the actor may DO — unchanged
//
// So `?dept=marketing` can never escalate anything: this module returns a
// department id and a mode, `Actor` gains no department field, and every route
// and API still runs `requirePermission()` server-side afterwards. Equally, a
// valid membership grants nothing on its own — it only makes a context legal to
// display.
//
// 🔑 IT CAN ONLY EVER NARROW. Everything returned is drawn from the actor's own
// ACTIVE memberships, so the output is a subset of what they already had. That
// is the structural property that makes accepting an attacker-controlled query
// parameter safe here, and a test pins it rather than trusting this comment.
//
// PURE by construction: no request, no client, no database, no I/O. The caller
// (`/admin`) supplies the already-resolved DepartmentContext.

import type { DepartmentContext, DepartmentId } from './types'

/** What the Controller entry route should do with this actor. */
export interface EntryContext {
  /** `enter` → render the workspace. `choose` → ask which one first. */
  kind: 'enter' | 'choose'
  /**
   * The department whose context to present, or null.
   *
   * Null is correct — never a fabricated default — for the Platform Owner
   * (global by `Actor.isOwner`, deliberately un-narrowed) and for an actor with
   * no membership at all (`none`, which must not be given a workspace it does
   * not have).
   */
  selectedDepartmentId: DepartmentId | null
  /** The departments this actor may legitimately enter. Always a subset of active memberships. */
  choosable: readonly DepartmentId[]
}

/**
 * Resolve the entry context.
 *
 * @param ctx       the actor's resolved department context (server-derived)
 * @param requested the raw `?dept=` value — UNTRUSTED, may be anything at all
 */
export function resolveEntryContext(ctx: DepartmentContext, requested?: string | null): EntryContext {
  // ACTIVE only, matching `authorizedScopes()`. Two definitions of "member"
  // would eventually disagree, and the one that disagrees silently is the one
  // that shows somebody a workspace they were suspended from.
  const owned = [...new Set(ctx.memberships.filter((x) => x.status === 'active').map((x) => x.departmentId))]

  // The Owner's reach is global and comes from `Actor.isOwner`, never from
  // membership. Narrowing it to one of fifteen departments would be a downgrade
  // wearing a choice, so D14 gives this flow no chooser at all.
  if (ctx.isOwner) return { kind: 'enter', selectedDepartmentId: null, choosable: [] }

  // No membership → the existing `none` experience. Not a chooser with an empty
  // list, which would be a dead end pretending to be a decision.
  if (owned.length === 0) return { kind: 'enter', selectedDepartmentId: null, choosable: [] }

  // Exactly one → that IS the context. A one-option dialog teaches an operator
  // that their choices do not matter.
  if (owned.length === 1) return { kind: 'enter', selectedDepartmentId: owned[0], choosable: owned }

  // Multiple. The requested value is validated by MEMBERSHIP, which also makes
  // every other check redundant: an id that is malformed, unknown, hostile, or
  // simply someone else's department is not in `owned`, so one test rejects all
  // of them. No parsing, no allowlist to keep in sync, no sanitiser to bypass.
  // The `!= null` is a TYPE guard, not a behavioural one, and mutation testing
  // proved it: removing it leaves behaviour identical, because
  // `[].includes(undefined)` and `[].includes(null)` are both already `false`
  // (verified, not assumed). It is kept because `requested` is
  // `string | null | undefined` while `includes` takes `string` — dropping it
  // would require an `as string` cast, which is a worse trade than a redundant
  // comparison. Recorded as an EQUIVALENT MUTANT rather than left as a silent
  // survivor.
  const valid = requested != null && (owned as string[]).includes(requested)
  if (valid) return { kind: 'enter', selectedDepartmentId: requested as DepartmentId, choosable: owned }

  // FAIL CLOSED. An invalid request does not fall through into some other
  // department's workspace — it goes back to the question.
  return { kind: 'choose', selectedDepartmentId: null, choosable: owned }
}
