import { writeAuditLogAwaited } from '@/lib/admin/audit'
import { describeTool } from './registry'

// ── P0-2: the AI write boundary ──────────────────────────────────────────────
//
// ONE function every AI-initiated write goes through:
//
//   AI tool call
//     → registry lookup        is this a declared write at all?
//     → permission             is there an authenticated identity to act as?
//     → argument validation    does the payload mean anything?
//     → scope / quota          is the actor allowed THIS MUCH?
//     → deterministic execute  the only place a side effect happens
//     → audit                  what happened, allowed or denied
//
// The model supplies ARGUMENTS. It does not supply the actor, the ownership, the limits, or the
// decision to proceed. That asymmetry is the whole boundary: a prompt injection can make the model
// ask for anything, and the worst it can reach is `validate` on this side of the line.
//
// DENIALS ARE AUDITED TOO. A denial is the single most useful row in an abuse investigation, and
// the shape of the trail must not depend on whether the attempt worked.
//
// Deliberately NOT here: retries, queues, transactions, an action bus. One function and a policy
// object per action. A second write action is a policy object; nothing about this file changes.

export type DenyReason =
  /** No authenticated identity — an anonymous session may not write. */
  | 'unauthenticated'
  /** The tool is not a declared write in the registry. */
  | 'not_a_write_action'
  /** The model's arguments do not describe a usable request. */
  | 'invalid_arguments'
  /** Well-formed, but beyond what this actor may do (per-user caps). */
  | 'scope_exceeded'
  /** The side effect itself failed. */
  | 'execution_failed'

export type Validated<A> =
  | { ok: true; args: A }
  | { ok: false; reason: Extract<DenyReason, 'invalid_arguments'>; message: string }

export type ScopeCheck =
  | { ok: true }
  | { ok: false; reason: Extract<DenyReason, 'scope_exceeded'>; message: string }

export interface ActionPolicy<A, R> {
  /**
   * Narrow the model's raw arguments to a value this action can act on.
   *
   * The ONLY place model-supplied data is interpreted. It must not read the actor, the database,
   * or anything else — a validator that can be influenced by state is not a boundary.
   */
  validate: (raw: unknown) => Validated<A>
  /** Per-actor limits. Runs after validation, before any side effect. */
  scope?: (input: { userId: string; args: A }) => Promise<ScopeCheck>
  /** The deterministic side effect. The single place state changes. */
  execute: (input: { userId: string; args: A }) => Promise<R>
  /** What the audit row points at. */
  target: (input: { userId: string; args: A; result: R }) => { type: string; id?: string }
  /**
   * The audited summary of what changed.
   *
   * Operational facts only — never the user's message, never free text the model wrote. This lands
   * in `audit_log.after_state`, which admins read.
   */
  summary: (input: { args: A; result: R }) => Record<string, unknown>
  /** Message handed back to the model (and therefore the user) when the actor is not signed in. */
  unauthenticatedMessage: string
  /** Message when the side effect itself failed. Never the raw exception. */
  failureMessage: string
}

export type ActionOutcome<R> =
  | { ok: true; result: R }
  | { ok: false; reason: DenyReason; message: string }

interface RunInput<A, R> {
  /** The tool name as declared to the model. Looked up in the registry. */
  tool: string
  /** Resolved server-side from the verified session. NEVER from the model. */
  actor: { userId: string | null }
  /** Whatever the model passed to the tool. Untrusted. */
  rawArgs: unknown
  policy: ActionPolicy<A, R>
  /** The originating request, for the audit row's IP. Optional. */
  req?: Request
}

/**
 * Audit both outcomes through the EXISTING Controller-side writer (owner decision D3).
 *
 * `actorRole: 'none'` is the truthful value: this is an end user acting through the assistant, not
 * an administrator. `audit_log.actor_role` is TEXT and `'none'` is already part of
 * `AuditActorRole` (it exists for denied actors), so no migration and no schema change.
 *
 * AWAITED, not fire-and-forget. `writeAuditLog` is deliberately un-awaited for admin routes, but a
 * measured production defect (documented on `writeAuditLogAwaited`) is that un-awaited work is
 * discarded when a serverless instance is frozen after the response. A tool's execute() already
 * awaits a database round-trip inside a stream that stays open, so awaiting one more costs nothing
 * and is the difference between an audit trail and an intermittent one.
 */
