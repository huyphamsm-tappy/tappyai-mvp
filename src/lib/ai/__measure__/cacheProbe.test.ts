import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI } from '@/lib/ai/llm'
import { buildSystem } from '@/lib/ai/promptBuilder'

// ── Prompt-cache probe (Phase B measurement harness) ─────────────────────────
//
// Makes REAL, BILLED Anthropic calls. Skipped unless TAPPY_MEASURE=1 so a plain
// `npm test` never spends money:
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/cacheProbe.test.ts --disable-console-intercept
//
// It isolates the caching question from tools, quotas, auth, and streaming:
// two sequential single-shot calls that share a system prompt should show
// cacheCreationInputTokens on the first and cacheReadInputTokens on the second.
// Anything else means the prefix is not stable.

const MEASURE = process.env.TAPPY_MEASURE === '1'

// The route reads ANTHROPIC_API_KEY from the Vercel environment; locally it
// lives in .env.local, which vitest does not load.
if (MEASURE && !process.env.ANTHROPIC_API_KEY) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && m[1] === 'ANTHROPIC_API_KEY') process.env.ANTHROPIC_API_KEY = m[2].replace(/^"|"$/g, '')
  }
}

type CacheStats = { create: number; read: number; prompt: number }

async function probe(system: string): Promise<CacheStats> {
  const r = await AI.generate({ role: 'smart', system, prompt: 'ok', maxTokens: 8 })
  const meta = (r.providerMetadata?.anthropic ?? {}) as {
    cacheCreationInputTokens?: number | null
    cacheReadInputTokens?: number | null
  }
  return {
    create: meta.cacheCreationInputTokens ?? 0,
    read: meta.cacheReadInputTokens ?? 0,
    prompt: r.usage?.promptTokens ?? 0,
  }
}

function row(label: string, s: CacheStats) {
  console.log(
    `${label.padEnd(40)} promptTok=${String(s.prompt).padStart(6)}  ` +
    `cacheCreate=${String(s.create).padStart(6)}  cacheRead=${String(s.read).padStart(6)}`,
  )
}

const MEM_A = `===== THONG TIN VE USER NAY =====
- Vi tri thuong dung: Quan 3
- So thich: an uong: bun bo
==================================`
const MEM_B = `===== THONG TIN VE USER NAY =====
- Vi tri thuong dung: Hai Ba Trung
- So thich: an uong: pho ga
==================================`

describe.skipIf(!MEASURE)('prompt cache probe', () => {
  it('A — identical prompt twice: does caching work at all?', async () => {
    const sys = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, null)
    const first = await probe(sys)
    const second = await probe(sys)
    row('A1 identical (cold)', first)
    row('A2 identical (warm)', second)
    expect(second.read).toBeGreaterThan(0)
  }, 120_000)

  it('B — same prompt one minute later: does the clock invalidate it?', async () => {
    // buildSystem stamps the CURRENT time itself, so simulate the next minute by
    // rewriting only the timestamp substring — everything else is byte-identical.
    const sys = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, null)
    const bumped = sys.replace(/(\d{2}):(\d{2})/, (_m, h, mm) =>
      `${h}:${String((Number(mm) + 1) % 60).padStart(2, '0')}`)
    expect(bumped).not.toBe(sys)
    const base = await probe(sys)
    const nextMinute = await probe(bumped)
    row('B1 t=now', base)
    row('B2 t=now+1min', nextMinute)
  }, 120_000)

  it('C — two users, same static base: is the shared block reused?', async () => {
    const a = buildSystem(null, 'unknown', true, MEM_A, 'vi', '', null, null, false, null)
    const b = buildSystem(null, 'unknown', true, MEM_B, 'vi', '', null, null, false, null)
    const userA = await probe(a)
    const userB = await probe(b)
    row('C1 user A (memory A)', userA)
    row('C2 user B (memory B)', userB)
  }, 120_000)
})
