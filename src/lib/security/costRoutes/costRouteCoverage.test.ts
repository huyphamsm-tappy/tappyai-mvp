// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRegistry, scanRoutes, type CostRouteDecl, type RegistryInput } from './scan'
import { ADMIN_EXCEPTIONS, COST_ROUTES, KNOWN_GAP_BUDGET } from './registry'

// SEC4 coverage ratchet (docs/phase8/SEC4-ROUTE-MATRIX.md §3). Part 1 runs the rules on the REAL tree: a new cost-bearing route without a declaration, a stale
// declaration, a declaration that no longer matches the route source, or a growing gap list fails the suite. Part 2 proves the rules themselves on a throw-away
// fixture tree (AC6), so the ratchet cannot quietly go vacuous. Nothing here changes runtime behaviour.

const REAL: RegistryInput = { entries: COST_ROUTES, adminExceptions: ADMIN_EXCEPTIONS, knownGapBudget: KNOWN_GAP_BUDGET }

describe('the real route tree matches the declarations', () => {
  const scan = scanRoutes('src')
  it('sanity: the scan sees the routes and the cost signals it is supposed to see', () => {
    expect(scan.length).toBeGreaterThan(150)
    expect(scan.find((s) => s.route === 'chat')!.signals).toEqual(expect.arrayContaining(['llm', 'serper']))
    expect(scan.find((s) => s.route === 'reviews/[id]/comments')!.limiters).toEqual(['inprocess']) // still on the in-process limiter (slice 5)
    expect(scan.find((s) => s.route === 'voice/tts')!.limiters).toEqual(['public']) // migrated in slice 2d
    expect(scan.find((s) => s.route === 'memory')!.limiters).toEqual([])
  })
  it('every cost-bearing route is declared, every declaration is true, the gap list has not grown (AC1–AC5)', () => {
    expect(checkRegistry(scan, REAL)).toEqual([])
  })
  it('every admin route that reaches a provider calls distributedRateLimit, except the one recorded exception', () => {
    const missing = scan.filter((s) => s.route.startsWith('admin/') && s.signals.length && !s.limiters.includes('distributed')).map((s) => s.route)
    expect(missing).toEqual([...ADMIN_EXCEPTIONS])
  })
  it('every known gap names a closing slice and the matrix document describes each slice', () => {
    const slices = new Set(COST_ROUTES.filter((e) => e.status === 'known-gap').map((e) => e.slice))
    expect([...slices].sort()).toEqual([3, 4, 5, 6]) // slice 2 (in-process -> shared limiter) is complete
  })
})

// ── Part 2: the rules on a fixture tree ──────────────────────────────────────────────────────────────────────────────────────────────────────
let dirs: string[] = []
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = [] })

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'sec4-'))
  dirs.push(root)
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, text)
  }
  return root
}
const decl = (o: Partial<CostRouteDecl> & { route: string }): CostRouteDecl => ({ cost: 'LLM', limiters: [], key: '-', status: 'covered', note: 'x'.repeat(50), ...o })
const reg = (entries: CostRouteDecl[], extra: Partial<RegistryInput> = {}): RegistryInput => ({ entries, adminExceptions: [], knownGapBudget: entries.filter((e) => e.status === 'known-gap').length, ...extra })

const LLM_ROUTE = "import { AI } from '@/lib/ai/llm'\nexport async function POST() { await AI.generate({}) }\n"
const LIMITED = "import { distributedRateLimit } from '@/lib/security/distributedRateLimit'\n" + LLM_ROUTE

