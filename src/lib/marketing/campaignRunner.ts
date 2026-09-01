import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchNotification,
  type NotificationOrigin,
  type DispatchOutcome,
} from '@/lib/notifications/dispatchService'
import { planChunks, BROADCAST_CHUNK_SIZE, audienceFingerprint } from '@/lib/notifications/broadcastChunks'
import { buildMarketingAudience, type MarketingAudience } from './marketingAudience'
import { checkAudienceFloor, MIN_AUDIENCE, type SkipCounts } from './governance'
import { alreadyRecorded, recordDeliveries, type DeliveryRecord } from './deliveryLedger'
import { canActivateSend, type ActivationBlock } from './activationGate'
import type { CampaignRow } from './campaignStore'

// ─── V2.2-2 — RUNNING A CAMPAIGN ─────────────────────────────────────────────
//
// Contract: M-12a/b/c/d (floor) · M-18 (dry run first) · M-19 / M-20 (through
// the seam, governance applied BEFORE it) · M-34/35/36 (idempotent resume) ·
// M-9b / M-31a (counts, never identities).
//
// 🚨 THE ORDER OF OPERATIONS IS THE SAFETY PROPERTY.
//
//   1. activation gate   may the system send AT ALL? (M-30, Q6)
//   2. audience          who survives eligibility AND governance?
//   3. floor             is that at least 10 distinct people?
//   4. resume            who was already recorded for this campaign?
//   5. dispatch          through the shared seam, in chunks under the cap
//   6. ledger            record every send AND every skip
//
// Putting the floor before the resume filter is deliberate: the floor is a
// property of the AUDIENCE, not of the remaining work. A campaign resumed with
// three people left must not be refused for being "below 10" — those seven
// others were already messaged, and refusing would strand the campaign
// half-delivered forever.

export interface CampaignPlan {
  campaignId: string
  audienceSize: number
  candidates: number
  skipped: SkipCounts
  chunkCount: number
  chunkSizes: number[]
  audienceFingerprint: string
}

export type PlanOutcome =
  | { ok: true; plan: CampaignPlan }
  | { ok: false; reason: 'BELOW_MINIMUM_AUDIENCE' }

export interface RunResult extends CampaignPlan {
  alreadyNotified: number
  attempted: number
  accepted: number
  failed: number
  gone: number
  unreachable: number
  errored: number
  status: 'completed' | 'halted'
}

export type RunOutcome =
  | { ok: true; result: RunResult }
  | { ok: false; reason: 'BELOW_MINIMUM_AUDIENCE' }
  | { ok: false; reason: ActivationBlock }

export interface RunnerDeps {
  buildAudience: (admin: SupabaseClient, now: Date) => Promise<MarketingAudience>
  dispatch: typeof dispatchNotification
  alreadyRecorded: typeof alreadyRecorded
  recordDeliveries: typeof recordDeliveries
}

/** Real dependencies. Injected so the runner can be tested without a database. */
export function runnerDeps(): RunnerDeps {
  return {
    buildAudience: buildMarketingAudience,
    dispatch: dispatchNotification,
    alreadyRecorded,
    recordDeliveries,
  }
}

/**
 * Resolve the audience and report the plan. SENDS NOTHING.
 *
 * 🚨 THE FLOOR IS EVALUATED BEFORE THE SIZE IS REPORTED (M-12c/M-12d). Below
 * ten eligible users this returns a bare refusal carrying NO number — not the
 * audience size, not the shortfall, not the candidate count. A dry run that
 * reported "audience is 2" would already have leaked what the refusal exists to
 * protect, and an operator could binary-search a predicate down to one
 * identifiable person by reading successive refusals.
 */
