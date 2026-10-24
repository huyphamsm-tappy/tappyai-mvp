// Types of liveTrialLauncher.mjs (the launcher itself is plain JavaScript so that `node` can run it without a build step).
export function marker(kind: string, nonce: string): string
export const SUMMARY_BEGIN: string
export const SUMMARY_END: string
export const REFUSED_BEGIN: string
export const REFUSED_END: string
export const SYSTEM_ENV_NAMES: string[]
export const TRIAL_ENV_NAMES: string[]
export const FLAG_ENV_NAMES: string[]
type Env = Record<string, string | undefined>
export interface ChildSpec { file: string; args: string[] }
export interface ChildResult {
  text: string; truncated: boolean; exitCode: number | null; killedBy: 'after-summary' | 'time-limit' | null; stillAlive: boolean; pipesOpen: boolean
  survivors?: number[]; survivorNames?: Record<number, string | undefined>; pid: number | undefined; ms: number
}
export interface RunTrialChildOptions {
  child: ChildSpec; cwd: string; env: Env; endMarkers?: string[]; graceMs?: number; timeLimitMs?: number; maxBytes?: number
  now?: () => number; kill?: (pid: number) => void; alive?: (pid: number) => boolean; descendants?: (pid: number, sinceMs?: number) => Array<{ pid: number; name: string }>
}
export function listDescendants(pid: number, sinceMs?: number): Array<{ pid: number; name: string }>
export function redactText(text: string, env: Env): string
export const PREFLIGHT_BEGIN: string
export const PREFLIGHT_END: string
export const GATE1_LINE: string
export function buildChildEnv(parentEnv: Env, opts: { confirm: boolean; nonce: string; preflightOnly?: boolean }): Record<string, string>
export function gate1Summary(env: Env, questionText: string | null): string[]
export function readHidden(prompt: string, opts?: { input?: unknown; output?: unknown }): Promise<string>
export function askLine(prompt: string, opts?: { input?: unknown; output?: unknown; timeoutMs?: number }): Promise<string>
export function runFlow(opts: {
  env: Env; repoRoot: string; keys?: Record<string, string>; print: (s: string) => void; child?: ChildSpec; run?: (opts: RunTrialChildOptions) => Promise<ChildResult>
  nonce?: string; questionText?: string | null; stdinIsTTY?: boolean; askGate1?: (prompt: string) => Promise<string>; graceMs?: number; timeLimitMs?: number
  writeFile?: (path: string, text: string) => void; makeDir?: (dir: string, opts?: { recursive?: boolean }) => void
}): Promise<number>
export function launcherRefusals(parentEnv: Env): string[]
export function extractBlock(text: string, begin: string, end: string): string | null
export function killTree(pid: number): void
export function isAlive(pid: number): boolean
export function runTrialChild(opts: RunTrialChildOptions): Promise<ChildResult>
export function runLauncher(opts: {
  env: Env; repoRoot: string; plumbingCheck?: boolean; preflightOnly?: boolean; print: (s: string) => void; child?: ChildSpec; graceMs?: number; timeLimitMs?: number; nonce?: string
  writeFile?: (path: string, text: string) => void; makeDir?: (dir: string, opts?: { recursive?: boolean }) => void; run?: (opts: RunTrialChildOptions) => Promise<ChildResult>
}): Promise<number>
