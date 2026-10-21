import { randomBytes } from 'node:crypto'

// Tappy Business — external identifiers.
//
// Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md §F4 and §11 of the
// architecture contract.
//
// ============================================================================
// WHY EVERY BUSINESS ROW CARRIES TWO IDS
// ============================================================================
// The `id` column is a `gen_random_uuid()` primary key — the repository's
// convention, and what foreign keys join on. `public_id` is a ULID and is the
// ONLY identifier that ever leaves the server: it appears in product URLs
// shared to Facebook and Zalo, in QR codes printed on a menu, and as the
// migration anchor that maps a Tappy row onto a future commerce engine's row
// (§40).
//
// The redundancy is deliberate and was recorded rather than resolved: a random
// UUID would satisfy every property listed for `public_id`, but the contract
// asks for the split, and the cost is one indexed text column per table.
//
// 🚨 A SEQUENTIAL DATABASE ID MUST NEVER APPEAR IN A URL OR AN API RESPONSE.
// That is the rule this module exists to make easy to follow.
//
// ============================================================================
// WHY THIS IS ~40 LINES INSTEAD OF A DEPENDENCY
// ============================================================================
// The Phase 0 OSS evaluation leaned toward the `ulid` npm package. Reading the
// actual repository reversed that: this codebase carries no micro-dependencies
// of this shape, runs an architecture guard over its imports, and treats a new
// entry in package.json as a supply-chain decision. The specification is short
// enough that the whole implementation is below and fully tested, so taking a
// dependency would buy nothing and cost a review.
//
// ============================================================================
// THE FORMAT
// ============================================================================
// A ULID is 128 bits rendered as 26 Crockford Base32 characters:
//
//     01ARZ3NDEK      TSV4RRFFQ69G5FAV
//     └─ 48-bit ms ─┘ └─ 80 bits random ─┘
//
// The timestamp prefix makes ids roughly sortable by creation time, which is
// useful in an index. It does NOT make them guessable: the 80 random bits are
// what stand between an attacker and someone else's product URL, and 2^80 is
// not searchable. Crockford Base32 omits I, L, O and U so a ULID read aloud or
// copied off a printed QR label cannot be transcribed into a different one.

/** Crockford Base32 — no I, L, O or U. */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const TIME_CHARS = 10
const RANDOM_CHARS = 16
const RANDOM_BYTES = 10 // 80 bits — exactly 16 base32 characters, no padding.

/** Total length of a `public_id`. */
export const PUBLIC_ID_LENGTH = TIME_CHARS + RANDOM_CHARS

/**
 * The one place this shape is written in TypeScript. It is duplicated exactly
 * once more — as a CHECK constraint in
 * `supabase/migrations/20260908_tappy_business_p0.sql` — because a malformed id
 * must be rejected by the database even if it arrives by some path that skipped
 * this module. `ids.test.ts` asserts the two agree.
 */
export const PUBLIC_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

/** 2^48 - 1: the largest timestamp the 10-character prefix can hold. */
const MAX_TIME = 281_474_976_710_655

function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIME) {
    throw new RangeError(`public id timestamp out of range: ${ms}`)
  }
  let remaining = ms
  let out = ''
  for (let i = 0; i < TIME_CHARS; i++) {
    const digit = remaining % 32
    out = ENCODING[digit] + out
    remaining = (remaining - digit) / 32
  }
  return out
}

/**
 * 10 random bytes → 16 characters.
 *
 * Written as a bit accumulator rather than with BigInt because this project
 * compiles to ES2017, where `0n` is a syntax error. 80 bits divide evenly into
 * 5-bit groups, so there is no padding and no leftover state to get wrong.
 */
function encodeRandom(): string {
  const bytes = randomBytes(RANDOM_BYTES)
  let out = ''
  let acc = 0
  let bits = 0
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ENCODING[(acc >>> bits) & 31]
    }
  }
  return out
}

/**
 * A new external identifier. Stable, unique, never reused, safe to publish.
 *
 * `now` is injectable so tests can pin the timestamp prefix; production never
 * passes it.
 */
export function newPublicId(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom()
}

/** True when a value is a well-formed `public_id`. */
export function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value)
}

/**
 * Narrow an untrusted value, or throw.
 *
 * Use this at every boundary that receives a `public_id` from outside — a route
 * parameter, a request body, an import file. It exists so that an id reaching a
 * query is known to be well-formed, which removes a whole class of "why is this
 * query slow / why did this match nothing" question later on.
 */
export function assertPublicId(value: unknown, label = 'public_id'): string {
  if (!isPublicId(value)) {
    // The value is not echoed back: it arrived from a caller who may be
    // hostile, and error text is the easiest place to hand someone a map.
    throw new TypeError(`${label} is not a valid Tappy Business public id`)
  }
  return value
}