export async function planCampaign(
  admin: SupabaseClient,
  campaignId: string,
  deps: RunnerDeps,
  now: Date = new Date(),
): Promise<PlanOutcome> {
  const audience = await deps.buildAudience(admin, now)

  const floor = checkAudienceFloor(audience.recipients.length)
  if (!floor.ok) return { ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' }

  const chunks = planChunks(audience.recipients, BROADCAST_CHUNK_SIZE)
  return {
    ok: true,
    plan: {
      campaignId,
      audienceSize: audience.recipients.length,
      candidates: audience.candidates,
      skipped: audience.skipped,
      chunkCount: chunks.length,
      chunkSizes: chunks.map((c) => c.length),
      audienceFingerprint: audienceFingerprint(audience.recipients),
    },
  }
}

/**
 * Run a campaign for real.
 *
 * 🚨 THE ACTIVATION GATE IS CHECKED HERE, NOT ONLY IN THE ROUTE. The route
 * checks it too, and that is not redundancy for its own sake: this function is
 * the last thing standing between a caller and a real push, and a future caller
 * that forgot the gate would otherwise send. A refusal that depends on every
 * caller remembering is not a refusal.
 */
export async function runCampaign(
  admin: SupabaseClient,
  campaign: CampaignRow,
  origin: NotificationOrigin,
  deps: RunnerDeps,
  req?: Request,
  now: Date = new Date(),
): Promise<RunOutcome> {
  const gate = canActivateSend()
  if (!gate.ok) return { ok: false, reason: gate.reason }

  const audience = await deps.buildAudience(admin, now)

  // The floor applies to the REAL SEND as well as the dry run (M-12d, M-31).
  const floor = checkAudienceFloor(audience.recipients.length)
  if (!floor.ok) return { ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' }

  const fingerprint = audienceFingerprint(audience.recipients)

  // ── RESUME (M-34, M-36) ───────────────────────────────────────────────────
  // Everyone already recorded for THIS campaign is skipped. Retry is resume,
  // and the ledger is what makes resume safe: the seam's duplicate suppression
  // is a 60-second window over identical content, which a resume hours later
  // sails straight past.
  const done = await deps.alreadyRecorded(
    admin,
    campaign.id,
    audience.recipients.map((id) => id),
  )
  const remaining = audience.recipients.filter((id) => !done.has(id))

  const chunks = planChunks(remaining, BROADCAST_CHUNK_SIZE)

  let accepted = 0
  let failed = 0
  let gone = 0
  let unreachable = 0
  let errored = 0
  let attempted = 0
  let status: RunResult['status'] = 'completed'

  for (const chunk of chunks) {
    // Re-read the gate at every chunk boundary, so clearing the switch halts an
    // in-flight campaign without a deploy — the same property Phase C has.
    if (!canActivateSend().ok) {
      status = 'halted'
      break
    }

    const outcome: DispatchOutcome = await deps.dispatch({
      recipients: chunk,
      message: {
        title: campaign.title,
        body: campaign.body,
        ...(campaign.link ? { link: campaign.link } : {}),
      },
      type: 'marketing',
      category: 'marketing',
      origin,
      req,
      // The campaign id rides on each notification row, exactly as Phase C's
      // does, so "was this person notified for this campaign" has an answer
      // that cannot drift from reality.
      data: { marketing_campaign_id: campaign.id },
    })

    if (!outcome.ok) {
      // A refused chunk is NOT recorded as delivered, and the campaign halts
      // rather than continuing past a refusal it does not understand. Recording
      // a refusal as a send would silence those people for 24 hours for a
      // message they never received.
      status = 'halted'
      break
    }

    attempted += outcome.recipients
    accepted += outcome.accepted
    failed += outcome.failed
    gone += outcome.gone
    unreachable += outcome.unreachable
    errored += outcome.errored

    // ── THE LEDGER WRITE, IMMEDIATELY AFTER THE CHUNK ─────────────────────
    // Per chunk rather than once at the end (M-35): a process that dies here
    // has already recorded the chunks that completed, so a resume skips them.
    // A single write at the end would lose the whole run's record and the
    // resume would re-send everything.
    const records: DeliveryRecord[] = outcome.perRecipient.map((r) => ({
      campaignId: campaign.id,
      userId: r.userId,
      // A row that could not be created at all is not a send. Recording it as
      // one would count against that person's cap for a message that does not
      // exist.
      status: r.notificationId === null ? 'skipped' : 'sent',
      ...(r.notificationId === null ? { skipReason: 'ineligible' as const } : {}),
      notificationId: r.notificationId,
    }))
    await deps.recordDeliveries(admin, records)
  }

  // ── SKIPS ARE RECORDED TOO (M-7) ──────────────────────────────────────────
  // Everyone governance refused gets a row explaining why. Without it a
  // campaign can say "40 sent" and nothing can say what happened to the other
  // 60 — and the refusal reasons would exist only in a response nobody kept.
  await deps.recordDeliveries(
    admin,
    audience.refusals.map((r) => ({
      campaignId: campaign.id,
      userId: r.userId,
      status: 'skipped' as const,
      skipReason: r.reason,
    })),
  )

  return {
    ok: true,
    result: {
      campaignId: campaign.id,
      audienceSize: audience.recipients.length,
      candidates: audience.candidates,
      skipped: audience.skipped,
      chunkCount: chunks.length,
      chunkSizes: chunks.map((c) => c.length),
      audienceFingerprint: fingerprint,
      alreadyNotified: done.size,
      attempted,
      accepted,
      failed,
      gone,
      unreachable,
      errored,
      status,
    },
  }
}

export { MIN_AUDIENCE }
