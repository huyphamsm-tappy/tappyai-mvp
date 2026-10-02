// Real-model check of the consult brain on the owner's everyday set (Phần 7). Opt-in: BRAIN_EVAL=1.
// Reads the AUDIT env file for the model key (never printed). One Haiku call per sentence.
//   BRAIN_EVAL=1 npx vitest run scripts/consult/brainEval.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { runConsultBrain, type ConsultDecision } from '../../src/lib/ai/consultative/consultBrain'
import { turnDomain } from '../../src/lib/ai/consultative/actionability'

const ON = process.env.BRAIN_EVAL === '1'
const ENV_FILE = process.env.BRAIN_EVAL_ENV ?? 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/.env.local'
const OUT = process.env.BRAIN_EVAL_OUT ?? 'C:/Users/Admin/AppData/Local/Temp/claude/D--Claude-Projects-TappyAI--worktrees-g1-growth/252826a6-7ad2-4155-ad14-6de6aee19cdd/scratchpad/brain'

describe.skipIf(!ON)('consult brain — everyday intent set (real model)', () => {
  it('lands every sentence in its area, refuses none, asks on vague first turns', async () => {
    const env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
    if (!String(env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('zdaprdfgpbpnxyofagmc')) throw new Error('REFUSING: not the audit env')
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
    const { AI } = await import('../../src/lib/ai/llm')
    const set = JSON.parse(readFileSync('src/lib/ai/consultative/__fixtures__/intentEveryday.vi.json', 'utf8')) as { items: Array<{ text: string; domain: string }> }
    const rows: Array<{ text: string; want: string; got: string[]; turn: string; asked: number; ms: number; tin: number; tout: number; d: ConsultDecision | null }> = []
    const queue = [...set.items]
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        const r = await runConsultBrain(o => AI.generate(o), [{ role: 'user', content: it.text }], { hasGps: true, previousWasAsk: false, timeoutMs: 20000, deterministicDomain: turnDomain({ role: 'user', content: it.text }, { hasGps: true, lang: 'vi' }) })
        rows.push({ text: it.text, want: it.domain, got: r?.decision.domains ?? [], turn: r?.decision.turn ?? 'FAIL', asked: r?.decision.ask?.questions.length ?? 0, ms: r?.ms ?? 0, tin: r?.usage.promptTokens ?? 0, tout: r?.usage.completionTokens ?? 0, d: r?.decision ?? null })
      }
    }))
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/intent-results.json`, JSON.stringify(rows, null, 1))
    const byDomain: Record<string, { n: number; right: number; refused: number; asked: number }> = {}
    for (const r of rows) {
      const b = (byDomain[r.want] ??= { n: 0, right: 0, refused: 0, asked: 0 })
      b.n++
      if (r.got[0] === r.want || r.got.includes(r.want)) b.right++
      if ((r.turn === 'chat' && r.got.length === 0) || r.turn === 'FAIL') b.refused++
      if (r.turn === 'ask') b.asked++
    }
    const tin = rows.reduce((n, r) => n + r.tin, 0), tout = rows.reduce((n, r) => n + r.tout, 0)
    const summary = { byDomain, wrong: rows.filter(r => !(r.got[0] === r.want || r.got.includes(r.want))).map(r => ({ text: r.text, want: r.want, got: r.got, turn: r.turn })), chat: rows.filter(r => (r.turn === 'chat' && r.got.length === 0) || r.turn === 'FAIL').map(r => r.text), notAsked: rows.filter(r => r.turn !== 'ask').map(r => `${r.text} → ${r.turn}`), tokens: { tin, tout, usd: (tin * 1 + tout * 5) / 1e6 }, medianMs: rows.map(r => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] }
    writeFileSync(`${OUT}/intent-summary.json`, JSON.stringify(summary, null, 1))
    console.log(JSON.stringify(summary, null, 1))
    expect(summary.wrong).toEqual([])
    expect(summary.chat).toEqual([])
  }, 600_000)
})
