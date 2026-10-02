import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { shouldBuild, BUILD_BRANCHES, onlyAndroidChanged } from './vercel-ignore.mjs'

describe('Vercel ignoreCommand (owner 30/09: Function Storage at 100%)', () => {
  it('builds only rc/web-uat and main', () => {
    expect(BUILD_BRANCHES).toEqual(['rc/web-uat', 'main'])
    expect(shouldBuild('rc/web-uat', false)).toBe(true)
    expect(shouldBuild('main', false)).toBe(true)
    for (const b of ['ios/build-rc', 'luna/prompt', 'security/medium-low', 'phase8-master', 'phase8/pay', 'android/parity', 'wip/x', 'claude/abc', 'feat/g1-growth', '', undefined]) {
      expect(shouldBuild(b, false)).toBe(false)
    }
  })
  it('keeps the old rule: a commit touching only android/ builds nothing, even on a build branch', () => {
    expect(shouldBuild('rc/web-uat', true)).toBe(false)
    expect(shouldBuild('main', true)).toBe(false)
  })
  it('unknown diff (first commit / shallow clone) still builds a build branch', () => {
    expect(shouldBuild('main', null)).toBe(true)
  })
  it('as run by Vercel: exit 0 = skip for any other branch', () => {
    const r = spawnSync(process.execPath, ['scripts/vercel-ignore.mjs'], { env: { ...process.env, VERCEL_GIT_COMMIT_REF: 'luna/experiment' }, encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/SKIP/)
  })
  it('30/09: a merge whose OTHER side is android-only still builds (it was diffed against HEAD^ and skipped)', () => {
    // Fake git: HEAD is a merge (2 parents); diff vs HEAD^ would say "android only" (exit 0).
    const git = (args: string[]) => {
      if (args[0] === 'rev-list') return 'M P1 P2\n'
      if (args[0] === 'diff') { if (args[2] === 'HEAD^') return ''; throw Object.assign(new Error('diff'), { status: 1 }) }
      return ''
    }
    expect(onlyAndroidChanged('', git)).toBeNull() // merge, no previous deploy SHA → unknown → build
    expect(shouldBuild('rc/web-uat', onlyAndroidChanged('', git))).toBe(true)
    expect(onlyAndroidChanged('PREV', git)).toBe(false) // web files changed since the last deploy → build
  })
  it('android-only since the last deploy still skips; a plain commit without a previous SHA uses HEAD^', () => {
    const ok = (parents: string) => (args: string[]) => (args[0] === 'rev-list' ? parents : '')
    expect(onlyAndroidChanged('PREV', ok('C P1\n'))).toBe(true)
    expect(onlyAndroidChanged('', ok('C P1\n'))).toBe(true)
  })
  it('the real merge 70c7cd3 (web fixes + an android-only side) builds when compared with the last deploy e7a79a9', () => {
    const real = (args: string[]) => spawnSync('git', args, { encoding: 'utf8' })
    if (real(['cat-file', '-e', '70c7cd3^{commit}']).status !== 0 || real(['cat-file', '-e', 'e7a79a9^{commit}']).status !== 0) return
    expect(real(['diff', '--quiet', 'e7a79a9', '70c7cd3', '--', '.', ':(exclude)android/']).status).toBe(1) // web changed → BUILD
    expect(real(['diff', '--quiet', '70c7cd3^', '70c7cd3', '--', '.', ':(exclude)android/']).status).toBe(0) // the old HEAD^ rule: "android only" → skipped
  })
  it('vercel.json wires it', () => {
    expect(JSON.parse(readFileSync('vercel.json', 'utf8')).ignoreCommand).toBe('node scripts/vercel-ignore.mjs')
  })
})
