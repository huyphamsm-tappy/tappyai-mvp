// PHASE 8 / Task 02 — cost quick wins C1 and C2, each behind its OWN flag (default OFF = previous behaviour,
// byte for byte). Measurements and $ estimates: docs/phase8/COST_AUDIT.md (branch sec/phase8-hardening).
// Not ported on purpose: the Places photo-URI mode, the signed-URL window and the Serper /search TTL
// (C5 = absorbed by the Serper cost-control work; the others belong to modules this line does not have).

import { p8Enabled } from './flags'

type Env = Record<string, string | undefined>
const on = (flag: Parameters<typeof p8Enabled>[0], env: Env) => p8Enabled(flag, env as NodeJS.ProcessEnv)

/**
 * Memory extraction prompt text for one chat message. Before: an array content (text + image parts) is
 * JSON-stringified, so a photo's base64 data URL is pasted into the Haiku prompt as TEXT (hundreds of
 * thousands of chars). With `p8_cost_memory_text` only the text parts are kept — memory is about what the
 * user SAID; the image itself was never meant to be in this prompt.
 */
export function memoryMessageText(content: unknown, env: Env = process.env): string {
  if (typeof content === 'string') return content
  if (!on('p8_cost_memory_text', env)) return JSON.stringify(content)
  if (!Array.isArray(content)) return ''
  return content
    .map((p) => (p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Scam Shield's Redis cache credentials. Before: only `UPSTASH_REDIS_REST_*`; every other store reads
 * `KV_REST_API_*` (the pair production has). With `p8_cost_scam_cache_kv` the KV pair is the fallback, so the
 * provider cache (Web Risk etc.) is actually on instead of silently off.
 */
export function scamCacheRedisEnv(env: Env = process.env): { url: string; token: string } | null {
  let url = env.UPSTASH_REDIS_REST_URL
  let token = env.UPSTASH_REDIS_REST_TOKEN
  if ((!url || !token) && on('p8_cost_scam_cache_kv', env)) {
    url = env.KV_REST_API_URL
    token = env.KV_REST_API_TOKEN
  }
  return url && token ? { url, token } : null
}
