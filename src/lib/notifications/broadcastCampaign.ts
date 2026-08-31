import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchNotification,
  type DispatchOutcome,
  type DispatchRequest,
  type NotificationOrigin,
} from './dispatchService'
import { planChunks, BROADCAST_CHUNK_SIZE } from './broadcastChunks'

// ─── PHASE C — CAMPAIGN ORCHESTRATION ────────────────────────────────────────
//
// Contract: §5.1, C-7, C-34 … C-39. Owner decision O-3 = A.
//
// One campaign = one ordered audience, partitioned into chunks of ≤ 500, each
// chunk dispatched through the shared seam. This file owns idempotency, partial
// failure and resume. It owns NO authorization and performs NO push.

/**
 * The key under which a campaign stamps its identity onto every notification
 * row it creates.
 *
 * 🔑 THE LEDGER IS THE DELIVERY RECORD ITSELF — there is no second table to
 * fall out of step with reality. "Has this person been notified for this
 * campaign?" is answered by asking whether the row exists, which is precisely
 * the thing that would have to be true for them to have been notified. A
 * separate progress table could say "chunk 3 done" while chunk 3's rows were
 * never written, and that divergence is exactly the failure C-37 describes.
 */
export const BROADCAST_CAMPAIGN_KEY = 'broadcast_campaign_id'

export type ChunkStatus =
  /** The seam accepted the chunk and reported per-recipient outcomes. */
  | 'success'
  /**
   * The seam REFUSED before doing anything. Nothing was written, nothing was
   * pushed, and no recipient in this chunk was touched.
   */
  | 'failed-before-dispatch'
  /**
   * The dispatch threw. Some, all or none of this chunk may have been notified
   * and there is no way to tell from here.
   *
   * 🚨 A chunk in this state is NEVER retried inside the run (C-37). Its
   * recipients are re-derived from the ledger on the next resume, where the
   * question "did this person actually get a row?" has a real answer.
   */
  | 'failed-after-dispatch-unknown'

export interface ChunkResult {
  index: number
  size: number
  status: ChunkStatus
  /** Machine-readable refusal reason or error class. Never message content. */
  reason: string | null
  accepted: number
  failed: number
  gone: number
  unreachable: number
  errored: number
}

export type CampaignStatus =
  /** Every chunk succeeded, or there was nothing left to send. */
  | 'completed'
  /** At least one chunk failed or ended in an unknown state. Resume is safe. */
  | 'partial'
  /** Halted at a chunk boundary by the kill switch. */
  | 'stopped'

export interface CampaignResult {
  campaignId: string
  /** Eligible recipients resolved for this campaign. */
  audienceSize: number
  /** Already carried a row for this campaign before this run — skipped. */
  alreadyNotified: number
  /** Recipients this run attempted, i.e. audience minus alreadyNotified. */
  attempted: number
  chunkCount: number
  chunks: ChunkResult[]
  accepted: number
  failed: number
  gone: number
  unreachable: number
  errored: number
  status: CampaignStatus
}

export type DispatchFn = (req: DispatchRequest) => Promise<DispatchOutcome>

/**
 * Which of `userIds` already hold a notification row for this campaign.
 *
 * Chunked by the same bound as a dispatch so a very large audience cannot build
 * a single unbounded `IN (...)`.
 *
 * Throws on failure rather than returning an empty set. An empty set means "we
 * may send to everyone", so a read failure that degraded to empty would turn a
 * resume into a second full broadcast — the exact duplicate C-39 forbids, at
 * the exact moment the system is already unhealthy.
 */
export async function alreadyNotifiedForCampaign(
  admin: SupabaseClient,
  campaignId: string,
  userIds: readonly string[],
): Promise<Set<string>> {
  const seen = new Set<string>()
  for (const batch of planChunks(userIds)) {
    const { data, error } = await admin
      .from('notifications')
      .select('user_id')
      .eq(`data->>${BROADCAST_CAMPAIGN_KEY}`, campaignId)
      .in('user_id', batch)

    if (error) {
      throw new Error(`broadcast ledger read failed: ${error.message}`)
    }
    for (const row of data ?? []) seen.add(row.user_id as string)
  }
  return seen
}

export interface RunCampaignInput {
  campaignId: string
  /** Ordered and eligible — see broadcastAudience.ts. Order is preserved. */
  audience: readonly string[]
  message: { title: string; body: string; link?: string }
  origin: NotificationOrigin
  req?: Request
  chunkSize?: number
  /**
   * Checked at every chunk boundary (C-13). Returning false stops the run and
   * reports `stopped`; chunks already dispatched are already delivered and the
   * result says so rather than pretending the campaign did not happen.
   */
  shouldContinue?: () => boolean
  deps: {
    dispatch: DispatchFn
    /** Resolves the ledger. Injected so resume semantics are testable. */
    alreadyNotified: (campaignId: string, userIds: readonly string[]) => Promise<Set<string>>
  }
}

