/**
 * The publication boundary — what a newly created post is written with.
 *
 * This is the one place that turns "a post was created" into a lifecycle state,
 * and it is deliberately tiny: gather evidence, evaluate, ask the gate, return
 * columns. All the judgement lives in layers below it.
 *
 * ============================================================================
 * WHEN THE GATE IS OFF
 * ============================================================================
 * It returns NO lifecycle columns at all. Not `UNDER_REVIEW` — nothing. A post
 * created while the gate is inactive is stored exactly as it was before the gate
 * existed, and the access layer treats a null state as publishable. Holding
 * content on the strength of an inactive gate would be a block-all default, and
 * writing `PUBLISHED` would be an allow-all one; writing nothing is the only
 * option that changes neither.
 *
 * ============================================================================
 * WHEN IT FAILS
 * ============================================================================
 * `UNDER_REVIEW`. Evidence gathering makes a network call, and a call can fail.
 * A post whose safety could not be evaluated is not published — but it is also
 * not restricted, and its author is not told they did anything wrong.
 */

import { gatherEvidence, safetyContentVersion, type SafetySubject } from '../evidence/pipeline';
import { activationStatus, activationEnvironmentFromConfig } from './activation';
import { evaluateSafety } from './safetyResult';

/** The columns to merge into the row being inserted. Empty when the gate is off. */
export interface LifecycleColumns {
  readonly publication_state?: 'UNDER_REVIEW' | 'PUBLISHED' | 'RESTRICTED';
  readonly safety_state?: string;
  readonly evaluated_version?: string;
  readonly evaluated_at?: string;
}

export interface PublishDecisionResult {
  readonly columns: LifecycleColumns;
  /** Why, for an operator log. Never carries content, identity or an accusation. */
  readonly reason: string;
}

/**
 * Decide the lifecycle state for a post at creation or after an edit.
 *
 * Total: any failure yields `UNDER_REVIEW` rather than throwing, so a safety
 * problem can never stop someone from posting — it only stops the post from
 * going public until it has been evaluated.
 */
export async function decidePublication(
  subject: SafetySubject,
  now: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<PublishDecisionResult> {
  const status = activationStatus(activationEnvironmentFromConfig(env));
  if (!status.active) {
    // Deliberately no columns: the gate is off and must change nothing.
    return { columns: {}, reason: 'gate inactive — no lifecycle state written' };
  }

  try {
    const bundle = await gatherEvidence(subject, now);
    const result = evaluateSafety(bundle, now);
    return {
      columns: {
        publication_state: result.publication,
        safety_state: result.state,
        evaluated_version: result.contentVersion,
        evaluated_at: now,
      },
      reason: `gate ${result.gate.decision}, safety ${result.state}`,
    };
  } catch {
    return {
      columns: {
        publication_state: 'UNDER_REVIEW',
        safety_state: 'ENGINE_ERROR',
        evaluated_version: safetyContentVersion(subject),
        evaluated_at: now,
      },
      reason: 'evaluation failed — held, not restricted',
    };
  }
}
