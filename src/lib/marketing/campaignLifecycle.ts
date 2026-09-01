// ─── V2.2-2 MARKETING — THE CAMPAIGN LIFECYCLE ───────────────────────────────
//
// Contract: M-16 (draft -> active -> completed, `completed` terminal) · M-17
// (no scheduling) · M-5 (category is structural).
//
// 🚨 THIS IS A TRANSITION RULE, WHICH IS WHY IT IS NOT A CHECK CONSTRAINT. The
// database CHECKs that `status` is one of the three values; it cannot see the
// PREVIOUS row, so "completed is terminal" is unrepresentable there. It lives
// here, and the route is required to consult it.
//
// Pure by construction so every forbidden transition can be asserted without a
// database, and so removing one fails a test rather than quietly permitting a
// second send.

export const CAMPAIGN_STATUSES = ['draft', 'active', 'completed'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/**
 * The only transitions that exist.
 *
 * 🔑 `completed` HAS NO OUTGOING EDGE, and that is the whole point. A completed
 * campaign has already reached real people; re-activating it would send the
 * same message to the same audience a second time, and no amount of
 * confirmation UI makes that recoverable. Every other rule in this file is
 * ordinary validation — this one is the irreversibility guard.
 *
 * `draft -> completed` is absent too: a campaign that never activated has
 * nothing to complete, and allowing it would create rows that claim a send
 * happened when none did — poisoning the delivery analysis window doc 34
 * describes.
 */
const ALLOWED: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ['active'],
  active: ['completed'],
  completed: [],
}

export type TransitionVerdict =
  | { ok: true }
  | { ok: false; reason: 'TERMINAL' | 'INVALID_TRANSITION' | 'NO_OP' }

/**
 * May this campaign move from `from` to `to`?
 *
 * A NO-OP IS REFUSED RATHER THAN IGNORED. `active -> active` looks harmless and
 * is not: it is what a double-clicked activation button sends, and answering
 * "fine" would let the route run a second campaign pass over the same audience.
 * The ledger would catch the duplicate sends, but the route should never get
 * that far — a guard that relies on the layer below it to be correct is not a
 * guard.
 */
export function canTransition(from: CampaignStatus, to: CampaignStatus): TransitionVerdict {
  if (from === to) return { ok: false, reason: 'NO_OP' }
  if (ALLOWED[from].length === 0) return { ok: false, reason: 'TERMINAL' }
  if (!ALLOWED[from].includes(to)) return { ok: false, reason: 'INVALID_TRANSITION' }
  return { ok: true }
}

/**
 * May the CONTENT of a campaign in this state still be edited?
 *
 * ONLY IN DRAFT. Editing an active campaign would change the message midway
 * through its own send, so some people receive one text and some another under
 * a single campaign id — and the audit record, which names the campaign rather
 * than quoting the message, would be unable to say which. Editing a completed
 * one rewrites the record of something that already happened.
 */
export function isEditable(status: CampaignStatus): boolean {
  return status === 'draft'
}

/**
 * May a campaign in this state be activated?
 *
 * Expressed through `canTransition` rather than as a second rule, so there is
 * one definition of the lifecycle and not two that can drift.
 */
export function isActivatable(status: CampaignStatus): boolean {
  return canTransition(status, 'active').ok
}
