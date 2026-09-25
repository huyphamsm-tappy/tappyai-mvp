import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { makeGit } from './lib.mjs'
import { checkMerge } from './merge-guard.mjs'
import { checkContainment } from './branch-containment.mjs'

// Synthetic repositories for the two merge-loss guards (docs/uat/MERGE-LOSS-AUDIT.md §4). The
// real-history proofs (a6ca9f0, 1e7b77e, integration/v3-foundation) are in
// docs/uat/evidence/merge-guard-2026-09-25/; these pin each rule's pass AND fail so the guards
// cannot quietly go vacuous.

const GUARD = join(__dirname, 'merge-guard.mjs')
const DAY = 86_400_000
let root: string

function repo(name: string) {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
  const g = (args: string[], extraEnv: Record<string, string> = {}) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...env, ...extraEnv } })
  const write = (path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
  g(['init', '-q', '-b', 'main'])
  g(['config', 'commit.gpgsign', 'false'])
  return { dir, g, write, read: (p: string) => readFileSync(join(dir, p), 'utf8') }
}

const APP = (a: string, b: string) => [
  'export function screen() {',
  '  const header = renderHeaderSection()',
  a,
  '  const middle = renderMiddleSection()',
  '  const spacer1 = renderSpacerOne()',
  '  const spacer2 = renderSpacerTwo()',
  '  const spacer3 = renderSpacerThree()',
  b,
  '  return composeEverything(header, middle)',
  '}',
  '',
].join('\n')

beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'merge-guard-')) })
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('merge-guard', () => {
  function setup(name: string) {
    const r = repo(name)
    r.write('src/app/Screen.kt', APP('  // slot A', '  // slot B'))
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'base'])
    r.g(['checkout', '-q', '-b', 'side'])
    r.write('src/app/Screen.kt', APP('  TripPlanCard(plan, planJson = message.planJson)', '  // slot B'))
    r.write('supabase/migrations/20260915b_private.sql', 'CREATE POLICY own ON t FOR SELECT USING (auth.uid() = user_id);\n')
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'side: wiring + privacy migration'])
    r.g(['checkout', '-q', 'main'])
    r.write('src/app/Screen.kt', APP('  // slot A', '  val placeCards = computePlaceCards(message)'))
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'main: other region'])
    return r
  }
  const mergeWith = (r: ReturnType<typeof repo>, message: string, mutate: () => void) => {
    r.g(['merge', '-q', '--no-ff', '--no-commit', 'side'])
    mutate()
    r.g(['add', '-A'])
    r.g(['commit', '-q', '-m', message])
    const head = r.g(['rev-parse', 'HEAD']).trim()
    const parents = r.g(['rev-list', '--parents', '-n', '1', head]).trim().split(' ').slice(1)
    return checkMerge(makeGit(r.dir), { label: 't', parents, result: `${head}^{tree}`, message: r.g(['log', '-1', '--format=%B', head]) })
  }

  it('an honest merge is clean', () => {
    const r = setup('honest')
    const res = mergeWith(r, 'merge side', () => {})
    expect(res.findings).toEqual([])
  })

  it('R1 (a6ca9f0 shape): a line git merged cleanly and the resolution dropped is a finding', () => {
    const r = setup('evil')
    const res = mergeWith(r, 'merge side', () => r.write('src/app/Screen.kt', APP('  // slot A', '  val placeCards = computePlaceCards(message)')))
    const f = res.findings.find((x: { rule: string }) => x.rule === 'R1')
    expect(f?.path).toBe('src/app/Screen.kt')
    expect(f?.lines).toContain('TripPlanCard(plan, planJson = message.planJson)')
  })

  it('R2 (1e7b77e shape): a file one side ADDED, deleted in the result, is a protected finding', () => {
    const r = setup('parked')
    const res = mergeWith(r, 'merge side, parking the profile set', () => rmSync(join(r.dir, 'supabase/migrations/20260915b_private.sql')))
    const f = res.findings.find((x: { rule: string }) => x.rule === 'R2')
    expect(f).toMatchObject({ path: 'supabase/migrations/20260915b_private.sql', protected: true })
  })

  it('a Merge-Drop trailer waives exactly that path — still reported, not failing', () => {
    const r = setup('declared')
    const res = mergeWith(r, 'merge side\n\nMerge-Drop: supabase/migrations/20260915b_private.sql — parked with profile v2, owner 2026-09-18', () => rmSync(join(r.dir, 'supabase/migrations/20260915b_private.sql')))
    expect(res.findings).toEqual([])
    expect(res.waived[0].waivedBy).toContain('parked with profile v2')
  })

  it('--staged checks an in-progress merge before it is committed (exit 1), and a clean one passes (exit 0)', () => {
    const bad = setup('staged-bad')
    bad.g(['merge', '-q', '--no-ff', '--no-commit', 'side'])
    bad.write('src/app/Screen.kt', APP('  // slot A', '  val placeCards = computePlaceCards(message)'))
    bad.g(['add', '-A'])
    const out = spawnSync(process.execPath, [GUARD, '--staged', '--repo', bad.dir], { encoding: 'utf8' })
    expect(out.status).toBe(1)
    expect(out.stdout).toContain('TripPlanCard(plan, planJson = message.planJson)')

    const good = setup('staged-good')
    good.g(['merge', '-q', '--no-ff', '--no-commit', 'side'])
    const ok = spawnSync(process.execPath, [GUARD, '--staged', '--repo', good.dir], { encoding: 'utf8' })
    expect(ok.status).toBe(0)
  }, 20_000)

  it('--staged --message reads the waiver from the message being committed (the commit-msg hook path)', () => {
    const r = setup('staged-msg')
    r.g(['merge', '-q', '--no-ff', '--no-commit', 'side'])
    r.write('src/app/Screen.kt', APP('  // slot A', '  val placeCards = computePlaceCards(message)'))
    r.g(['add', '-A'])
    const msg = join(r.dir, 'COMMIT_EDITMSG.test')
    writeFileSync(msg, 'Merge side\n\nMerge-Drop: src/app/Screen.kt — plan card moved to its own screen\n')
    const out = spawnSync(process.execPath, [GUARD, '--staged', '--message', msg, '--repo', r.dir], { encoding: 'utf8' })
    expect(out.status).toBe(0)
    expect(out.stdout).toContain('waived')
  }, 20_000)
})

