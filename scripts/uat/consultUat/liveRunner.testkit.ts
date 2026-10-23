// Shared fakes for the runner tests of Round 2b (not a test file). MOCK-ONLY: an in-memory file system, a fake chat transport that spends only through
// the spend gate, and an environment that matches the flag list. Nothing here opens a socket, reads a key or touches the disk.
import { BENCH_FLAG_NAMES, type BenchFs, type BenchOptions, type ChatTransport } from './liveRunner'
import { reserveSpend } from '@/lib/ai/budget/spendGate'

export const GOOD_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.65',
  CONSULT_LUNA: '1', TURN_WEB_TICKET: '1', SEARCH_FALLBACK_GATE: '1',
}
export function applyEnv(env: Record<string, string | undefined>): void {
  for (const k of [...BENCH_FLAG_NAMES, 'OPENAI_API_KEY', 'SERPER_API_KEY']) delete process.env[k]
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v
}
export const declare = (env: Record<string, string | undefined>): Record<string, string | null> => Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, env[k] ?? null]))

export interface MemFs extends BenchFs {
  files: Map<string, string>
  dirs: Set<string>
  /** Every operation in order: `mkdirp:<dir>`, `write:<path>`, `append:<path>`, `remove:<path>`. */
  ops: string[]
  /** Make an operation fail: return true to throw. */
  failOn?: (op: 'mkdirp' | 'write' | 'append' | 'remove', path: string) => boolean
  /** Where a path really lives (default: where it says). Lets a test stand a junction or an 8.3 short name in for a path. */
  real?: (path: string) => string
}
export function memFs(): MemFs {
  const fs: MemFs = {
    files: new Map(), dirs: new Set(), ops: [],
    realpath(p) { fs.ops.push(`realpath:${p}`); return fs.real ? fs.real(p) : p },
    mkdirp(dir) { fs.ops.push(`mkdirp:${dir}`); if (fs.failOn?.('mkdirp', dir)) throw new Error(`EACCES: cannot create ${dir}`); fs.dirs.add(dir) },
    write(path, text) { fs.ops.push(`write:${path}`); if (fs.failOn?.('write', path)) throw new Error(`EACCES: cannot write ${path}`); fs.files.set(path, text) },
    append(path, text) { fs.ops.push(`append:${path}`); if (fs.failOn?.('append', path)) throw new Error(`ENOSPC: cannot append ${path}`); fs.files.set(path, (fs.files.get(path) ?? '') + text) },
    remove(path) { fs.ops.push(`remove:${path}`); if (fs.failOn?.('remove', path)) throw new Error(`EPERM: cannot remove ${path}`); fs.files.delete(path) },
  }
  return fs
}
/** Files that are not probes. */
export const resultFiles = (fs: MemFs): Array<[string, string]> => [...fs.files.entries()].filter(([p]) => !/\.probe-/.test(p))
export const finalFile = (fs: MemFs): { path: string; json: Record<string, any> } | null => {
  const e = resultFiles(fs).find(([p]) => /\/bench-\d+\.json$/.test(p.replace(/\\/g, '/')))
  return e ? { path: e[0], json: JSON.parse(e[1]) } : null
}
const jsonlAll = (fs: MemFs): Array<Record<string, any>> => {
  const e = resultFiles(fs).find(([p]) => /\.jsonl$/.test(p))
  return e ? e[1].split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
}
/** The finished-turn records in the JSONL. */
export const jsonlLines = (fs: MemFs): Array<Record<string, any>> => jsonlAll(fs).filter(l => 'id' in l)
/** The "turn started" lines in the JSONL (written before the turn's first request). */
export const jsonlStarts = (fs: MemFs): Array<Record<string, any>> => jsonlAll(fs).filter(l => 'started' in l)

/** Does any object in the tree have this key? */
export function hasKey(v: unknown, key: string): boolean {
  if (Array.isArray(v)) return v.some(x => hasKey(x, key))
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).some(([k, x]) => k === key || hasKey(x, key))
  return false
}

/** One fake turn: a model call and a Serper request through the gate, a ticket log line, an answer. */
export function turnTransport(over: { llmActual?: unknown; onTurn?: (n: number) => void | Promise<void> } = {}): { chat: ChatTransport; requests: Array<{ messages: Array<{ role: string; content: string }>; chatSessionId: string }> } {
  const requests: Array<{ messages: Array<{ role: string; content: string }>; chatSessionId: string }> = []
  const chat: ChatTransport = async req => {
    requests.push(JSON.parse(JSON.stringify(req)))
    await over.onTurn?.(requests.length)
    const llm = reserveSpend('llm:consult', 0.004)!
    llm.settle(over.llmActual === undefined ? 0.003 : over.llmActual)
    const s = reserveSpend('serper:search', 0.001)!
    s.settle(0.001)
    const last = req.messages[req.messages.length - 1].content
    return { raw: `0:${JSON.stringify(`Trả lời: ${last.slice(0, 20)}`)}\nd:{"finishReason":"stop"}\n` }
  }
  return { chat, requests }
}

export const OUT_DIR = 'D:/TappyAI-review-artifacts/consultative-round2b-test'
export function options(over: Partial<BenchOptions> = {}, env: Record<string, string | undefined> = GOOD_ENV): { opts: BenchOptions; fs: MemFs } {
  const fs = memFs()
  return {
    fs,
    opts: {
      chat: turnTransport().chat, turnCapUsd: 0.05, runCapUsd: 0.65, confirmSpend: { capUsd: 0.65 }, declaredFlags: declare(env), env,
      outDir: OUT_DIR, repoRoot: 'D:/TappyAI-wt/wt-integration', fs, now: () => 1_000, ...over,
    },
  }
}
