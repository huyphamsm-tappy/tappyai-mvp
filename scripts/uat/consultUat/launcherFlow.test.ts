// @vitest-environment node
// Round 3f · Việc 3 and 4: the launcher's real flow with a FAKE child (no vitest, no network, no key). The keys below are fake and shaped like
// nothing real. Tests check: keys never reach argv, this process's env, printed output, or a redacted file; hidden input shows nothing; Gate 1
// accepts only the exact line and only from a terminal; a failing preflight never reaches Gate 1 or a real child.
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { askLine, buildChildEnv, GATE1_LINE, gate1Summary, launcherRefusals, marker, PREFLIGHT_BEGIN, PREFLIGHT_END, readHidden, redactText, runFlow, runLauncher, SUMMARY_BEGIN, SUMMARY_END } from './liveTrialLauncher.mjs'

const KEY_OPENAI = 'sk-test-SECRET-123'
const KEY_SERPER = 'serper-SECRET-456'
const BASE = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.10',
  BENCH_TRIAL_QUESTION_FILE: 'D:/TappyAI-review-artifacts/consultative-round3d/dev-probe.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-round3e/trial-results',
  CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULT_V2: '1', PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '',
}
const QUESTIONS = 'D8|D8|1|giá vàng SJC\nD2|D2|1|pin xe máy điện\n'
const N1 = '0123456789abcdef0123456789abcdef'
const N2 = 'fedcba9876543210fedcba9876543210'

/** A fake child runner: records every call (spec, env) and answers with a preflight block (`pf`) or a summary block (`sm`), built with the child's own nonce. */
function fakeRun(answers: { pf?: string; sm?: string }, calls: Array<{ env: Record<string, string>; args: string[] }>) {
  // the fake has the shape of the launcher's runner; the cast keeps its declared type (the real one takes more options) out of the way
  return (async ({ child, env }: { child: { args: string[] }; env: Record<string, string> }) => {
    calls.push({ env, args: child.args })
    const n = env.BENCH_TRIAL_ISOLATED
    const isPre = env.BENCH_TRIAL_PREFLIGHT_ONLY === '1'
    const text = isPre
      ? `${marker(PREFLIGHT_BEGIN, n)}\n${answers.pf ?? 'TỔNG: mọi điều kiện ĐẠT (preflight-only; không có request nào được gửi)'}\n${marker(PREFLIGHT_END, n)}`
      : `${marker(SUMMARY_BEGIN, n)}\n${answers.sm ?? 'turnOk=true runValid=false benchmarkEligible=false trialClean=true'}\n${marker(SUMMARY_END, n)}`
    return { text, truncated: false, exitCode: 0, killedBy: null, stillAlive: false, pipesOpen: false, pid: 1, ms: 1 }
  }) as never
}

const trace = () => { const lines: string[] = []; return { lines, print: (s: string) => lines.push(s) } }
const allOutput = (lines: string[]) => lines.join('\n')