describe('branch-containment', () => {
  const NOW = Date.parse('2026-09-24T12:00:00Z')
  const dated = (days: number) => new Date(NOW - days * DAY).toISOString()

  function setup(name: string) {
    const r = repo(name)
    r.write('src/app/page.ts', 'export const page = 1\n')
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'base'], { GIT_COMMITTER_DATE: dated(30), GIT_AUTHOR_DATE: dated(30) })
    r.g(['checkout', '-q', '-b', 'integration/v3-foundation'])
    r.write('supabase/migrations/20260904_group_read_boundary.sql', [
      'DROP POLICY IF EXISTS "Anyone can read groups" ON public.groups;',
      'CREATE POLICY groups_select_participant ON public.groups',
      '  FOR SELECT TO authenticated',
      '  USING (public.fn_group_participant(id));',
      '',
    ].join('\n'))
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'fix(security): group membership was readable'], { GIT_COMMITTER_DATE: dated(21), GIT_AUTHOR_DATE: dated(21) })
    r.g(['checkout', '-q', 'main'])
    r.write('src/app/other.ts', 'export const other = 2\n')
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'unrelated work on main'], { GIT_COMMITTER_DATE: dated(10), GIT_AUTHOR_DATE: dated(10) })
    return r
  }

  it('F-065 shape: a security migration stranded on a side branch past N days is a finding', () => {
    const r = setup('stranded')
    const res = checkContainment(makeGit(r.dir), { ship: 'main', days: 7, now: NOW })
    expect(res).toHaveLength(1)
    expect(res[0].branch).toBe('integration/v3-foundation')
    expect(res[0].findings[0].files[0]).toMatchObject({ path: 'supabase/migrations/20260904_group_read_boundary.sql', fileOnShip: false })
    expect(res[0].allowedBy).toBeNull()
  })

  it('younger than N days is not yet a finding', () => {
    const r = setup('young')
    expect(checkContainment(makeGit(r.dir), { ship: 'main', days: 30, now: NOW })).toEqual([])
  })

  it('an allow entry records the decision (with expiry) instead of failing; an expired one fails again', () => {
    const r = setup('allowed')
    const allow = [{ branch: '^integration/v3-foundation$', reason: 'parked by owner', until: '2026-10-01' }]
    expect(checkContainment(makeGit(r.dir), { ship: 'main', days: 7, now: NOW, allow })[0].allowedBy).toContain('parked by owner')
    const expired = [{ ...allow[0], until: '2026-09-01' }]
    expect(checkContainment(makeGit(r.dir), { ship: 'main', days: 7, now: NOW, allow: expired })[0].allowedBy).toBeNull()
  })

  it('content that reached the shipping branch by a cherry-pick WITH edits counts as reached', () => {
    const r = setup('picked')
    r.write('supabase/migrations/20260904_group_read_boundary.sql', [
      '-- re-applied on the shipping branch, with a comment of its own',
      'DROP POLICY IF EXISTS "Anyone can read groups" ON public.groups;',
      'CREATE POLICY groups_select_participant ON public.groups',
      '  FOR SELECT TO authenticated',
      '  USING (public.fn_group_participant(id));',
      '',
    ].join('\n'))
    r.g(['add', '.']); r.g(['commit', '-q', '-m', 'fix(security): restore the group read boundary'], { GIT_COMMITTER_DATE: dated(1), GIT_AUTHOR_DATE: dated(1) })
    expect(checkContainment(makeGit(r.dir), { ship: 'main', days: 7, now: NOW })).toEqual([])
  })
})
