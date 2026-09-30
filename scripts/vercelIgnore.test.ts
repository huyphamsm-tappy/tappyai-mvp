import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { shouldBuild, BUILD_BRANCHES } from './vercel-ignore.mjs'

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
  it('vercel.json wires it', () => {
    expect(JSON.parse(readFileSync('vercel.json', 'utf8')).ignoreCommand).toBe('node scripts/vercel-ignore.mjs')
  })
})
