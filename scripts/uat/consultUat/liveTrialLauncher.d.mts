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
export function buildChildEnv(parentEnv: Env, opts: { confirm: boolean; nonce: string }): Record<string, string>
export function launcherRefusals(parentEnv: Env): string[]
export function extractBlock(text: string, begin: string, end: string): string | null
export function killTree(pid: number): void
export function isAlive(pid: number): boolean
export function runTrialChild(opts: RunTrialChildOptions): Promise<ChildResult>
export function runLauncher(opts: {
  env: Env; repoRoot: string; plumbingCheck?: boolean; print: (s: string) => void; child?: ChildSpec; graceMs?: number; timeLimitMs?: number; nonce?: string
  writeFile?: (path: string, text: string) => void; makeDir?: (dir: string, opts?: { recursive?: boolean }) => void; run?: (opts: RunTrialChildOptions) => Promise<ChildResult>
}): Promise<number>
