// Replay harness — the three suites as one shape: conversations of user turns.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ReplayTurn { text: string; expect: string | null }
export interface Conversation { id: string; area: string | null; title?: string; turns: ReplayTurn[]; inject?: { field: 'title' | 'snippet'; text: string } }
export type SuiteName = 'scenarios' | 'firstTurns' | 'owner59' | 'androidR' | 'realTyping' | 'injection'
export const SUITES: SuiteName[] = ['scenarios', 'firstTurns', 'owner59', 'androidR']

const FIX = 'src/lib/ai/consultative/__fixtures__'
const OWNER_MANIFEST = 'C:/Users/Admin/AppData/Local/Temp/claude/D--Claude-Projects-TappyAI--worktrees-g1-growth/252826a6-7ad2-4155-ad14-6de6aee19cdd/scratchpad/c40-step2/review/manifest.json'
const OWNER_COPY = join('scripts', 'consult', 'replay', 'fixtures', 'owner59.json')

const AREAS = new Set(['food', 'shopping', 'travel', 'entertainment', 'spa'])
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

/**
 * PHIÊN LUNA (owner 30/09): the everyday-typing variants of each scenario's opening turns. `docs/uat/luna-real-typing.txt`:
 * "# <ID>" opens a conversation, each line "original | variant". The variant is sent; the scenario's `expect` of the same
 * turn index is kept. REPLAY_TYPING_SIDE=original sends the original line instead. Not part of `all` (run explicitly).
 */
export function loadRealTyping(file = 'docs/uat/luna-real-typing.txt'): Conversation[] {
  const f = read<{ scenarios: Array<{ id: string; domain: string; turns: Array<{ text: string; expect: string }> }> }>(`${FIX}/multiTurnScenarios.vi.json`)
  const byId = new Map(f.scenarios.map(s => [s.id, s]))
  const side = process.env.REPLAY_TYPING_SIDE === 'original' ? 0 : 1
  const out: Conversation[] = []
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^#\s*([A-Z]+-\d+)\s*$/.exec(line)
    if (head) { const sc = byId.get(head[1]); out.push({ id: head[1], area: sc?.domain ?? null, turns: [] }); continue }
    if (!line || line.startsWith('#') || !out.length) continue
    const parts = line.split('|').map(x => x.trim())
    if (parts.length < 2 || !parts[side]) continue
    const conv = out[out.length - 1]
    conv.turns.push({ text: parts[side], expect: byId.get(conv.id)?.turns[conv.turns.length]?.expect ?? null })
  }
  return out.filter(c => c.turns.length)
}

export function loadSuite(name: SuiteName): Conversation[] {
  if (name === 'realTyping') return loadRealTyping()
  if (name === 'injection') {
    const f = read<{ items: Array<{ id: string; domain: string | null; kind: string; inject?: Conversation['inject']; turns: ReplayTurn[] }> }>(join('scripts', 'consult', 'replay', 'fixtures', 'injectionCases.json'))
    return f.items.map(it => ({ id: it.id, area: it.domain, title: it.kind, turns: it.turns, ...(it.inject ? { inject: it.inject } : {}) }))
  }
  if (name === 'scenarios') {
    const f = read<{ scenarios: Array<{ id: string; domain: string; turns: Array<{ text: string; expect: string }> }> }>(`${FIX}/multiTurnScenarios.vi.json`)
    return f.scenarios.map(s => ({ id: s.id, area: s.domain, turns: s.turns.map(t => ({ text: t.text, expect: t.expect })) }))
  }
  if (name === 'androidR') {
    const f = read<{ items: Array<{ id: string; domain: string; turns: Array<{ text: string; expect: string | null }> }> }>(join('scripts', 'consult', 'replay', 'fixtures', 'androidRegressions.json'))
    return f.items.map(it => ({ id: it.id, area: it.domain, turns: it.turns }))
  }
  if (name === 'firstTurns') {
    const f = read<{ items: Array<{ text: string; domain: string }> }>(`${FIX}/intentEveryday.vi.json`)
    return f.items.map((it, i) => ({ id: `IE-${String(i + 1).padStart(3, '0')}`, area: it.domain, title: it.text, turns: [{ text: it.text, expect: null }] }))
  }
  const path = process.env.REPLAY_OWNER59_MANIFEST || (existsSync(OWNER_MANIFEST) ? OWNER_MANIFEST : OWNER_COPY)
  const f = read<{ items: Array<{ id: string; domain?: string; title?: string; turns: Array<{ q: string }> }> }>(path)
  return f.items.map(it => ({ id: it.id, area: it.domain && AREAS.has(it.domain) ? it.domain : null, title: it.title, turns: it.turns.map(t => ({ text: t.q, expect: null })) }))
}

/** REPLAY_ONLY=ENT-1,SPA-1 → only those ids (case-insensitive). */
export function filterOnly(convs: Conversation[], only = process.env.REPLAY_ONLY): Conversation[] {
  if (!only?.trim()) return convs
  const want = new Set(only.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))
  return convs.filter(c => want.has(c.id.toUpperCase()))
}

/** {pick}/{alt} from the PREVIOUS reply. Unresolved → left visible in the sent text and reported. */
export function fillPlaceholders(text: string, pick: string | null, alt: string | null): { text: string; unresolved: string[] } {
  const unresolved: string[] = []
  const out = text.replace(/\{(pick|alt)\}/g, (_m, k: string) => {
    const v = k === 'pick' ? pick : alt
    if (!v) { unresolved.push(k); return k === 'pick' ? 'chỗ đó' : 'chỗ kia' }
    return v
  })
  return { text: out, unresolved }
}
