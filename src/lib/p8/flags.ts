// PHASE 8 feature flags — the single registry (selective port, Option A, 2026-10-09).
//
// Every Phase 8 behaviour ships behind one of these, DEFAULT OFF. A flag is read from the environment at
// call time (`P8_<NAME>=1|true`), so a regression is rolled back by configuration, never by a redeploy.
// With every flag unset, behaviour is byte-identical to the build without this file.
//
// This is the TRIMMED registry of the Agent line: it carries only the flags whose code was ported here
// (C1, C2 of docs/phase8/COST_AUDIT.md on `sec/phase8-hardening`). The other P8 flags live on that branch
// and join when their code does. Never read `process.env.P8_*` anywhere else.

export const P8_FLAGS = {
  /** C1 — the memory-extraction prompt gets the TEXT parts of a message, never an image's base64. */
  p8_cost_memory_text: { env: 'P8_COST_MEMORY_TEXT', task: '02' },
  /** C2 — Scam Shield's provider cache falls back to the `KV_REST_API_*` pair when `UPSTASH_REDIS_REST_*` is absent. */
  p8_cost_scam_cache_kv: { env: 'P8_COST_SCAM_CACHE_KV', task: '02' },
} as const

export type P8Flag = keyof typeof P8_FLAGS

export function p8Enabled(flag: P8Flag, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[P8_FLAGS[flag].env]
  return v === '1' || v === 'true'
}
