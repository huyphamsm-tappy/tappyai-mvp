// @vitest-environment node
// Round 2g · D1/D3: the launcher of the live trial. MOCK-ONLY: the "child" is a tiny `node -e` script (no vitest, no network, no key); nothing is requested.
// The fake keys are recognisable values set only in the env object passed in.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BENCH_FLAG_NAMES } from './liveRunner'
import {
  FLAG_ENV_NAMES, listDescendants, REFUSED_BEGIN, REFUSED_END, SUMMARY_BEGIN, SUMMARY_END, SYSTEM_ENV_NAMES, TRIAL_ENV_NAMES, buildChildEnv, extractBlock, isAlive, killTree, launcherRefusals, marker, redactText, runLauncher, runTrialChild,
} from './liveTrialLauncher.mjs'

const KEY_OPENAI = 'sk-test-SECRET-123', KEY_SERPER = 'serper-SECRET-456'
const N = 'n0nce0123456789abcdef0123456789ab'
const SB = marker(SUMMARY_BEGIN, N), SE = marker(SUMMARY_END, N), RB = marker(REFUSED_BEGIN, N), RE = marker(REFUSED_END, N)
const ENV = { OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER, PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } as Record<string, string | undefined>
const SYS = { PATH: ENV.PATH, SystemRoot: ENV.SystemRoot } as never
const node = (script: string) => ({ file: process.execPath, args: ['-e', script] })
const common = { nonce: N, graceMs: 200, timeLimitMs: 20_000, writeFile: () => {}, makeDir: () => {} }

