import { describe, it, expect } from 'vitest'
import { planChunks, audienceFingerprint, BROADCAST_CHUNK_SIZE } from './broadcastChunks'
import { MAX_RECIPIENTS_PER_DISPATCH } from './dispatchService'

// Contract §4.1, §4.2 — C-23, C-24, C-25, C-34.
//
// These are the properties a chunked broadcast rests on. Each one, if broken,
// produces a WRONG AUDIENCE rather than an error: someone notified twice,
// someone never notified, or a dispatch the seam refuses at the worst moment.

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${String(i).padStart(4, '0')}`)

describe('the cap is never exceeded', () => {
  it('🚨 chunk size defaults to the seam cap and never above it', () => {
    expect(BROADCAST_CHUNK_SIZE).toBe(MAX_RECIPIENTS_PER_DISPATCH)
    expect(BROADCAST_CHUNK_SIZE).toBeLessThanOrEqual(500)
  })

  it('🚨 MUTATION TARGET — every chunk of a large audience is <= 500', () => {
    // 1237 = 2 full chunks + a remainder, so both the exact boundary and the
    // tail are covered by one case.
    const chunks = planChunks(ids(1237))
    expect(chunks).toHaveLength(3)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_RECIPIENTS_PER_DISPATCH)
    expect(chunks[0]).toHaveLength(500)
    expect(chunks[1]).toHaveLength(500)
    expect(chunks[2]).toHaveLength(237)
  })

  it('🚨 refuses an oversized chunk size rather than silently clamping it', () => {
    // A clamp would let a caller ask for 5000, get 500, and never learn the
    // request was wrong — and the next reader would believe 5000 worked.
    expect(() => planChunks(ids(10), MAX_RECIPIENTS_PER_DISPATCH + 1)).toThrow(/exceeds MAX_RECIPIENTS/)
  })

  it('refuses a nonsensical chunk size', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => planChunks(ids(10), bad)).toThrow(/positive integer/)
    }
  })
})

describe('the audience is PARTITIONED, not sampled (C-34)', () => {
  it('🔑 the union of all chunks equals the audience exactly — order included', () => {
    const audience = ids(1237)
    expect(planChunks(audience).flat()).toEqual(audience)
  })

  it('🚨 no recipient appears in two chunks', () => {
    const seen = new Set<string>()
    for (const chunk of planChunks(ids(1237))) {
      for (const id of chunk) {
        expect(seen.has(id), `${id} appeared in two chunks`).toBe(false)
        seen.add(id)
      }
    }
    expect(seen.size).toBe(1237)
  })

  it('🚨 no recipient is skipped between chunks', () => {
    const audience = ids(1237)
    const flat = new Set(planChunks(audience).flat())
    for (const id of audience) expect(flat.has(id), `${id} was skipped`).toBe(true)
  })

  it('chunk boundaries are reproducible — chunk k is the same people every time', () => {
    const audience = ids(1237)
    expect(planChunks(audience)).toEqual(planChunks(audience))
  })

  it('an empty audience produces no chunks, not one empty chunk', () => {
    expect(planChunks([])).toEqual([])
  })
})

describe('the audience fingerprint proves ORDER, not membership', () => {
  it('🔑 the same sequence yields the same fingerprint', () => {
    expect(audienceFingerprint(ids(50))).toBe(audienceFingerprint(ids(50)))
  })

  it('🚨 MUTATION TARGET — a REORDERED audience yields a DIFFERENT fingerprint', () => {
    // This is the assertion that makes the dry run's determinism claim mean
    // something. A fingerprint computed over a sorted copy would return the
    // same value here and would prove nothing at all.
    const ordered = ids(50)
    const shuffled = [...ordered].reverse()
    expect(new Set(shuffled)).toEqual(new Set(ordered))
    expect(audienceFingerprint(shuffled)).not.toBe(audienceFingerprint(ordered))
  })

  it('does not leak an id — the output is a short hex digest', () => {
    const fp = audienceFingerprint(['11111111-1111-1111-1111-111111111111'])
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
    expect(fp).not.toContain('1111-1111')
  })
})
