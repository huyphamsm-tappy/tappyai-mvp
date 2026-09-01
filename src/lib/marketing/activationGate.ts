import { serverEnv } from '@/lib/config/env'

// ─── V2.2-2 — THE ACTIVATION GATE ────────────────────────────────────────────
//
// Contract: docs/controller-v2/V2.2_MARKETING_PHASE2_CONTRACT.md
//   M-2 / M-2a / M-30   consent export is a HARD DEPENDENCY on activation
//   DoD 8              "Until then, activation must not be enabled at all"
//   §23.2 Q6           who owns delivering consent export is still OPEN
//
// 🚨 THIS FILE IS THE REASON MARKETING CANNOT SEND, AND IT IS SUPPOSED TO BE.
//
// Two independent gates, both of which must open. They are different KINDS of
// gate on purpose, and collapsing them into one would lose the distinction that
// matters:
//
//   1. THE CONTRACT GATE — `CONSENT_EXPORT_SATISFIED`, a source constant.
//   2. THE OPERATIONAL SWITCH — `MARKETING_SENDING_ENABLED`, an env variable.
//
// 🔑 WHY THE FIRST ONE IS NOT AN ENVIRONMENT VARIABLE. An env flag can be
// flipped by anyone with access to the deployment dashboard, in seconds, with
// no review and no record in the repository. M-30 is not an operational
// setting — it is an unmet legal precondition, and Q6 is an unresolved
// ownership question that only the Owner can answer. Encoding it as a source
// constant means opening it requires a commit, a diff, a review and a merge:
// the same weight as the decision it represents. Making it configurable would
// quietly demote a compliance gate to a feature flag.
//
// 🔑 WHY THERE IS A SECOND GATE AT ALL. Even once M-30 is satisfied, "the code
// is capable of sending" and "sending is switched on right now" must stay
// separate — that is what let Phase C ship its broadcast path inert, verify it
// on production, and arm it for one send under a separate Owner approval. The
// same discipline applies here.

/**
 * Has consent export been delivered and DEMONSTRATED (M-30)?
 *
 * 🚨 FALSE, AND CHANGING IT IS AN OWNER DECISION, NOT AN IMPLEMENTATION ONE.
 *
 * As measured on production 2026-09-01 and re-verified since:
 *   · no export mechanism exists of either kind — `POST /api/admin/export`
 *     returns 404, there is no export route in `src/`, no export permission in
 *     the registry and no export module among the registered manifests;
 *   · Q6 is OPEN — whether consent export belongs to Marketing Phase 2 or to
 *     the existing export workstream, and who owns delivering it, is
 *     undecided;
 *   · and M-2a forbids marking this satisfied without SHOWING the exported
 *     payload containing consent state.
 *
 * Flipping this to `true` without that evidence would not be a bug in the
 * ordinary sense. It would be a false statement about a compliance obligation,
 * made in code, in a place that reads like configuration.
 */
export const CONSENT_EXPORT_SATISFIED = false

/**
 * The typed confirmation phrase (M-18), carried over from C-14.
 *
 * 🔑 NOT TRANSLATED, AND DELIBERATELY THE SAME WORD CONTROLLER USES. An
 * operator who has learned that "typing BROADCAST means this reaches real
 * people and cannot be undone" should not have to learn a second word for the
 * same consequence — and a phrase that changed with the interface language
 * would be a different guard per locale.
 *
 * 🚨 IT LIVES HERE, NOT IN THE ROUTE. Next.js validates the export surface of
 * a route module and rejects anything that is not a recognised route field, so
 * `export const CONFIRM_PHRASE` inside `route.ts` fails the production build —
 * and CI does not run `npm run build`, so it fails first in Vercel. Keeping it
 * beside the gate also means the server and the UI import ONE definition
 * instead of holding two string literals that can drift apart.
 */
export const CONFIRM_PHRASE = 'BROADCAST'

export type ActivationBlock =
  | 'CONSENT_EXPORT_UNSATISFIED'
  | 'SENDING_DISABLED'

export type ActivationVerdict = { ok: true } | { ok: false; reason: ActivationBlock }

/**
 * The gate logic, as a pure function of its two inputs.
 *
 * 🔑 SEPARATED FROM `canActivateSend` SO BOTH BRANCHES CAN ACTUALLY BE TESTED.
 * `CONSENT_EXPORT_SATISFIED` is a constant that is `false` in every environment
 * this code will ever run in until the Owner changes it — which means a test
 * written against `canActivateSend()` alone can only ever exercise the first
 * refusal. The second gate would be asserted by a test that passes for the
 * wrong reason, and would keep passing if it were deleted.
 *
 * FAIL-CLOSED BY CONSTRUCTION. Both must be open; either one closed refuses.
 * The contract gate is evaluated FIRST so the reported reason names the real
 * blocker — an operator told "sending is disabled" would go looking for a
 * switch to flip, when the actual answer is that a legal precondition is unmet
 * and no switch will help.
 */
export function evaluateActivation(
  consentExportSatisfied: boolean,
  sendingEnabled: boolean,
): ActivationVerdict {
  if (!consentExportSatisfied) return { ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' }
  if (!sendingEnabled) return { ok: false, reason: 'SENDING_DISABLED' }
  return { ok: true }
}

/**
 * May a real send happen at all right now?
 *
 * ⚠️ THIS DOES NOT AUTHORIZE ANYTHING. It answers "is the system permitted to
 * send", never "is this actor permitted to send" — that is `requirePermission`
 * in the route, and the two must not be conflated. A gate that also carried
 * authorization would be a second place for permissions to leak between
 * Marketing and Controller, which M-21 exists to prevent.
 */
export function canActivateSend(): ActivationVerdict {
  return evaluateActivation(CONSENT_EXPORT_SATISFIED, serverEnv.marketingSendingEnabled())
}

/**
 * A human-readable explanation of a block.
 *
 * Deliberately says what is TRUE rather than what to do. "Ask an administrator
 * to enable sending" would be misleading for the consent-export case, where no
 * administrator can enable anything until the Owner resolves Q6.
 */
export function activationBlockMessage(reason: ActivationBlock): string {
  return reason === 'CONSENT_EXPORT_UNSATISFIED'
    ? 'Marketing sending is blocked: consent export (M-30) is unsatisfied and Q6 is open'
    : 'Marketing sending is disabled'
}