describe('the allow-list of the child environment', () => {
  it('FLAG_ENV_NAMES equals BENCH_FLAG_NAMES (a flag added to the runner must be added to the launcher)', () => {
    expect([...FLAG_ENV_NAMES].sort()).toEqual([...BENCH_FLAG_NAMES].sort())
  })
  it('only allow-listed names are passed; proxies, NODE_OPTIONS, CI, TLS switches, KV/Upstash and unknown names are dropped', () => {
    const env = buildChildEnv({
      OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER, PATH: 'p', SystemRoot: 'r', BENCH_SPEND_GATE: '1', CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1',
      HTTPS_PROXY: 'http://p', https_proxy: 'http://p', HTTP_PROXY: 'http://p', ALL_PROXY: 'x', NO_PROXY: 'y', NODE_OPTIONS: '--use-env-proxy', NODE_USE_ENV_PROXY: '1',
      NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_EXTRA_CA_CERTS: 'x', CI: 'true', KV_REST_API_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't', SOMETHING_ELSE: 'z', BENCH_LIVE_TRIAL: 'whatever',
    }, { confirm: true, nonce: N })
    expect(Object.keys(env).sort()).toEqual(['BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_LIVE_TRIAL', 'BENCH_SPEND_GATE', 'BENCH_TRIAL_ISOLATED', 'CONSULTATIVE_V1', 'OPENAI_API_KEY', 'PATH', 'SERPER_API_KEY', 'SystemRoot'])
    for (const bad of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'NODE_OPTIONS', 'NODE_USE_ENV_PROXY', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'CI', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SOMETHING_ELSE']) expect(env, bad).not.toHaveProperty(bad)
  })
  it('the confirmation is set by the launcher for the child only, with the exact text; the parent value is never copied; plumbing mode sets none; the isolation marker is the nonce', () => {
    expect(buildChildEnv({ BENCH_LIVE_TRIAL: 'parent' }, { confirm: true, nonce: N }).BENCH_LIVE_TRIAL).toBe('I-UNDERSTAND-THIS-SPENDS-REAL-MONEY')
    expect(buildChildEnv({ BENCH_LIVE_TRIAL: 'parent' }, { confirm: false, nonce: N })).not.toHaveProperty('BENCH_LIVE_TRIAL')
    expect(buildChildEnv({ BENCH_TRIAL_ISOLATED: '1' }, { confirm: false, nonce: N }).BENCH_TRIAL_ISOLATED).toBe(N)
  })
  it('the names lists have no proxy/NODE_* name and no CI', () => {
    for (const n of [...SYSTEM_ENV_NAMES, ...TRIAL_ENV_NAMES, ...FLAG_ENV_NAMES]) expect(n).not.toMatch(/PROXY|^NODE_|^CI$/i)
  })
  it('the launcher refuses by itself when CI, BENCH_LIVE_TRIAL or BENCH_TRIAL_ISOLATED is set in the shell', () => {
    expect(launcherRefusals({})).toEqual([])
    expect(launcherRefusals({ CI: '1' }).join(' ')).toMatch(/CI/)
    expect(launcherRefusals({ BENCH_LIVE_TRIAL: 'x' }).join(' ')).toMatch(/BENCH_LIVE_TRIAL/)
    expect(launcherRefusals({ BENCH_TRIAL_ISOLATED: '1' }).join(' ')).toMatch(/BENCH_TRIAL_ISOLATED/)
  })
  it('review: a variable that LOOKS like a setting of the trial/route but is not passed on is refused by name, never silently dropped; the allowed ones and harmless names are not', () => {
    const t = launcherRefusals({ CONSULT_TOP3: '1', FILM_SEARCH: '0', TAPPY_UAT_X: '1', LLM_FOO: 'x', consult_reveal: '1', OPENAI_ORG_ID: 'x' }).join(' | ')
    for (const n of ['CONSULT_TOP3', 'FILM_SEARCH', 'TAPPY_UAT_X', 'LLM_FOO', 'consult_reveal', 'OPENAI_ORG_ID']) expect(t).toContain(n)
    expect(launcherRefusals({ CONSULT_V2: '1', BENCH_EXPECT_CONSULT_V2: '1', OPENAI_API_KEY: 'x', LLM_LUNA_MODEL: 'gpt-6-luna', SOMETHING_ELSE: '1', PATH: 'p' })).toEqual([])
    expect(t).not.toContain('=') // names only
  })
})

describe('redaction and block extraction', () => {
  it('redactText removes both fake keys (any case) and sk- shapes, nothing else', () => {
    const t = redactText(`a ${KEY_OPENAI} b ${KEY_SERPER.toUpperCase()} c sk-proj-ABCD**** d ok`, ENV)
    expect(t).not.toMatch(/secret/i); expect(t).not.toContain('sk-proj-ABCD'); expect(t).toContain('a ***'); expect(t).toContain('d ok')
  })
  it('extractBlock returns the LAST complete block, or null', () => {
    expect(extractBlock(`x\n${SB}\nold\n${SE}\n${SB}\nnew line\nsecond\n${SE}\ny`, SB, SE)).toBe('new line\nsecond')
    expect(extractBlock(`${SB}\nno end`, SB, SE)).toBeNull()
    expect(extractBlock('nothing', SB, SE)).toBeNull()
  })
  it('review: markers carry the run nonce, so text that only prints the plain markers cannot forge a block or trigger the early kill', () => {
    expect(SB).toContain(N); expect(marker(SUMMARY_BEGIN, 'other')).not.toBe(SB)
    expect(extractBlock('<<TRIAL-SUMMARY-BEGIN>>\nturnOk=true\n<<TRIAL-SUMMARY-END>>', SB, SE)).toBeNull()
    expect(extractBlock(`${marker(SUMMARY_BEGIN, 'guess')}\nturnOk=true trialClean=true\n${marker(SUMMARY_END, 'guess')}`, SB, SE)).toBeNull()
  })
})

describe('D1 · the child process is really ended, with its tree, and its output is not shown', () => {
  const printed = (): { lines: string[]; print: (s: string) => void } => { const lines: string[] = []; return { lines, print: s => lines.push(s) } }

  it('a child that prints a summary and then keeps running (a stand-in for background work) is killed after the summary; the launcher verifies it is gone', async () => {
    const script = `
      console.log('noise before ${KEY_OPENAI}');
      console.error('provider said ${KEY_SERPER}');
      console.log('${SB}\\nturnOk=true trialClean=true key=${KEY_OPENAI}\\n${SE}');
      setInterval(() => {}, 1000); // never ends by itself
    `
    const { lines, print } = printed()
    const code = await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(script), ...common })
    const out = lines.join('\n')
    expect(out).toContain('turnOk=true trialClean=true')
    expect(out).not.toMatch(/secret/i) // the summary was printed, the keys were removed
    expect(out).not.toContain('noise before'); expect(out).not.toContain('provider said') // the rest of the child's output is never shown
    expect(out).toMatch(/child process: ended \(ended by the launcher: after-summary\)/)
    expect(code).toBe(0)
  }, 30_000)

  it('the killed process is really gone: runTrialChild reports stillAlive=false and the pid no longer answers', async () => {
    const res = await runTrialChild({ child: node(`console.log('${SE}'); setInterval(() => {}, 1000)`), cwd: process.cwd(), env: SYS, endMarkers: [SE], graceMs: 100, timeLimitMs: 20_000 })
    expect(res.killedBy).toBe('after-summary')
    expect(res.stillAlive).toBe(false)
    expect(isAlive(res.pid!)).toBe(false)
  }, 30_000)

  it('review: the WHOLE TREE is ended, a grandchild included (the child starts a grandchild that keeps running, prints its pid, and the launcher ends both)', async () => {
    const script = `
      const { spawn } = require('node:child_process');
      const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
      console.log('GRANDCHILD=' + g.pid);
      console.log('${SE}');
      setInterval(() => {}, 1000);
    `
    const res = await runTrialChild({ child: node(script), cwd: process.cwd(), env: SYS, endMarkers: [SE], graceMs: 300, timeLimitMs: 20_000 })
    const gc = Number(/GRANDCHILD=(\d+)/.exec(res.text)?.[1])
    expect(gc).toBeGreaterThan(0)
    await new Promise(r => setTimeout(r, 500))
    try {
      expect(isAlive(res.pid!)).toBe(false)
      expect(isAlive(gc), 'the grandchild must be ended with the tree').toBe(false)
      expect(res.pipesOpen).toBe(false)
      expect(res.survivors).toEqual([]) // everything seen in the tree before it was ended is gone
    } finally { if (isAlive(gc)) killTree(gc) }
  }, 30_000)

  it.skipIf(process.platform !== 'win32')('review: a child that EXITS BY ITSELF and leaves a grandchild running: the launcher finds it (Windows keeps the parent id of an orphan), reports its pid, does NOT kill by a pid that no longer belongs to a live parent, does not hang, and exits with 3', async () => {
    const script = `
      const { spawn } = require('node:child_process');
      const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
      g.unref();
      console.log('GRANDCHILD=' + g.pid);
      setTimeout(() => process.exit(0), 300);
    `
    const { lines, print } = printed()
    let gcText = ''
    const run = async (a: Parameters<typeof runTrialChild>[0]) => { const r = await runTrialChild(a); gcText = r.text; return r }
    const t0 = Date.now()
    const code = await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(script), ...common, run })
    const gc = Number(/GRANDCHILD=(\d+)/.exec(gcText)?.[1])
    try {
      expect(Date.now() - t0).toBeLessThan(25_000) // did not hang
      expect(lines.join('\n')).toMatch(new RegExp(`STILL RUNNING \\(pid [^)]*${gc}`))
      expect(code).toBe(3)
      expect(isAlive(gc)).toBe(true) // it was NOT killed by the launcher: the Owner is told instead
    } finally { if (gc && isAlive(gc)) killTree(gc) }
  }, 60_000)

  it('review: listDescendants returns pid AND image name, ignores processes created before `sinceMs` (a reused pid with a stale parent id cannot match), and cannot loop', async () => {
    const { spawn } = await import('node:child_process')
    const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true })
    try {
      await new Promise(r => setTimeout(r, 300))
      const all = listDescendants(process.pid, Date.now() - 60_000)
      const mine = all.find(d => d.pid === kid.pid)
      expect(mine, 'the child created after sinceMs is listed').toBeTruthy()
      expect(mine!.name).toMatch(/node/i)
      if (process.platform === 'win32') expect(listDescendants(process.pid, Date.now() + 60_000), 'created BEFORE sinceMs: not listed').toEqual([]) // (the creation-time filter exists on Windows only)
    } finally { kid.kill() }
  }, 60_000)

  it('review: a survivor that is merely slow to go away is not reported (it is polled for up to 2 s); one that stays is reported WITH its name', async () => {
    let calls = 0
    const slow = await runTrialChild({ child: node(`console.log('${SE}')`), cwd: process.cwd(), env: SYS, endMarkers: [SE], graceMs: 5_000, timeLimitMs: 20_000, descendants: () => [{ pid: 2_000_000_001, name: 'esbuild.exe' }], alive: (p: number) => (p === 2_000_000_001 ? ++calls < 3 : isAlive(p)) })
    expect(slow.survivors).toEqual([])
    const stays = await runTrialChild({ child: node(`console.log('${SE}')`), cwd: process.cwd(), env: SYS, endMarkers: [SE], graceMs: 5_000, timeLimitMs: 20_000, descendants: () => [{ pid: 2_000_000_002, name: 'esbuild.exe' }], alive: (p: number) => (p === 2_000_000_002 ? true : isAlive(p)) })
    expect(stays.survivors).toEqual([2_000_000_002]); expect(stays.survivorNames).toEqual({ 2_000_000_002: 'esbuild.exe' })
    const { lines, print } = printed()
    await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(`console.log('${SB}\\nturnOk=true trialClean=true\\n${SE}')`), ...common, graceMs: 5_000, run: async a => ({ ...(await runTrialChild(a)), survivors: [2_000_000_002], survivorNames: { 2_000_000_002: 'esbuild.exe' } }) })
    expect(lines.join('\n')).toMatch(/STILL RUNNING \(pid 2000000002 esbuild\.exe\)/)
  }, 60_000)

  it('a child that never prints a summary is ended at the time limit', async () => {
    const res = await runTrialChild({ child: node('setInterval(() => {}, 1000)'), cwd: process.cwd(), env: SYS, endMarkers: [SE], graceMs: 100, timeLimitMs: 600 })
    expect(res.killedBy).toBe('time-limit')
    expect(res.stillAlive).toBe(false)
  }, 30_000)

  it('a child that ends by itself is not killed (no pid is killed after it has exited)', async () => {
    let killed = false
    const res = await runTrialChild({ child: node(`console.log('${SB}\\nx\\n${SE}')`), cwd: process.cwd(), env: SYS, endMarkers: [SE], graceMs: 5_000, timeLimitMs: 20_000, kill: () => { killed = true } })
    expect(res.exitCode).toBe(0)
    expect(res.killedBy).toBeNull()
    expect(res.stillAlive).toBe(false)
    expect(killed).toBe(false)
  }, 30_000)

  it('review: text that only prints the PLAIN markers (no nonce) does not trigger the early kill and does not become a summary; the exit code is not 0', async () => {
    const { lines, print } = printed()
    const code = await runLauncher({
      env: { ...ENV }, repoRoot: process.cwd(), print, ...common,
      child: node(`console.log('<<TRIAL-SUMMARY-BEGIN>>\\nturnOk=true trialClean=true\\n<<TRIAL-SUMMARY-END>>'); console.log('<<TRIAL-SUMMARY-END:guess>>')`),
    })
    expect(lines.join('\n')).not.toContain('turnOk=true')
    expect(lines.join('\n')).toMatch(/NO TRIAL SUMMARY was produced/)
    expect(code).toBe(1)
  }, 30_000)

  it('a child that fails without a summary: one fixed line is printed, the child output (with a key in it) is not', async () => {
    const { lines, print } = printed()
    const code = await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(`console.error('stack trace with ${KEY_OPENAI}'); process.exit(1)`), ...common })
    const out = lines.join('\n')
    expect(out).toMatch(/NO TRIAL SUMMARY was produced \(child exit code 1/)
    expect(out).not.toMatch(/secret|stack trace/i)
    expect(code).toBe(1)
  }, 30_000)

  it('a refused block is printed (reasons name variables only) and the exit code is not 0', async () => {
    const { lines, print } = printed()
    const code = await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(`console.log('${RB}\\nBENCH_EXPECT_CONSULT_V2 is not set\\n${RE}')`), ...common })
    expect(lines.join('\n')).toMatch(/REFUSED \(nothing was sent\):\nBENCH_EXPECT_CONSULT_V2 is not set/)
    expect(code).toBe(1)
  }, 30_000)

  it('NOT CLEAN in the summary is never exit 0; neither is a summary without an explicit trialClean=true', async () => {
    const { print } = printed()
    expect(await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(`console.log('${SB}\\nturnOk=true trialClean=false\\nNOT CLEAN: blocked x\\n${SE}')`), ...common })).toBe(1)
    expect(await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(`console.log('${SB}\\nturnOk=true\\n${SE}')`), ...common })).toBe(1)
  }, 30_000)

  it('the redacted copy of the whole output is what is written to disk (never a key), only for a results folder on drive D, and never in a plumbing check', async () => {
    const written: Array<[string, string]> = []
    const { lines, print } = printed()
    const c = { ...common, writeFile: (p: string, t: string) => { written.push([p, t]) } }
    await runLauncher({ env: { ...ENV, BENCH_TRIAL_OUT_DIR: 'D:/fake-results' }, repoRoot: process.cwd(), print, child: node(`console.error('raw ${KEY_OPENAI}'); console.log('${SB}\\nturnOk=true\\n${SE}')`), ...c })
    expect(written).toHaveLength(1)
    expect(written[0][0].replace(/\\/g, '/')).toMatch(/^D:\/fake-results\/child-output-redacted-\d+\.txt$/)
    expect(written[0][1]).toContain('raw ***'); expect(written[0][1]).not.toMatch(/secret/i)
    expect(lines.join('\n')).toMatch(/redacted copy of the child output/)
    for (const dir of ['relative/dir', 'C:/Users/Admin/out', 'E:/other']) {
      const none: Array<[string, string]> = []
      await runLauncher({ env: { ...ENV, BENCH_TRIAL_OUT_DIR: dir }, repoRoot: process.cwd(), print, child: node('1'), ...common, writeFile: (p: string, t: string) => { none.push([p, t]) } })
      expect(none, dir).toEqual([])
    }
    const plumbing: Array<[string, string]> = []
    await runLauncher({ env: { ...ENV, BENCH_TRIAL_OUT_DIR: 'D:/fake-results' }, repoRoot: process.cwd(), print, plumbingCheck: true, child: node('1'), ...common, writeFile: (p: string, t: string) => { plumbing.push([p, t]) } })
    expect(plumbing).toEqual([])
  }, 60_000)

  it('the launcher refuses by itself (and starts nothing) when BENCH_LIVE_TRIAL is already set in the shell', async () => {
    const { lines, print } = printed()
    let started = false
    const code = await runLauncher({ env: { ...ENV, BENCH_LIVE_TRIAL: 'x' }, repoRoot: process.cwd(), print, run: async () => { started = true; return { text: '', truncated: false, exitCode: 0, killedBy: null, stillAlive: false, pipesOpen: false, pid: 1, ms: 0 } } })
    expect(code).toBe(2); expect(started).toBe(false)
    expect(lines.join('\n')).toMatch(/BENCH_LIVE_TRIAL is set in this shell/)
  })

  it('review: a variable that looks like a setting but is not passed on stops the launcher before the child starts', async () => {
    const { lines, print } = printed()
    let started = false
    const code = await runLauncher({ env: { ...ENV, CONSULT_TOP3: '1' }, repoRoot: process.cwd(), print, run: async () => { started = true; throw new Error('must not start') } })
    expect(code).toBe(2); expect(started).toBe(false)
    expect(lines.join('\n')).toContain('CONSULT_TOP3')
  })

  it('the check itself works: if the kill does nothing the launcher reports STILL ALIVE and exits with 3 (the test then ends the stand-in by hand)', async () => {
    const { lines, print } = printed()
    let pid = 0
    const run = async (a: Parameters<typeof runTrialChild>[0]) => { const r = await runTrialChild({ ...a, kill: () => {} }); pid = r.pid!; return r }
    try {
      const code = await runLauncher({ env: { ...ENV }, repoRoot: process.cwd(), print, child: node(`console.log('${SB}\\nturnOk=true\\n${SE}'); setInterval(() => {}, 1000)`), ...common, graceMs: 100, timeLimitMs: 800, run })
      expect(lines.join('\n')).toMatch(/STILL ALIVE/)
      expect(code).toBe(3)
    } finally { if (pid) killTree(pid) }
    await new Promise(r => setTimeout(r, 300))
    expect(isAlive(pid)).toBe(false)
  }, 30_000)

  it('the output is decoded as UTF-8 text (multi-byte characters are not split between chunks)', async () => {
    const res = await runTrialChild({ child: node(`process.stdout.write(Buffer.from('${'ệ'.repeat(5)}').subarray(0, 2)); setTimeout(() => { process.stdout.write(Buffer.from('${'ệ'.repeat(5)}').subarray(2)); }, 150)`), cwd: process.cwd(), env: SYS, graceMs: 100, timeLimitMs: 20_000 })
    expect(res.text).toBe('ệ'.repeat(5))
  }, 30_000)

  it('killTree on a pid that is already gone does not throw', () => {
    expect(() => killTree(2_000_000_000)).not.toThrow()
  })
})

describe('the CLI is not run when the module is imported, and the real trial file only runs inside the launcher', () => {
  it('importing the launcher spawned nothing; the entry-point guard compares the real paths (case-insensitively on Windows)', () => {
    const src = readFileSync(join(__dirname, 'liveTrialLauncher.mjs'), 'utf8')
    expect(src).toMatch(/import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/)
    expect(src).toMatch(/realpathSync/)
  })
})