const EMPTY_COUNTS = { accepted: 0, failed: 0, gone: 0, unreachable: 0, errored: 0 }

/**
 * Run — or RESUME — one broadcast campaign.
 *
 * ── ON RETRY, AND WHY THERE IS NO IN-PROCESS RETRY LOOP ──────────────────────
 *
 * 🔑 Retry here is RESUME: call again with the same `campaignId`. That is not a
 * shortcut, it is the only form of retry that can be correct, and the reason is
 * that none of the seam's refusals is transient within a run:
 *
 *   · `DUPLICATE` — suppressed for 60s. An immediate retry is refused again,
 *     and waiting 60s inside a request whose `maxDuration` is 60s cannot work.
 *   · `TOO_MANY_RECIPIENTS` — deterministic. A retry is refused identically.
 *   · `NO_RECIPIENTS` — deterministic.
 *
 * An in-process loop over these would burn attempts to reach the same answer
 * and would LOOK like resilience in the code while providing none. The bound
 * required by C-38 is therefore one attempt per chunk per run, and the retry
 * that does real work is the next call — where the ledger has been re-read and
 * every recipient already notified is skipped (C-35, C-39).
 *
 * A chunk that ended `failed-after-dispatch-unknown` does not stop the run.
 * Later chunks hold DISJOINT recipients — guaranteed by the partition in
 * `planChunks` (C-34) — so continuing cannot double-notify anyone the unknown
 * chunk may have reached.
 */
export async function runBroadcastCampaign(input: RunCampaignInput): Promise<CampaignResult> {
  const { campaignId, audience, message, origin, req, deps, shouldContinue } = input
  const chunkSize = input.chunkSize ?? BROADCAST_CHUNK_SIZE

  const already = await deps.alreadyNotified(campaignId, audience)
  // Order is preserved: `audience` is already ordered, and filtering never
  // reorders. Chunk boundaries therefore stay reproducible across a resume for
  // whatever remains (C-36).
  const pending = audience.filter((id) => !already.has(id))
  const chunks = planChunks(pending, chunkSize)

  const results: ChunkResult[] = []
  let status: CampaignStatus = 'completed'

  for (let index = 0; index < chunks.length; index++) {
    if (shouldContinue && !shouldContinue()) {
      status = 'stopped'
      break
    }

    const recipients = chunks[index]
    let outcome: DispatchOutcome
    try {
      outcome = await deps.dispatch({
        recipients,
        message,
        type: 'broadcast',
        category: 'system',
        origin,
        req,
        // The campaign stamp. This is what makes the notification row a ledger
        // entry, and it is the ONLY thing broadcast adds to the row.
        data: { [BROADCAST_CAMPAIGN_KEY]: campaignId },
      })
    } catch (err) {
      results.push({
        index,
        size: recipients.length,
        status: 'failed-after-dispatch-unknown',
        reason: err instanceof Error ? err.name : 'unknown_error',
        ...EMPTY_COUNTS,
      })
      status = 'partial'
      continue
    }

    if (!outcome.ok) {
      results.push({
        index,
        size: recipients.length,
        status: 'failed-before-dispatch',
        reason: outcome.reason,
        ...EMPTY_COUNTS,
      })
      status = 'partial'
      continue
    }

    results.push({
      index,
      size: recipients.length,
      status: 'success',
      reason: null,
      accepted: outcome.accepted,
      failed: outcome.failed,
      gone: outcome.gone,
      unreachable: outcome.unreachable,
      errored: outcome.errored,
    })
  }

  const sum = (pick: (c: ChunkResult) => number) => results.reduce((n, c) => n + pick(c), 0)

  return {
    campaignId,
    audienceSize: audience.length,
    alreadyNotified: already.size,
    attempted: pending.length,
    chunkCount: chunks.length,
    chunks: results,
    accepted: sum((c) => c.accepted),
    failed: sum((c) => c.failed),
    gone: sum((c) => c.gone),
    unreachable: sum((c) => c.unreachable),
    errored: sum((c) => c.errored),
    status,
  }
}

/** Production wiring: the real seam and the real ledger. */
export function campaignDeps(admin: SupabaseClient): RunCampaignInput['deps'] {
  return {
    dispatch: dispatchNotification,
    alreadyNotified: (campaignId, userIds) =>
      alreadyNotifiedForCampaign(admin, campaignId, userIds),
  }
}