describe('Gate 1: the typed line is exact, and only a terminal can give it', () => {
  it('a non-terminal stdin refuses the real run: the preflight child ran, the real child did not', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    const t = trace()
    const code = await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: t.print, run: fakeRun({}, calls), stdinIsTTY: false, askGate1: async () => GATE1_LINE })
    expect(code).toBe(2)
    expect(calls.length).toBe(1)
    expect(calls[0].env.BENCH_TRIAL_PREFLIGHT_ONLY).toBe('1')
    expect(allOutput(t.lines)).toMatch(/Gate 1 needs an interactive terminal/)
  })
  for (const wrong of ['', 'chạy lượt đo d8 d2 trần 0.10', 'CHẠY LƯỢT ĐO D8 D2 TRẦN 0.1', 'CHẠY LƯỢT ĐO D8 D2 TRẦN 0.10 ', 'yes']) {
    it(`the line "${wrong}" is refused: no real child is started`, async () => {
      const calls: Array<{ env: Record<string, string>; args: string[] }> = []
      const t = trace()
      const code = await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: t.print, run: fakeRun({}, calls), stdinIsTTY: true, askGate1: async () => wrong })
      expect(code).toBe(1)
      expect(calls.length).toBe(1) // only the preflight child
      expect(calls.some(c => c.env.BENCH_TRIAL_PREFLIGHT_ONLY !== '1')).toBe(false)
    })
  }
  it('the exact line lets the flow reach the real child (the second child, not preflight)', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    const t = trace()
    const code = await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: t.print, run: fakeRun({}, calls), stdinIsTTY: true, askGate1: async () => GATE1_LINE })
    expect(calls.length).toBe(2)
    expect(calls[1].env.BENCH_TRIAL_PREFLIGHT_ONLY).toBeUndefined()
    expect(calls[1].env.BENCH_LIVE_TRIAL).toBe('I-UNDERSTAND-THIS-SPENDS-REAL-MONEY')
    expect(code).toBe(0)
  })
  it('an NFD-typed line (some input methods) is accepted: both sides are compared in NFC', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: () => {}, run: fakeRun({}, calls), stdinIsTTY: true, askGate1: async () => GATE1_LINE.normalize('NFD') })
    expect(calls.length).toBe(2)
  })
  it('a line typed through askLine comes back as typed (the answer is not lost to the close event)', async () => {
    const { PassThrough } = await import('node:stream')
    const input = new PassThrough()
    const output = new PassThrough()
    output.resume()
    const pending = askLine('> ', { input: input as never, output: output as never, timeoutMs: 20_000 })
    input.write(GATE1_LINE + '\n')
    expect(await pending).toBe(GATE1_LINE)
  })
  it('end of input (stdin closed) refuses at once, without waiting for the full timeout', async () => {
    const { PassThrough } = await import('node:stream')
    const input = new PassThrough()
    const started = Date.now()
    const output = new PassThrough() // readline needs a real stream for output
    output.resume()
    const pending = askLine('> ', { input: input as never, output: output as never, timeoutMs: 20_000 })
    input.end()
    expect(await pending).toBe('')
    expect(Date.now() - started).toBeLessThan(5_000)
  })
  it('a line that ends with a trailing space is still refused', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    const code = await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: () => {}, run: fakeRun({}, calls), stdinIsTTY: true, askGate1: async () => GATE1_LINE + ' ' })
    expect(code).toBe(1)
    expect(calls.length).toBe(1)
  })
  it('a CRLF line ending from the terminal is accepted; anything else is not', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: () => {}, run: fakeRun({}, calls), stdinIsTTY: true, askGate1: async () => GATE1_LINE + '\r' })
    expect(calls.length).toBe(2)
  })
  it('a key of exactly 4 characters that the child echoes is redacted (the boundary)', () => {
    const out = redactText('child says k3y5 here', { OPENAI_API_KEY: 'k3y5', SERPER_API_KEY: undefined })
    expect(out).not.toContain('k3y5')
  })
  it('a short key (7 characters) that the child echoes is redacted too (no minimum length above 4)', () => {
    const out = redactText('child says k3y5678 here', { OPENAI_API_KEY: 'k3y5678', SERPER_API_KEY: undefined })
    expect(out).not.toContain('k3y5678')
    expect(out).toContain('***')
  })
  it('the Gate 1 summary names the run without any key value', () => {
    const lines = gate1Summary({ ...BASE, OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER }, QUESTIONS)
    const text = lines.join('\n')
    expect(text).toContain(GATE1_LINE)
    expect(text).toMatch(/OPENAI_API_KEY SET, SERPER_API_KEY SET/)
    expect(text).not.toContain(KEY_OPENAI)
    expect(text).not.toContain(KEY_SERPER)
    expect(text).toMatch(/D8\|D8\|1/)
  })
  it('the Gate 1 summary shows the Serper request cap (a count, not a price) with the values the Owner set, so they are read before the line is typed', () => {
    const armed = gate1Summary({ ...BASE, CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '12', CONSULT_REQUEST_CAP_PER_RUN: '250' }, QUESTIONS).join('\n')
    expect(armed).toContain('CONSULT_REQUEST_CAP=1, mỗi lượt 12, cả lần chạy 250')
    expect(armed).toContain('KHÔNG phải tiền')
    const unset = gate1Summary({ ...BASE }, QUESTIONS).join('\n')
    expect(unset).toContain('CONSULT_REQUEST_CAP=(unset), mỗi lượt ?, cả lần chạy ?')
  })
})

describe('a failing preflight stops before Gate 1 and before any real child', () => {
  it('KHÔNG ĐẠT in the preflight block: exit 1, Gate 1 never asked, one child only', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    let asked = 0
    const t = trace()
    const code = await runFlow({
      env: { ...BASE }, repoRoot: 'D:/x', print: t.print, stdinIsTTY: true,
      run: fakeRun({ pf: '[KHÔNG ĐẠT] OPENAI_API_KEY present (value never shown) — OPENAI_API_KEY is UNSET\nTỔNG: 1 điều kiện KHÔNG ĐẠT — không chạy' }, calls),
      askGate1: async () => { asked++; return GATE1_LINE },
    })
    expect(code).toBe(1)
    expect(asked).toBe(0)
    expect(calls.length).toBe(1)
  })
})