async function audit(params: {
  action: string
  userId: string | null
  outcome: 'allowed' | 'denied'
  target?: { type: string; id?: string }
  detail: Record<string, unknown>
  req?: Request
}): Promise<void> {
  await writeAuditLogAwaited({
    // 'controller' is the same placeholder the Controller kernel uses for a non-user principal.
    actorId: params.userId ?? 'anonymous',
    actorEmail: 'ai-assistant@system',
    actorRole: 'none',
    action: params.action,
    targetType: params.target?.type,
    targetId: params.target?.id,
    afterState: { outcome: params.outcome, ...params.detail },
    req: params.req,
  })
}

export async function runAiWriteAction<A, R>(input: RunInput<A, R>): Promise<ActionOutcome<R>> {
  const { tool, actor, rawArgs, policy, req } = input

  // 1 · REGISTRY. An action the registry does not describe as a write cannot run here. This is not
  //     defensive noise: it is what stops a future tool from acquiring write powers by calling
  //     this function without ever appearing in the table an audit reads.
  const descriptor = describeTool(tool)
  const action = descriptor?.auditAction ?? `ai.${tool}`
  if (!descriptor || descriptor.effect !== 'write') {
    await audit({ action, userId: actor.userId, outcome: 'denied', detail: { reason: 'not_a_write_action' }, req })
    return { ok: false, reason: 'not_a_write_action', message: policy.failureMessage }
  }

  // 2 · PERMISSION. Identity comes from the verified session, never from the model's arguments.
  //
  //     A write is always scoped to an owner, so an authenticated identity is required
  //     unconditionally — there is no such thing as an anonymous write here, and
  //     `actionBoundary.test.ts` asserts no write descriptor claims otherwise. Checked even though
  //     route.ts only DECLARES the tool when a user is signed in: a capability that exists solely
  //     because a prompt-time branch happened to run is not a permission check.
  if (!actor.userId) {
    await audit({ action, userId: null, outcome: 'denied', detail: { reason: 'unauthenticated' }, req })
    return { ok: false, reason: 'unauthenticated', message: policy.unauthenticatedMessage }
  }
  const userId = actor.userId

  // 3 · ARGUMENTS. The only interpretation of model-supplied data in the whole path.
  const validated = policy.validate(rawArgs)
  if (!validated.ok) {
    await audit({ action, userId, outcome: 'denied', detail: { reason: 'invalid_arguments' }, req })
    return { ok: false, reason: 'invalid_arguments', message: validated.message }
  }
  const args = validated.args

  // 4 · SCOPE. What this actor may do, checked against the actor's own state — not against
  //     anything the model said.
  if (policy.scope) {
    const scope = await policy.scope({ userId, args })
    if (!scope.ok) {
      await audit({ action, userId, outcome: 'denied', detail: { reason: 'scope_exceeded' }, req })
      return { ok: false, reason: 'scope_exceeded', message: scope.message }
    }
  }

  // 5 · EXECUTE. The single place a side effect happens.
  let result: R
  try {
    result = await policy.execute({ userId, args })
  } catch (e) {
    // The exception text never reaches the model: it has carried provider and schema detail
    // before, and the model reads tool results out loud.
    console.error(`[ai/actions] ${action} failed:`, e instanceof Error ? e.message : e)
    await audit({ action, userId, outcome: 'denied', detail: { reason: 'execution_failed' }, req })
    return { ok: false, reason: 'execution_failed', message: policy.failureMessage }
  }

  // 6 · AUDIT the success.
  await audit({
    action,
    userId,
    outcome: 'allowed',
    target: policy.target({ userId, args, result }),
    detail: policy.summary({ args, result }),
    req,
  })
  return { ok: true, result }
}
