// @vitest-environment node
// Round 2c · C-1: ONE benchmark runner per process. MOCK-ONLY (fetch throws, in-memory file system, fake transport).
//
// What C-1 is and is not: it stops a runner from being created twice BY MISTAKE inside the SAME process. It does NOT stop several processes from being
// started, and it is not a spending ledger across processes: it is no way to cap total spend.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as runner from './liveRunner'
import { BenchRefusal, createBenchRunner, runBench } from './liveRunner'
import { GOOD_ENV, applyEnv, options, turnTransport } from './liveRunner.testkit'

const reset = (): void => { (runner as unknown as { __resetBenchProcessGuardForTests?: () => void }).__resetBenchProcessGuardForTests?.() }

beforeEach(() => { reset(); applyEnv(GOOD_ENV); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED — tests must not reach the network') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); applyEnv({}); reset() })

describe('C-1 · a second runner in the same process is refused before anything is touched', () => {
  it('(a) createBenchRunner twice: the second is refused BEFORE any request and BEFORE any file-system call', () => {
    const first = options()
    createBenchRunner(first.opts)
    const t = turnTransport()
    const second = options({ chat: t.chat })
    expect(() => createBenchRunner(second.opts)).toThrow(BenchRefusal)
    expect(() => createBenchRunner(second.opts)).toThrow(/already|one .* per process/i)
    expect(second.fs.ops).toEqual([]) // not even the writability probe
    expect(t.requests).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('(b) a failed PREFLIGHT does not lock the process: a valid call afterwards is accepted', () => {
    const bad = options({ confirmSpend: null })
    expect(() => createBenchRunner(bad.opts)).toThrow(BenchRefusal)
    expect(() => createBenchRunner(bad.opts)).toThrow(BenchRefusal) // still the preflight reason, not the lock
    expect(bad.fs.ops).toEqual([])
    expect(() => createBenchRunner(options().opts)).not.toThrow()
  })

  it('(c) a failed PROBE (folder not writable) does not lock the process either', () => {
    const bad = options()
    bad.fs.failOn = op => op === 'mkdirp'
    expect(() => createBenchRunner(bad.opts)).toThrow(BenchRefusal)
    expect(() => createBenchRunner(options().opts)).not.toThrow()
  })

  it('(d) an error while the runner is being built does not lock the process', () => {
    const bad = options({ now: () => { throw new Error('clock failed while building') } })
    expect(() => createBenchRunner(bad.opts)).toThrow(/clock failed/)
    expect(() => createBenchRunner(options().opts)).not.toThrow()
  })

  it('(e) runBench is held to the same limit: a second run in the process is refused and sends nothing', async () => {
    const t1 = turnTransport()
    const r1 = await runBench(options({ chat: t1.chat }).opts)
    expect(r1.valid).toBe(true)
    expect(t1.requests).toHaveLength(13)
    const t2 = turnTransport()
    const second = options({ chat: t2.chat })
    await expect(runBench(second.opts)).rejects.toBeInstanceOf(BenchRefusal)
    expect(t2.requests).toHaveLength(0)
    expect(second.fs.ops).toEqual([])
  })

  it('a runBench that was refused by the preflight leaves the process free for a valid run', async () => {
    await expect(runBench(options({ confirmSpend: null }).opts)).rejects.toBeInstanceOf(BenchRefusal)
    const t = turnTransport()
    expect((await runBench(options({ chat: t.chat }).opts)).valid).toBe(true)
  })
})

describe('C-1 · the lock is process-wide, not module-wide', () => {
  it('a second copy of the module (as a reset module registry would load) sees the lock of the first', async () => {
    createBenchRunner(options().opts)
    vi.resetModules()
    const copy = await import('./liveRunner')
    expect(copy).not.toBe(runner) // really a second instance of the module
    expect(() => copy.createBenchRunner(options().opts)).toThrow(/already/i)
  })
})

describe('C-1 · the reset exists for tests only', () => {
  it('(f) the reset function exists, is named as a test seam, and unlocks the process', () => {
    expect(typeof (runner as unknown as Record<string, unknown>).__resetBenchProcessGuardForTests).toBe('function')
    createBenchRunner(options().opts)
    expect(() => createBenchRunner(options().opts)).toThrow(BenchRefusal)
    reset()
    expect(() => createBenchRunner(options().opts)).not.toThrow()
  })

  it('(f) its body reads no environment variable and nothing outside tests refers to it', () => {
    const src = readFileSync(join(__dirname, 'liveRunner.ts'), 'utf8')
    const m = /export function __resetBenchProcessGuardForTests[^{]*\{([^}]*)\}/.exec(src)
    expect(m, 'the reset function must be a plain exported function').not.toBeNull()
    expect(m![1]).not.toMatch(/process\.env|env\[/)
    // no non-test source file (src/, scripts/) mentions it - there is no entry point through which a real run could reach it
    const hits: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.next' || name === '.git') continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx|mjs|js|cjs|json)$/.test(name)) continue
        if (/\.test\.(ts|tsx|mjs)$/.test(name) || /\.testkit\.ts$/.test(name)) continue
        if (readFileSync(p, 'utf8').includes('__resetBenchProcessGuardForTests')) hits.push(p.replace(/\\/g, '/'))
      }
    }
    const root = join(__dirname, '..', '..', '..')
    walk(join(root, 'scripts')); walk(join(root, 'src'))
    expect(hits.map(h => h.split('/').slice(-1)[0])).toEqual(['liveRunner.ts']) // only its own definition
  })
})