describe('the keys: passed to the child only, never in argv, the parent env, the output or a file', () => {
  it('the child env carries the keys; the parent env and argv do not; printed text is redacted', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    const t = trace()
    // a child that (wrongly) prints a key inside its summary: the launcher must redact it before printing
    const leaky = fakeRun({ sm: `turnOk=true runValid=false benchmarkEligible=false trialClean=true\nlog: provider said ${KEY_OPENAI}` }, calls)
    const before = { ...process.env }
    await runFlow({ env: { ...BASE }, keys: { OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER }, repoRoot: 'D:/x', print: t.print, run: leaky, stdinIsTTY: true, askGate1: async () => GATE1_LINE })
    expect(calls[0].env.OPENAI_API_KEY).toBe(KEY_OPENAI) // the preflight child has the key (it checks it is present)
    expect(calls[1].env.SERPER_API_KEY).toBe(KEY_SERPER)
    for (const c of calls) expect(c.args.join(' ')).not.toContain(KEY_OPENAI)
    expect(process.env.OPENAI_API_KEY).toBe(before.OPENAI_API_KEY) // this process's env is unchanged
    expect(process.env.SERPER_API_KEY).toBe(before.SERPER_API_KEY)
    const out = allOutput(t.lines)
    expect(out).not.toContain(KEY_OPENAI)
    expect(out).not.toContain(KEY_SERPER)
    expect(out).toMatch(/provider said \*\*\*/)
  })
  it('a key already in the shell is not refused by the launcher (the shell-key warning is printed by main, without the value)', () => {
    expect(launcherRefusals({ OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER })).toEqual([])
  })
  it('the child env built for a preflight carries BENCH_TRIAL_PREFLIGHT_ONLY and the launcher\'s own confirmation text (not the parent\'s value)', () => {
    const e = buildChildEnv({ ...BASE, BENCH_LIVE_TRIAL: 'parent-value' }, { confirm: true, nonce: N1, preflightOnly: true })
    expect(e.BENCH_TRIAL_PREFLIGHT_ONLY).toBe('1')
    expect(e.BENCH_LIVE_TRIAL).toBe('I-UNDERSTAND-THIS-SPENDS-REAL-MONEY')
  })
  it('a parent shell that sets BENCH_TRIAL_PREFLIGHT_ONLY is refused', () => {
    expect(launcherRefusals({ ...BASE, BENCH_TRIAL_PREFLIGHT_ONLY: '1' }).join(' ')).toMatch(/BENCH_TRIAL_PREFLIGHT_ONLY is set in this shell/)
  })
})

