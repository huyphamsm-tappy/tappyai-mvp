import { createHash } from 'node:crypto'

// Server-only half of the plan share: node crypto is not available to the
// browser preview, and the browser never needs the fingerprint.

/** sha256 of the canonical snapshot. With the owner, the row's uniqueness key. */
export function planShareFingerprint(canonicalJson: string): string {
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex')
}
