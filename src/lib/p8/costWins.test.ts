// PHASE 8 / Task 02 (C1, C2) — flag OFF = previous behaviour exactly; flag ON = same result, less spend.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { memoryMessageText, scamCacheRedisEnv } from './costWins'
import { P8_FLAGS, p8Enabled } from './flags'

type Flag = keyof typeof P8_FLAGS
const enabled = (name: Flag, env: Record<string, string>) => p8Enabled(name, env as NodeJS.ProcessEnv)

describe('registry', () => {
  it('every flag is OFF unless its env is exactly "1" or "true"', () => {
    for (const [name, f] of Object.entries(P8_FLAGS)) {
      expect(enabled(name as Flag, {}), name).toBe(false)
      for (const v of ['0', 'false', 'yes', 'on', '', ' 1', 'TRUE']) expect(enabled(name as Flag, { [f.env]: v }), `${name}=${v}`).toBe(false)
      for (const v of ['1', 'true']) expect(enabled(name as Flag, { [f.env]: v }), `${name}=${v}`).toBe(true)
    }
  })
  it('carries exactly the ported flags (a new flag must be added here on purpose)', () => {
    expect(Object.keys(P8_FLAGS).sort()).toEqual(['p8_cost_memory_text', 'p8_cost_scam_cache_kv'])
  })
})

describe('p8_cost_memory_text (C1)', () => {
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(50_000)
  const parts = [{ type: 'text', text: 'quán này ở quận 3' }, { type: 'image', image: img }]
  it('OFF: identical to the previous behaviour (JSON of the parts, base64 included)', () => {
    expect(memoryMessageText(parts, {})).toBe(JSON.stringify(parts))
    expect(memoryMessageText('xin chào', {})).toBe('xin chào')
  })
  it('ON: strings unchanged; arrays keep only their text — no base64 reaches the prompt', () => {
    const env = { P8_COST_MEMORY_TEXT: '1' }
    expect(memoryMessageText('xin chào', env)).toBe('xin chào')
    const out = memoryMessageText(parts, env)
    expect(out).toBe('quán này ở quận 3')
    expect(out).not.toContain('base64')
    expect(memoryMessageText({ weird: true }, env)).toBe('')
    // only parts TYPED text count: a non-text part that happens to carry a `text` field is not user speech
    expect(memoryMessageText([{ type: 'text', text: 'a' }, { type: 'image', text: 'caption-b' }, null, { type: 'text', text: 'c' }], env)).toBe('a\nc')
  })
  it('wiring: the chat route builds the memory prompt through memoryMessageText', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toContain("import { memoryMessageText } from '@/lib/p8/costWins'")
    expect(route).toMatch(/role: m\.role,\s*\n\s*\/\/[^\n]*\n\s*content: memoryMessageText\(m\.content\),/)
  })
})

describe('p8_cost_scam_cache_kv (C2)', () => {
  const kv = { KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't' }
  it('OFF: only the UPSTASH_* pair — KV alone leaves the cache off', () => {
    expect(scamCacheRedisEnv(kv)).toBeNull()
    expect(scamCacheRedisEnv({ UPSTASH_REDIS_REST_URL: 'https://u.test', UPSTASH_REDIS_REST_TOKEN: 'x' })).toEqual({ url: 'https://u.test', token: 'x' })
  })
  it('ON: KV_* is the fallback; UPSTASH_* still wins when present; a half pair is not used', () => {
    expect(scamCacheRedisEnv({ ...kv, P8_COST_SCAM_CACHE_KV: '1' })).toEqual({ url: 'https://kv.test', token: 't' })
    expect(scamCacheRedisEnv({ ...kv, P8_COST_SCAM_CACHE_KV: '1', UPSTASH_REDIS_REST_URL: 'https://u.test', UPSTASH_REDIS_REST_TOKEN: 'x' })!.url).toBe('https://u.test')
    expect(scamCacheRedisEnv({ KV_REST_API_URL: 'https://kv.test', P8_COST_SCAM_CACHE_KV: '1' })).toBeNull()
  })
  it('wiring: redisCache reads its credentials through scamCacheRedisEnv', () => {
    const src = readFileSync('src/lib/scam-shield/cache/redisCache.ts', 'utf8')
    expect(src).toContain("import { scamCacheRedisEnv } from '@/lib/p8/costWins'")
    expect(src).toContain('const creds = scamCacheRedisEnv()')
    expect(src).not.toContain('process.env.UPSTASH_REDIS_REST_URL')
  })
})
