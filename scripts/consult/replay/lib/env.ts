// Replay harness — environment for one run.
//
// Only TWO values are taken from the AUDIT env file: the model key and the Serper key. Nothing else
// (no Supabase keys, no KV/Upstash, no Google Places key) — Supabase/auth/quota are mocked in the
// test file, and every other outbound call is answered locally by the fetch stub. Values are
// written to process.env and never printed.
import { readFileSync, existsSync } from 'node:fs'

export const DEFAULT_ENV_FILE = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/.env.local'
/** The audit Supabase project ref. The file must point at it, or the harness refuses to run. */
export const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'

const TAKE = ['ANTHROPIC_API_KEY', 'SERPER_API_KEY'] as const

/** Every variable that would turn the shared (KV/Upstash) cache or counters on. */
const SHARED_STORE = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_URL', 'KV_REST_API_READ_ONLY_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']

export const RUN_FLAGS: Record<string, string> = {
  CONSULT_V2: '1',
  CONSULTATIVE_V1: '1',
  SNIPPET_PRICE_GUARD_V2: '1',
  MEDIA_PLACEMENT_V2: '0', // owner review 29/09 flagged inline images in prose (T3) — off on UAT too
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * Loads the two keys into process.env, sets the run flags, unsets the shared store. Throws (with a
 * message that names no value) when the file is missing, is not the audit env, or lacks a key.
 */
export function prepareReplayEnv(file = process.env.REPLAY_ENV_FILE || DEFAULT_ENV_FILE): { serperKey: boolean } {
  if (!existsSync(file)) throw new Error(`REFUSING: env file not found (${file})`)
  const env = parseEnvFile(file)
  if (!String(env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(AUDIT_REF)) throw new Error('REFUSING: env file is not the AUDIT env (NEXT_PUBLIC_SUPABASE_URL does not name the audit ref)')
  if (!env.ANTHROPIC_API_KEY) throw new Error('REFUSING: model key missing from the audit env file')
  for (const k of TAKE) if (env[k]) process.env[k] = env[k]
  for (const k of SHARED_STORE) delete process.env[k]
  for (const [k, v] of Object.entries(RUN_FLAGS)) process.env[k] = v
  // Keep the model on the provider defaults (Haiku); a stray shell override would skew cost.
  for (const k of ['LLM_PROVIDER', 'LLM_FAST_MODEL', 'LLM_SMART_MODEL', 'LLM_PLANNING_MODEL', 'LLM_VISION_MODEL']) delete process.env[k]
  return { serperKey: !!env.SERPER_API_KEY }
}
