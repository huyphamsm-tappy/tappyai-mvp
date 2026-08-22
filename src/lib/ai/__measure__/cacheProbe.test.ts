import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI } from '@/lib/ai/llm'
import { buildSystem, type SystemPrompt } from '@/lib/ai/promptBuilder'

// ── Prompt-cache probe (Phase B measurement harness) ─────────────────────────
//
// Makes REAL, BILLED calls. Skipped unless TAPPY_MEASURE=1 so `npm test` never
// spends money:
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/cacheProbe.test.ts --disable-console-intercept
//
// It isolates caching from tools, quotas, auth and streaming: single-shot calls
// that share a system prompt. Before B1 this measured the defect (a one-minute
// clock tick or a different user re-billed all 11,056 tokens); after B1 it is
// the proof the split works.
//
// NOTE the probe goes through AI.generate, which sends no tools — so the cached
// prefix here is the system segment alone (~11k). The chat route additionally
// caches the tool definitions ahead of it (~13.1k total).

const MEASURE = process.env.TAPPY_MEASURE === '1'

// Next.js loads .env.local into process.env; vitest does not. Load it verbatim
// so the active provider finds whatever credentials it needs — this file never
// names a vendor key (Architecture Guard: no-vendor-api-keys), and credential
// readiness is checked through AI.isConfigured() below.
if (MEASURE) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

type CacheStats = { create: number; read: number; uncached: number; trueInput: number }

async function probe(sp: SystemPrompt): Promise<CacheStats> {
  const r = await AI.generate({
    role: 'smart',
    systemShared: sp.shared,
    system: sp.dynamic,
    prompt: 'ok',
    maxTokens: 8,
  })
  // 🔑 Reads the Anthropic shape directly, NOT through an adapter method. The D3 branch routed
  // this through `AI.usageMetrics()`, which belongs to the multi-provider registry that is out of
  // V2 scope and was not integrated — so the vendor read stays until a second provider exists to
  // justify the seam.
  const meta = (r.providerMetadata?.anthropic ?? {}) as {
    cacheCreationInputTokens?: number | null
    cacheReadInputTokens?: number | null
  }
  const create = meta.cacheCreationInputTokens ?? 0
  const read = meta.cacheReadInputTokens ?? 0
  const uncached = r.usage?.promptTokens ?? 0
  return { create, read, uncached, trueInput: create + read + uncached }
}

function row(label: string, s: CacheStats) {
  console.log(
    `${label.padEnd(34)} uncached=${String(s.uncached).padStart(6)}  ` +
    `create=${String(s.create).padStart(6)}  read=${String(s.read).padStart(6)}  ` +
    `trueInput=${String(s.trueInput).padStart(6)}`,
  )
}

const MEM_A = '===== THONG TIN VE USER NAY =====\n- Vi tri thuong dung: Quan 3\n- So thich: an uong: bun bo\n=================================='
const MEM_B = '===== THONG TIN VE USER NAY =====\n- Vi tri thuong dung: Hai Ba Trung\n- So thich: an uong: pho ga\n=================================='
const PREFS = '===== SO THICH NGUOI DUNG =====\nNgan sach: cao cap\n==============================='

describe.skipIf(!MEASURE)('prompt cache probe', () => {
  it('the active provider has credentials', () => {
    expect(AI.isConfigured()).toBe(true)
  })

  it('A/B/C/D — the shared rulebook survives time, users and language', async () => {
    const base = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

    // A — cold. First sight of this rulebook: it must be WRITTEN once.
    const a = await probe(base)
    row('A cold (first ever request)', a)

    // B — warm. Byte-identical repeat: it must be READ, not rewritten.
    const b = await probe(base)
    row('B warm (identical repeat)', b)

    // C — one minute later. The clock lives in `dynamic` now, so only the tail
    // changes. This is the exact case that used to re-bill the whole prefix.
    const later: SystemPrompt = {
      shared: base.shared,
      dynamic: base.dynamic.replace(/(\d{1,2}):(\d{2})/, (_m, h: string, mm: string) =>
        `${h}:${String((Number(mm) + 1) % 60).padStart(2, '0')}`),
    }
    expect(later.dynamic).not.toBe(base.dynamic)
    const c = await probe(later)
    row('C +1 minute (clock moved)', c)

    // D — a different user entirely: other memory, other preferences, other
    // language, GPS attached. Cross-user sharing used to be 0%.
    const other = buildSystem(null, 'offline', false, MEM_B, 'en', PREFS,
      { lat: 21.0285, lng: 105.8542, address: 'Hoan Kiem' }, null, false)
    expect(other.shared).toBe(base.shared)
    const d = await probe(other)
    row('D different user + lang + GPS', d)

    // E — a third shape, to show it is the rulebook being reused and not a fluke.
    const third = buildSystem(null, 'unknown', true, MEM_A, 'vi', '', null, 'trip', false)
    const e = await probe(third)
    row('E different user + trip mode', e)

    console.log(
      `\n  cache hit rate over B–E: ` +
      `${(([b, c, d, e].filter(s => s.read > 0).length / 4) * 100).toFixed(0)}%  ` +
      `(reads ${[b, c, d, e].reduce((n, s) => n + s.read, 0)} vs creates ${[b, c, d, e].reduce((n, s) => n + s.create, 0)})`,
    )

    // The contract: after the first write, the rulebook is never rewritten —
    // not by the clock, not by another user, not by another language.
    expect(a.create, 'A must write the rulebook').toBeGreaterThan(4096)
    expect(b.read, 'B must read it back').toBeGreaterThanOrEqual(a.create)
    expect(c.read, 'a new minute must NOT rewrite the rulebook').toBeGreaterThanOrEqual(a.create)
    expect(d.read, 'a different user must NOT rewrite the rulebook').toBeGreaterThanOrEqual(a.create)
    expect(e.read, 'a different mode must NOT rewrite the rulebook').toBeGreaterThanOrEqual(a.create)
    for (const [label, s] of [['C', c], ['D', d], ['E', e]] as const) {
      expect(s.create, `${label} must not create a second lineage`).toBe(0)
    }
  }, 180_000)
})
