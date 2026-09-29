// Replay harness — the three suites as one shape: conversations of user turns.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ReplayTurn { text: string; expect: string | null }
export interface Conversation { id: string; area: string | null; title?: string; turns: ReplayTurn[] }
export type SuiteName = 'scenarios' | 'firstTurns' | 'owner59' | 'androidR'
export const SUITES: SuiteName[] = ['scenarios', 'firstTurns', 'owner59', 'androidR']

const FIX = 'src/lib/ai/consultative/__fixtures__'
const OWNER_MANIFEST = 'C:/Users/Admin/AppData/Local/Temp/claude/D--Claude-Projects-TappyAI--worktrees-g1-growth/252826a6-7ad2-4155-ad14-6de6aee19cdd/scratchpad/c40-step2/review/manifest.json'
const OWNER_COPY = join('scripts', 'consult', 'replay', 'fixtures', 'owner59.json')

const AREAS = new Set(['food', 'shopping', 'travel', 'entertainment', 'spa'])
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

export function loadSuite(name: SuiteName): Conversation[] {
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