describe('the rules (AC1–AC6) on a fixture tree', () => {
  it('detection follows imports: a route that reaches the LLM through a service file is cost-bearing', () => {
    const root = fixture({
      'app/api/a/route.ts': "import { run } from '@/lib/svc'\nexport async function GET() { await run() }\n",
      'lib/svc.ts': "import { deep } from './deep'\nexport const run = () => deep()\n",
      'lib/deep.ts': 'export const deep = () => AI.generate({})\n',
      'app/api/b/route.ts': 'export async function GET() { return 1 }\n',
    })
    const scan = scanRoutes(root)
    expect(scan.find((s) => s.route === 'a')!.signals).toEqual(['llm'])
    expect(scan.find((s) => s.route === 'b')!.signals).toEqual([])
  })

  it('AC1: a new cost-bearing route with no declaration fails, naming the route and its signals', () => {
    const root = fixture({ 'app/api/new/route.ts': LLM_ROUTE })
    const problems = checkRegistry(scanRoutes(root), reg([]))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("'new'")
    expect(problems[0]).toContain('llm')
  })

  it('AC1: a cost route that is declared passes; a non-cost route needs nothing', () => {
    const root = fixture({ 'app/api/a/route.ts': LIMITED, 'app/api/plain/route.ts': 'export const GET = () => 1\n' })
    expect(checkRegistry(scanRoutes(root), reg([decl({ route: 'a', limiters: ['distributed'] })]))).toEqual([])
  })

  it('AC1 groups: an admin cost route without distributedRateLimit fails unless recorded; a cron route without the secret fails', () => {
    const root = fixture({ 'app/api/admin/x/route.ts': LLM_ROUTE, 'app/api/cron/y/route.ts': LLM_ROUTE })
    const problems = checkRegistry(scanRoutes(root), reg([]))
    expect(problems.some((p) => p.includes("admin route 'admin/x'"))).toBe(true)
    expect(problems.some((p) => p.includes("cron route 'cron/y'"))).toBe(true)
    const ok = fixture({ 'app/api/admin/x/route.ts': LIMITED, 'app/api/cron/y/route.ts': "import { cronAuth } from '@/lib/security/cronAuth'\n" + LLM_ROUTE })
    expect(checkRegistry(scanRoutes(ok), reg([]))).toEqual([])
  })

  it('AC2: a declaration for a route that does not exist fails', () => {
    const root = fixture({ 'app/api/a/route.ts': LIMITED })
    const problems = checkRegistry(scanRoutes(root), reg([decl({ route: 'a', limiters: ['distributed'] }), decl({ route: 'ghost' })]))
    expect(problems.some((p) => p.startsWith('AC2') && p.includes("'ghost'"))).toBe(true)
  })

  it('AC3: the declared limiters must equal the limiters in the source — adding AND removing one is caught', () => {
    const root = fixture({ 'app/api/a/route.ts': LIMITED })
    const claimsNone = checkRegistry(scanRoutes(root), reg([decl({ route: 'a', limiters: [], status: 'exempt' })]))
    expect(claimsNone.some((p) => p.startsWith('AC3'))).toBe(true) // a limiter was added to the code, the declaration is stale
    const root2 = fixture({ 'app/api/a/route.ts': LLM_ROUTE })
    const claimsLimiter = checkRegistry(scanRoutes(root2), reg([decl({ route: 'a', limiters: ['distributed'] })]))
    expect(claimsLimiter.some((p) => p.startsWith('AC3'))).toBe(true) // a limiter was removed from the code, the declaration still claims it
  })

  it('AC4: covered needs a real limiter; known-gap needs a note and a slice; exempt needs a reason', () => {
    const root = fixture({ 'app/api/a/route.ts': LLM_ROUTE })
    const scan = scanRoutes(root)
    expect(checkRegistry(scan, reg([decl({ route: 'a', status: 'covered' })])).some((p) => p.startsWith('AC4') && p.includes('covered'))).toBe(true)
    expect(checkRegistry(scan, reg([decl({ route: 'a', status: 'known-gap', note: 'short' })])).some((p) => p.includes('missing control'))).toBe(true)
    expect(checkRegistry(scan, reg([decl({ route: 'a', status: 'known-gap', note: 'n'.repeat(30) })])).some((p) => p.includes('closing slice'))).toBe(true)
    expect(checkRegistry(scan, reg([decl({ route: 'a', status: 'exempt', note: 'too short' })])).some((p) => p.includes('reason'))).toBe(true)
    expect(checkRegistry(scan, reg([decl({ route: 'a', status: 'known-gap', note: 'n'.repeat(30), slice: 2 })]))).toEqual([])
  })

  it('AC5: the known-gap list cannot grow without editing the budget, and a closed gap forces the budget down', () => {
    const root = fixture({ 'app/api/a/route.ts': LLM_ROUTE, 'app/api/b/route.ts': LLM_ROUTE })
    const scan = scanRoutes(root)
    const gap = (route: string) => decl({ route, status: 'known-gap', note: 'n'.repeat(30), slice: 2 })
    expect(checkRegistry(scan, reg([gap('a'), gap('b')], { knownGapBudget: 1 })).some((p) => p.startsWith('AC5') && p.includes('exceed'))).toBe(true)
    expect(checkRegistry(scan, reg([gap('a'), decl({ route: 'b', status: 'exempt', note: 'e'.repeat(50) })], { knownGapBudget: 2 })).some((p) => p.startsWith('AC5') && p.includes('lower'))).toBe(true)
    expect(checkRegistry(scan, reg([gap('a'), gap('b')]))).toEqual([])
  })

  it('an admin exception must also be a known gap', () => {
    const root = fixture({ 'app/api/admin/x/route.ts': LLM_ROUTE })
    const problems = checkRegistry(scanRoutes(root), reg([], { adminExceptions: ['admin/x'] }))
    expect(problems.some((p) => p.includes('must also be a known-gap'))).toBe(true)
  })
})
