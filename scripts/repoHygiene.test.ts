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
