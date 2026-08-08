// Controller V2 — minimal, deterministic semver for kernel version checks
// (FOUNDATION-01 §8). No dependencies. Supports the range forms the kernel needs:
//   *            any
//   1.2.3        exact
//   ^1 / ^1.2.3  caret (compatible within same major, >= given)
//   ~1.2 / ~1.2.3 tilde (compatible within same minor, >= given)

export interface SemVer {
  major: number
  minor: number
  patch: number
}

export function parseVersion(input: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(input.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

function gte(a: SemVer, b: SemVer): boolean {
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  return a.patch >= b.patch
}

/** Parse a partial version like "1", "1.2", "1.2.3" into a full SemVer (missing parts = 0). */
function parsePartial(input: string): SemVer | null {
  const parts = input.trim().split('.')
  if (parts.length === 0 || parts.length > 3) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null
  return { major: nums[0], minor: nums[1] ?? 0, patch: nums[2] ?? 0 }
}

/** True if `version` (exact semver) satisfies `range`. Fail-closed on unparseable input. */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version)
  if (!v) return false
  const r = range.trim()
  if (r === '*' || r === '') return true

  if (r.startsWith('^')) {
    const base = parsePartial(r.slice(1))
    if (!base) return false
    return v.major === base.major && gte(v, base)
  }
  if (r.startsWith('~')) {
    const base = parsePartial(r.slice(1))
    if (!base) return false
    return v.major === base.major && v.minor === base.minor && gte(v, base)
  }
  const exact = parseVersion(r)
  if (!exact) return false
  return v.major === exact.major && v.minor === exact.minor && v.patch === exact.patch
}
