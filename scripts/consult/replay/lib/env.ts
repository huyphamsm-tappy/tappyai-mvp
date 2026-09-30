import { randomBytes } from 'node:crypto'
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
  // Q10 (29/09): links as production builds them — ACCESSTRADE wrapping with sub1. The publisher id is public
  // (it is in every tracked link); the attribution secret is a fresh random value per run, never a real one.
  process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'
  process.env.CCP_ATTRIBUTION_SECRET = randomBytes(24).toString('hex')
  // Keep the model on the provider defaults (Haiku); a stray shell override would skew cost.
  for (const k of ['LLM_PROVIDER', 'LLM_FAST_MODEL', 'LLM_SMART_MODEL', 'LLM_PLANNING_MODEL', 'LLM_VISION_MODEL']) delete process.env[k]
  applyLunaEnv()
  process.env.CONSULT_DECISION_LOG = '1' // the turn's full decision in the raw logs (intent check); log only
  return { serperKey: !!env.SERPER_API_KEY }
}

/** Where the owner keeps the OpenAI key for LOCAL replay only (never committed, never printed). */
export const DEFAULT_OPENAI_KEY_FILE = 'D:/TappyAI-backups/openai-key.txt'

/**
 * PHIÊN LUNA (owner 2026-09-30). REPLAY_LUNA=<answer effort>[,<intent effort>] — e.g. `none`, `low`,
 * `low,none` — turns CONSULT_LUNA on and routes both roles to Luna with EXPLICIT efforts. REPLAY_LUNA=prompt
 * turns the flag on with both roles on Haiku (isolates the prompt). Unset → the Phase 7 pipeline (Haiku).
 */
export function applyLunaEnv(): { luna: string | null } {
  for (const k of ['CONSULT_LUNA', 'CONSULT_LUNA_PLAN', 'CONSULT_LUNA_FAST', 'LLM_CONSULT_PROVIDER', 'LLM_INTENT_PROVIDER', 'LLM_PLAN_PROVIDER', 'LLM_CONSULT_REASONING', 'LLM_INTENT_REASONING', 'LLM_PLAN_REASONING', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL']) delete process.env[k]
  const spec = (process.env.REPLAY_LUNA ?? '').trim().toLowerCase()
  if (!spec) return { luna: null }
  process.env.CONSULT_LUNA = '1'
  if (spec === 'prompt') return { luna: spec }
  const [answer, intent = answer] = spec.split(',').map(s => s.trim())
  const ok = ['none', 'low', 'medium', 'high']
  if (!ok.includes(answer) || !ok.includes(intent)) throw new Error('REFUSING: REPLAY_LUNA must be none|low|medium|high[,<intent effort>] or prompt')
  const file = process.env.REPLAY_OPENAI_KEY_FILE || DEFAULT_OPENAI_KEY_FILE
  if (!existsSync(file)) throw new Error(`REFUSING: OpenAI key file not found (${file})`)
  const key = readFileSync(file, 'utf8').trim()
  if (!key) throw new Error('REFUSING: OpenAI key file is empty')
  process.env.OPENAI_API_KEY = key
  process.env.LLM_CONSULT_PROVIDER = 'openai'; process.env.LLM_CONSULT_REASONING = answer
  process.env.LLM_INTENT_PROVIDER = 'openai'; process.env.LLM_INTENT_REASONING = intent
  // REPLAY_LUNA_PLAN=medium|high|xhigh — the detailed plan on Luna too (CONSULT_LUNA_PLAN).
  const plan = (process.env.REPLAY_LUNA_PLAN ?? '').trim().toLowerCase()
  if (plan) {
    if (!['none', 'low', 'medium', 'high', 'xhigh'].includes(plan)) throw new Error('REFUSING: REPLAY_LUNA_PLAN must be none|low|medium|high|xhigh')
    process.env.CONSULT_LUNA_PLAN = '1'; process.env.LLM_PLAN_PROVIDER = 'openai'; process.env.LLM_PLAN_REASONING = plan
  }
  // REPLAY_LUNA_FAST=1 — skip the intent call on sure continuing turns (CONSULT_LUNA_FAST, latency task 30/09).
  if (process.env.REPLAY_LUNA_FAST === '1') process.env.CONSULT_LUNA_FAST = '1'
  return { luna: spec }
}
