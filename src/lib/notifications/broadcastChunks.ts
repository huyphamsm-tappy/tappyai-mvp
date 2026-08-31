import { createHash } from 'node:crypto'
import { MAX_RECIPIENTS_PER_DISPATCH } from './dispatchService'

// ─── PHASE C — CHUNK PLANNING ────────────────────────────────────────────────
//
// Contract: §4.1, §4.2, C-23, C-24, C-34. Owner decision O-3 = A.
//
// The cap stays at 500 and the broadcast chunks UNDER it. Nothing here calls a
// dispatch function, and nothing here may ever be used to get around the cap —
// the seam owns that refusal and keeps it.
//
// 🔑 CHUNKING LIVES IN THE CALLER, NOT THE SEAM. The seam's job is to refuse
// more than 500 recipients; knowing what a "campaign" is would make it know
// about one caller's workflow, and the whole reason it exists is that both
// callers share it without sharing their authorities.

/**
 * The chunk size a broadcast uses.
 *
 * Equal to the cap rather than merely below it: a smaller default would be an
 * unexplained number, and a larger one is impossible. The seam's refusal is
 * still the authority — this is the caller staying inside it, not a second copy
 * of the rule.
 */
export const BROADCAST_CHUNK_SIZE = MAX_RECIPIENTS_PER_DISPATCH

/**
 * Partition an ordered audience into dispatchable chunks.
 *
 * PARTITION, NOT SAMPLE (C-34). The union of the chunks equals the input
 * exactly — same order, no recipient duplicated across chunks, none omitted.
 * Chunk boundaries are positional, so given the same ordered audience they are
 * reproducible: chunk k is always the same people.
 *
 * Throws rather than silently clamping when asked for an oversized chunk. A
 * clamp would let a caller ask for 5000, receive 500, and never learn that the
 * request was wrong — and the next reader would reasonably believe 5000 worked.
 */
export function planChunks<T>(
  items: readonly T[],
  size: number = BROADCAST_CHUNK_SIZE,
): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`broadcast chunk size must be a positive integer, got ${size}`)
  }
  if (size > MAX_RECIPIENTS_PER_DISPATCH) {
    throw new Error(
      `broadcast chunk size ${size} exceeds MAX_RECIPIENTS_PER_DISPATCH (${MAX_RECIPIENTS_PER_DISPATCH})`,
    )
  }

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * A short, stable fingerprint of an ORDERED audience.
 *
 * 🔑 THIS IS HOW DETERMINISM IS PROVED WITHOUT EXPOSING ANYONE. Two dry runs
 * that report the same hash resolved the same people in the same order; a hash
 * that moves between runs means the ordering is not stable, which is exactly
 * the defect C-24 exists to prevent. The ids themselves never leave the server.
 *
 * Order-SENSITIVE by construction — it hashes the sequence, not the set. A hash
 * over a sorted copy would return the same value for a shuffled audience and
 * would therefore prove nothing.
 */
export function audienceFingerprint(recipients: readonly string[]): string {
  return createHash('sha256').update(recipients.join(',')).digest('hex').slice(0, 16)
}
