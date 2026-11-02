import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

// Repo hygiene gate (owner 01/10). A `git add -A` once committed a UAT runtime-log dump (.uatlogs.jsonl), replay outputs (.d7*) and
// 283 new Serper recordings. This runs in the Regression Gate: scratch files at the repo root, or any log/jsonl/out file there,
// fail the build. Recordings are legitimate only as a deliberate, reviewed addition (see the cap below).

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean)

// Root-level dotfiles that are real project config.
const ROOT_DOTFILES = new Set(['.env.local.example', '.eslintrc.json', '.gitattributes', '.gitignore', '.vercelignore'])

describe('no scratch files are committed', () => {
  it('root-level dotfiles are only the known config files', () => {
    const stray = tracked.filter(f => /^\.[^/]+$/.test(f) && !ROOT_DOTFILES.has(f))
    expect(stray).toEqual([])
  })
  it('no log / jsonl / out / numstat dump sits at the repo root', () => {
    const stray = tracked.filter(f => /^[^/]+\.(log|jsonl|out)$/.test(f) || /^[^/]*(numstat|compare)[^/]*\.(txt|json)$/.test(f))
    expect(stray).toEqual([])
  })
  it('replay outputs are never tracked (scripts/consult/replay/out is generated)', () => {
    expect(tracked.filter(f => f.startsWith('scripts/consult/replay/out/'))).toEqual([])
  })
  it('the replay recording set does not grow by accident (a deliberate addition raises this number in the same commit)', () => {
    const n = tracked.filter(f => f.startsWith('scripts/consult/replay/recordings/')).length
    expect(n).toBeLessThanOrEqual(2008)
  })
})

// Personal data in audit captures (owner 02/10). A UAT capture once committed the owner's real GPS fix (docs/audit/uat/2026-09-20/gps-proof.json,
// removed). Captures of runs (location, phone numbers, Google Places rows) belong in the private evidence bucket, not in git.
import { readFileSync, statSync } from 'node:fs'
describe('audit captures carry no new personal data', () => {
  it('nothing under docs/audit/uat/ is tracked (the folder is ignored)', () => {
    expect(tracked.filter(f => f.startsWith('docs/audit/uat/'))).toEqual([])
  })
  it('the number of tracked audit/evidence files that hold a coordinate with 3+ decimals only goes DOWN (ratchet; 02/10 = 20)', () => {
    const re = /"(?:lat|latitude)": *-?\d+\.\d{3,}/
    let n = 0
    for (const f of tracked) {
      if (!(f.startsWith('docs/audit/') || f.startsWith('docs/uat/evidence/'))) continue
      if (!/\.(json|jsonl|txt|stdout|md)$/.test(f)) continue
      try { if (statSync(f).size > 8_000_000) continue; if (re.test(readFileSync(f, 'utf8'))) n++ } catch { /* deleted in the working tree */ }
    }
    expect(n).toBeLessThanOrEqual(20)
  })
})