describe('preflight-only: exit 0 only for a block with every condition ĐẠT', () => {
  it('a passing block gives 0 and nothing else is sent', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    const t = trace()
    const code = await runLauncher({ env: { ...BASE }, repoRoot: 'D:/x', preflightOnly: true, print: t.print, run: fakeRun({}, calls), nonce: N2 })
    expect(code).toBe(0)
    expect(calls.length).toBe(1)
    expect(calls[0].env.BENCH_TRIAL_PREFLIGHT_ONLY).toBe('1')
    expect(calls[0].env.BENCH_TRIAL_ISOLATED).toBe(N2)
  })
  it('a block with a KHÔNG ĐẠT line gives 1, even if the child exit code is 0', async () => {
    const calls: Array<{ env: Record<string, string>; args: string[] }> = []
    const code = await runLauncher({ env: { ...BASE }, repoRoot: 'D:/x', preflightOnly: true, print: () => {}, run: fakeRun({ pf: '[KHÔNG ĐẠT] x\nTỔNG: 1 điều kiện KHÔNG ĐẠT — không chạy' }, calls) })
    expect(code).toBe(1)
  })
  it('a REAL run that ends in a time-limit kill is not clean, even when its summary is complete', async () => {
    // the preflight child answers with a clean block (so the flow reaches the real child); the real child answers with a complete, clean summary
    // and then is killed by the time limit: that is not a clean result
    const run = async ({ env }: { env: Record<string, string> }) => {
      const n = env.BENCH_TRIAL_ISOLATED
      const isPre = env.BENCH_TRIAL_PREFLIGHT_ONLY === '1'
      return {
        text: isPre
          ? `${marker(PREFLIGHT_BEGIN, n)}\nTỔNG: mọi điều kiện ĐẠT (preflight-only)\n${marker(PREFLIGHT_END, n)}`
          : `${marker(SUMMARY_BEGIN, n)}\nturnOk=true runValid=false benchmarkEligible=false trialClean=true\n${marker(SUMMARY_END, n)}`,
        truncated: false, exitCode: null, killedBy: isPre ? 'after-summary' : 'time-limit', stillAlive: false, pipesOpen: false, pid: 1, ms: 1,
      }
    }
    const code = await runFlow({ env: { ...BASE }, repoRoot: 'D:/x', print: () => {}, run: run as never, stdinIsTTY: true, askGate1: async () => GATE1_LINE })
    expect(code).toBe(1)
  })
  it('a block that is complete, but whose child the launcher ended after the block (killedBy after-summary), still gives 0', async () => {
    // the preflight child prints its block and stays alive (vitest does not exit within the grace window); the launcher ends its tree
    const run = async ({ env }: { env: Record<string, string> }) => ({
      text: `${marker(PREFLIGHT_BEGIN, env.BENCH_TRIAL_ISOLATED)}\nTỔNG: mọi điều kiện ĐẠT (preflight-only; không có request nào được gửi)\n${marker(PREFLIGHT_END, env.BENCH_TRIAL_ISOLATED)}`,
      truncated: false, exitCode: null, killedBy: 'after-summary', stillAlive: false, pipesOpen: false, pid: 1, ms: 1,
    })
    const code = await runLauncher({ env: { ...BASE }, repoRoot: 'D:/x', preflightOnly: true, print: () => {}, run: run as never })
    expect(code).toBe(0)
  })
  it('a complete block whose child was killed by the time limit still gives 1 (the end marker is present)', async () => {
    const run = async ({ env }: { env: Record<string, string> }) => ({
      text: `${marker(PREFLIGHT_BEGIN, env.BENCH_TRIAL_ISOLATED)}\nTỔNG: mọi điều kiện ĐẠT (preflight-only)\n${marker(PREFLIGHT_END, env.BENCH_TRIAL_ISOLATED)}`,
      truncated: false, exitCode: null, killedBy: 'time-limit', stillAlive: false, pipesOpen: false, pid: 1, ms: 1,
    })
    const code = await runLauncher({ env: { ...BASE }, repoRoot: 'D:/x', preflightOnly: true, print: () => {}, run: run as never })
    expect(code).toBe(1)
  })
  it('no block at all (the child printed nothing) gives 1', async () => {
    const run = async () => ({ text: '', truncated: false, exitCode: 0, killedBy: null, stillAlive: false, pipesOpen: false, pid: 1, ms: 1 })
    const code = await runLauncher({ env: { ...BASE }, repoRoot: 'D:/x', preflightOnly: true, print: () => {}, run })
    expect(code).toBe(1)
  })
})

describe('readHidden: the typed characters are never shown or returned in the prompt', () => {
  function fakeTty() {
    const e = new EventEmitter() as EventEmitter & { isTTY: boolean; setRawMode: (b: boolean) => void; resume: () => void; pause: () => void }
    e.isTTY = true
    e.setRawMode = () => {}
    e.resume = () => {}
    e.pause = () => {}
    return e
  }
  const CR = String.fromCharCode(13), BS = String.fromCharCode(8), ETX = String.fromCharCode(3)
  it('returns the typed value at Enter, and the output shows the prompt and a newline only', async () => {
    const input = fakeTty(); const written: string[] = []
    const p = readHidden('KEY: ', { input: input as never, output: { write: (s: string) => { written.push(s) } } as never })
    input.emit('data', 'sk-test-SECRET-123' + CR)
    expect(await p).toBe('sk-test-SECRET-123')
    expect(written.join('')).toBe('KEY: \n')
  })
  it('backspace removes the last character; Ctrl+C rejects and returns nothing', async () => {
    const input = fakeTty(); const written: string[] = []
    const out = { write: (s: string) => { written.push(s) } } as never
    const p = readHidden('K: ', { input: input as never, output: out })
    input.emit('data', 'abc' + BS + 'd' + CR)
    expect(await p).toBe('abd')
    const q = readHidden('K: ', { input: input as never, output: out })
    input.emit('data', 'xy' + ETX)
    await expect(q).rejects.toThrow(/Ctrl\+C/)
    expect(written.join('')).not.toMatch(/xy|abc/)
  })
  it('a non-terminal stdin is refused and nothing is read', async () => {
    const notTty = new EventEmitter() as EventEmitter & { isTTY: boolean }
    notTty.isTTY = false
    await expect(readHidden('K: ', { input: notTty as never, output: { write: () => {} } as never })).rejects.toThrow(/interactive terminal/)
  })
})
