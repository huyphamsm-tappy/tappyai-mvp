// ── Phase 8 M2 — persistent task state (TAPPY_AGENT=2) ────────────────────────────────────────────────────────────────────
//
// The TASK is what the user is trying to get done across turns (goal, constraints, entities, preferences, selected items, research
// progress, a pending question, a status). It is NOT the conversation: no message text is stored here — the conversation stays in the
// client-sent history. The task lives inside the chat-session state (consultative/chatSessionState.ts), whose storage key is
// sha256(owner ‖ chatSessionId): another user or another conversation can never read it.
//
// Ownership of meaning: LUNA decides what changed (the `update_task` control action — "dưới 300k", "cần máy lạnh", "thôi đổi sang
// quận 1" are Luna's to interpret). CODE owns ids, timestamps, schema validation, normalisation, caps, deterministic merging,
// sanitising (persisted strings are model-written and may echo third-party text, so they are cleaned and rendered only as fenced DATA),
// the research log (from executed tool calls), the pending question (from ask_user) and the lifecycle.
//
// Lifecycle: create (first agent turn of a conversation) → load (validate; stale / malformed / foreign → archived or discarded, traced)
// → update (Luna's deltas + code's research log + ask) → persist (with the chat-session state, after the reply) → next turn.

import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { cutSecrets, isInstructionLike } from '../guards'
import { neutralizeFenceMarkers } from '@/lib/ai/security/fence'

export const TASK_TYPES = ['local_discovery', 'shopping', 'travel_planning', 'comparison', 'troubleshooting', 'how_to', 'question', 'planning', 'other'] as const
export type TaskType = typeof TASK_TYPES[number]
export type TaskStatus = 'active' | 'waiting_user' | 'completed' | 'abandoned'

/** A task untouched this long is archived (abandoned) when the conversation resumes; a fresh task starts. */
export const TASK_STALE_MS = 7 * 24 * 3600_000

export const TASK_CAPS = { goal: 200, key: 40, value: 120, constraints: 16, preferences: 12, entities: 12, selected: 8, searches: 12, findings: 8, finding: 200, question: 300, history: 3, updatesPerTurn: 3 } as const

export interface TaskConstraint { key: string; value: string; hard: boolean; updated_at: string }
export interface TaskPreference { key: string; value: string; updated_at: string }
export interface TaskEntity { name: string; kind: string }
export interface TaskSelected { name: string; note: string }
export interface TaskSearch { tool: string; query: string; results: number; turn: number; at: string }

export interface AgentTask {
  v: 1
  task_id: string
  /** sha256 of the chatSessionId (never the raw id) — a task is only ever loaded under the same conversation. */
  conversation_id: string
  task_type: TaskType
  goal: string
  constraints: TaskConstraint[]
  entities: TaskEntity[]
  preferences: TaskPreference[]
  selected_items: TaskSelected[]
  research_state: { searches: TaskSearch[]; findings: string[] }
  pending_question: { text: string; choices: string[]; asked_at: string } | null
  status: TaskStatus
  created_at: string
  updated_at: string
  /** Agent turns this task has been worked on (1 on creation). */
  turns: number
  /** Optimistic version: +1 on every persisted change (concurrent turns merge, they never silently overwrite). */
  rev: number
}

/** What is kept of a finished / switched-away task: enough to say "the previous task was …", no constraints or research. */
export interface TaskSummary { task_id: string; task_type: TaskType; goal: string; status: TaskStatus; updated_at: string }

// ── ids / sanitising ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const conversationIdOf = (chatSessionId: string | null | undefined): string | null =>
  chatSessionId ? createHash('sha256').update(`task-conv|${chatSessionId}`).digest('hex').slice(0, 32) : null

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/**
 * A persisted string: secret / contact shapes cut, URLs and markup markers removed, fence markers neutralised, whitespace collapsed,
 * capped. An instruction-like value ("ignore previous instructions…") is dropped entirely (returns '').
 */
export function cleanTaskText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  let s = neutralizeFenceMarkers(v).replace(/https?:\/\/\S+|www\.\S+/gi, ' ').replace(/\[\/?[A-Z_]{3,}\]/g, ' ').replace(/<<<|>>>/g, ' ')
  s = cutSecrets(s).text.replace(/\s+/g, ' ').trim()
  if (!s || isInstructionLike(s)) return ''
  return s.slice(0, max)
}

/** A constraint / preference key: folded, a-z0-9_ slug — "Ngân sách" and "ngan_sach" are the same key. */
export function taskKey(v: unknown): string {
  const s = fold(cleanTaskText(v, 80)).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return s.slice(0, TASK_CAPS.key)
}

// ── schema (load-time validation) ─────────────────────────────────────────────────────────────────────────────────────────────

const iso = z.string().min(10).max(40)
const TaskSchema = z.object({
  v: z.literal(1),
  task_id: z.string().uuid(),
  conversation_id: z.string().regex(/^[0-9a-f]{32}$/),
  task_type: z.enum(TASK_TYPES),
  goal: z.string().max(TASK_CAPS.goal),
  constraints: z.array(z.object({ key: z.string().min(1).max(TASK_CAPS.key), value: z.string().max(TASK_CAPS.value), hard: z.boolean(), updated_at: iso })).max(TASK_CAPS.constraints),
  entities: z.array(z.object({ name: z.string().min(1).max(100), kind: z.string().max(30) })).max(TASK_CAPS.entities),
  preferences: z.array(z.object({ key: z.string().min(1).max(TASK_CAPS.key), value: z.string().max(TASK_CAPS.value), updated_at: iso })).max(TASK_CAPS.preferences),
  selected_items: z.array(z.object({ name: z.string().min(1).max(100), note: z.string().max(TASK_CAPS.value) })).max(TASK_CAPS.selected),
  research_state: z.object({
    searches: z.array(z.object({ tool: z.string().max(40), query: z.string().max(TASK_CAPS.value), results: z.number().int().min(0).max(1000), turn: z.number().int().min(0), at: iso })).max(TASK_CAPS.searches),
    findings: z.array(z.string().max(TASK_CAPS.finding)).max(TASK_CAPS.findings),
  }),
  pending_question: z.object({ text: z.string().min(1).max(TASK_CAPS.question + 1), choices: z.array(z.string().max(60)).max(4), asked_at: iso }).nullable(),
  status: z.enum(['active', 'waiting_user', 'completed', 'abandoned']),
  created_at: iso,
  updated_at: iso,
  turns: z.number().int().min(0),
  rev: z.number().int().min(0),
})

export type TaskLoadOutcome = 'created' | 'loaded' | 'stale_archived' | 'invalid_discarded' | 'foreign_discarded' | 'closed_kept'

/**
 * The task this turn works on. Never throws. A stored task is used only when it validates AND belongs to this conversation; a stale one
 * (untouched > 7 days) is archived as abandoned and a fresh task starts; anything malformed is discarded (traced, not silently).
 */
export function loadTask(stored: unknown, history: unknown, o: { conversationId: string | null; now: Date }): { task: AgentTask; history: TaskSummary[]; outcome: TaskLoadOutcome; problem?: string } {
  const hist = Array.isArray(history) ? history.filter(isSummary).slice(-TASK_CAPS.history) : []
  const fresh = () => createTask(o.conversationId, o.now)
  if (stored === undefined || stored === null) return { task: fresh(), history: hist, outcome: 'created' }
  const parsed = TaskSchema.safeParse(stored)
  if (!parsed.success) return { task: fresh(), history: hist, outcome: 'invalid_discarded', problem: parsed.error.issues[0]?.path.join('.').slice(0, 60) || 'schema' }
  const t = parsed.data as AgentTask
  if (!o.conversationId || t.conversation_id !== o.conversationId) return { task: fresh(), history: hist, outcome: 'foreign_discarded' }
  if (o.now.getTime() - Date.parse(t.updated_at) > TASK_STALE_MS) {
    return { task: fresh(), history: [...hist, summaryOf({ ...t, status: t.status === 'completed' ? 'completed' : 'abandoned' })].slice(-TASK_CAPS.history), outcome: 'stale_archived' }
  }
  return { task: { ...t, turns: t.turns + 1 }, history: hist, outcome: t.status === 'completed' || t.status === 'abandoned' ? 'closed_kept' : 'loaded' }
}

/** The stored task as-is when it validates and belongs to this conversation, else null (used for the concurrent-save merge). */
export function validStoredTask(raw: unknown, conversationId: string | null): AgentTask | null {
  const p = TaskSchema.safeParse(raw)
  return p.success && conversationId && p.data.conversation_id === conversationId ? p.data as AgentTask : null
}

function isSummary(x: unknown): x is TaskSummary {
  const s = x as TaskSummary
  return !!s && typeof s === 'object' && typeof s.task_id === 'string' && typeof s.goal === 'string' && (TASK_TYPES as readonly string[]).includes(s.task_type) && ['active', 'waiting_user', 'completed', 'abandoned'].includes(s.status)
}

export function createTask(conversationId: string | null, now: Date): AgentTask {
  const at = now.toISOString()
  return {
    v: 1, task_id: randomUUID(), conversation_id: conversationId ?? '0'.repeat(32), task_type: 'other', goal: '',
    constraints: [], entities: [], preferences: [], selected_items: [], research_state: { searches: [], findings: [] },
    pending_question: null, status: 'active', created_at: at, updated_at: at, turns: 1, rev: 0,
  }
}

export const summaryOf = (t: AgentTask): TaskSummary => ({ task_id: t.task_id, task_type: t.task_type, goal: t.goal, status: t.status, updated_at: t.updated_at })

// ── Luna's delta (the update_task control action) ─────────────────────────────────────────────────────────────────────────────

export interface TaskDelta {
  new_task?: boolean
  task_type?: string
  goal?: string
  set_constraints?: Array<{ key?: string; value?: string; hard?: boolean }>
  remove_constraints?: string[]
  set_preferences?: Array<{ key?: string; value?: string }>
  add_entities?: Array<{ name?: string; kind?: string }>
  selected_items?: Array<{ name?: string; note?: string }>
  add_findings?: string[]
  status?: string
}

export interface DeltaResult { task: AgentTask; history: TaskSummary[]; applied: string[]; rejected: string[] }

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/**
 * Applies Luna's delta deterministically: validated, cleaned, capped. Keys merge by folded slug (newer wins); a constraint/preference
 * with an empty value is a removal. `new_task` archives the current task (abandoned unless it was completed) and starts a fresh one
 * that keeps nothing of the old one. Never throws; what could not be applied is reported back (to the model and the trace).
 */
export function applyTaskDelta(task: AgentTask, history: readonly TaskSummary[], raw: unknown, o: { now: Date; conversationId: string | null }): DeltaResult {
  const d = (raw && typeof raw === 'object' ? raw : {}) as TaskDelta
  const at = o.now.toISOString()
  const applied: string[] = []
  const rejected: string[] = []
  let t: AgentTask = { ...task, constraints: [...task.constraints], preferences: [...task.preferences], entities: [...task.entities], selected_items: [...task.selected_items], research_state: { searches: [...task.research_state.searches], findings: [...task.research_state.findings] } }
  let hist = [...history]

  if (d.new_task === true) {
    const old = summaryOf({ ...t, status: t.status === 'completed' ? 'completed' : 'abandoned', updated_at: at })
    if (t.goal || t.constraints.length || t.research_state.searches.length) hist = [...hist, old].slice(-TASK_CAPS.history)
    t = { ...createTask(o.conversationId, o.now), turns: 1 }
    applied.push('new_task')
  }
  if (typeof d.task_type === 'string') {
    const ty = taskKey(d.task_type) as TaskType
    if ((TASK_TYPES as readonly string[]).includes(ty)) { t.task_type = ty; applied.push('task_type') } else { t.task_type = t.task_type === 'other' ? 'other' : t.task_type; rejected.push('task_type') }
  }
  if (d.goal !== undefined) {
    const g = cleanTaskText(d.goal, TASK_CAPS.goal)
    if (g) { t.goal = g; applied.push('goal') } else rejected.push('goal')
  }
  for (const k of arr<string>(d.remove_constraints)) {
    const key = taskKey(k)
    const before = t.constraints.length
    t.constraints = t.constraints.filter(c => c.key !== key)
    if (t.constraints.length < before) applied.push(`remove:${key}`)
  }
  for (const c of arr<{ key?: string; value?: string; hard?: boolean }>(d.set_constraints)) {
    const key = taskKey(c?.key)
    if (!key) { rejected.push('constraint_key'); continue }
    const value = cleanTaskText(c?.value, TASK_CAPS.value)
    t.constraints = t.constraints.filter(x => x.key !== key)
    if (!value) { applied.push(`remove:${key}`); continue }
    t.constraints.push({ key, value, hard: c?.hard === true, updated_at: at })
    applied.push(`constraint:${key}`)
  }
  if (t.constraints.length > TASK_CAPS.constraints) { rejected.push('constraints_capped'); t.constraints = t.constraints.slice(-TASK_CAPS.constraints) }
  for (const p of arr<{ key?: string; value?: string }>(d.set_preferences)) {
    const key = taskKey(p?.key)
    if (!key) { rejected.push('preference_key'); continue }
    const value = cleanTaskText(p?.value, TASK_CAPS.value)
    t.preferences = t.preferences.filter(x => x.key !== key)
    if (!value) { applied.push(`unprefer:${key}`); continue }
    t.preferences.push({ key, value, updated_at: at })
    applied.push(`preference:${key}`)
  }
  if (t.preferences.length > TASK_CAPS.preferences) t.preferences = t.preferences.slice(-TASK_CAPS.preferences)
  for (const e of arr<{ name?: string; kind?: string }>(d.add_entities)) {
    const name = cleanTaskText(e?.name, 100)
    if (!name) { rejected.push('entity'); continue }
    if (t.entities.some(x => fold(x.name) === fold(name))) continue
    t.entities.push({ name, kind: taskKey(e?.kind) || 'item' })
    applied.push('entity')
  }
  if (t.entities.length > TASK_CAPS.entities) t.entities = t.entities.slice(-TASK_CAPS.entities)
  if (d.selected_items !== undefined) {
    const items = arr<{ name?: string; note?: string }>(d.selected_items).map(s => ({ name: cleanTaskText(s?.name, 100), note: cleanTaskText(s?.note, TASK_CAPS.value) })).filter(s => s.name).slice(0, TASK_CAPS.selected)
    t.selected_items = items
    applied.push('selected_items')
  }
  for (const f of arr<string>(d.add_findings)) {
    const s = cleanTaskText(f, TASK_CAPS.finding)
    if (!s) { rejected.push('finding'); continue }
    if (!t.research_state.findings.includes(s)) t.research_state.findings = [...t.research_state.findings, s].slice(-TASK_CAPS.findings)
    applied.push('finding')
  }
  if (typeof d.status === 'string') {
    if (d.status === 'completed' || d.status === 'abandoned' || d.status === 'active') { t.status = d.status; applied.push(`status:${d.status}`) } else rejected.push('status')
  } else if (applied.length && (t.status === 'completed' || t.status === 'abandoned')) {
    t.status = 'active' // more work on a closed task reopens it
    applied.push('status:reopened')
  }
  if (applied.length) t.updated_at = at
  return { task: t, history: hist, applied, rejected }
}

// ── code-owned updates: research log, ask, end of turn ────────────────────────────────────────────────────────────────────────

const SEARCH_TOOLS = new Set(['search_places', 'web_search', 'search_products', 'get_hotel_prices', 'get_flight_prices', 'get_transport_options', 'get_news', 'get_now_showing', 'get_movie_showtimes', 'get_trip_data', 'get_weather', 'get_gold_price'])

/** Records the executed lookups of this turn (successful ones), newest last, de-duplicated by tool + query. */
export function recordResearch(task: AgentTask, done: ReadonlyArray<{ name: string; args: Record<string, unknown>; outcome: string; results: number }>, now: Date): AgentTask {
  const at = now.toISOString()
  let searches = [...task.research_state.searches]
  for (const e of done) {
    if (e.outcome !== 'ok' || !SEARCH_TOOLS.has(e.name)) continue
    const q = cleanTaskText(e.args.query ?? e.args.destination ?? e.args.location ?? e.args.movieTitle ?? [e.args.origin, e.args.destination].filter(Boolean).join(' → '), TASK_CAPS.value)
    searches = searches.filter(s => !(s.tool === e.name && s.query === q))
    searches.push({ tool: e.name, query: q, results: Math.max(0, Math.min(1000, e.results | 0)), turn: task.turns, at })
  }
  if (searches.length === task.research_state.searches.length && searches.every((s, i) => s === task.research_state.searches[i])) return task
  return { ...task, research_state: { ...task.research_state, searches: searches.slice(-TASK_CAPS.searches) }, updated_at: at }
}

/**
 * End of the turn. An ask → the question is pending and the task waits for the user. Otherwise the question the user was asked last
 * turn is considered answered by this turn's message (cleared) and a waiting task becomes active again. Luna's explicit status wins.
 */
export function finishTurn(task: AgentTask, o: { asked: { question: string; choices: string[] } | null; now: Date }): AgentTask {
  const at = o.now.toISOString()
  if (o.asked) return { ...task, pending_question: { text: o.asked.question.slice(0, TASK_CAPS.question + 1), choices: o.asked.choices.slice(0, 4), asked_at: at }, status: task.status === 'completed' || task.status === 'abandoned' ? 'active' : 'waiting_user', updated_at: at }
  if (task.pending_question || task.status === 'waiting_user') return { ...task, pending_question: null, status: task.status === 'waiting_user' ? 'active' : task.status, updated_at: at }
  return task
}

/**
 * Concurrent turns of one conversation (two tabs, a double send): the store may already hold a NEWER revision than the one this turn
 * started from. Never overwrite it silently:
 *   · nobody wrote since we loaded                     → ours (rev + 1)
 *   · the other turn moved to a different task          → theirs is kept (the newer decision about WHICH task)
 *   · we moved to a new task (new_task)                 → ours (rev past theirs)
 *   · both changed the SAME task                        → field merge: constraints / preferences by key (newer timestamp wins, our
 *                                                         removals kept), entities / findings unioned, searches by tool+query.
 */
export function mergeForSave(base: AgentTask, ours: AgentTask, stored: AgentTask | null): { task: AgentTask; outcome: 'ours' | 'kept_theirs' | 'merged' } {
  if (!stored || stored.rev <= base.rev) return { task: { ...ours, rev: base.rev + 1 }, outcome: 'ours' }
  if (stored.task_id !== base.task_id) return { task: stored, outcome: 'kept_theirs' }
  if (ours.task_id !== base.task_id) return { task: { ...ours, rev: stored.rev + 1 }, outcome: 'ours' }
  const byKey = <T extends { key: string; updated_at: string }>(a: T[], b: T[]) => {
    const m = new Map<string, T>()
    for (const x of [...a, ...b]) { const p = m.get(x.key); if (!p || p.updated_at <= x.updated_at) m.set(x.key, x) }
    return [...m.values()]
  }
  const removedByUs = new Set(base.constraints.map(c => c.key).filter(k => !ours.constraints.some(c => c.key === k)))
  const merged: AgentTask = {
    ...ours,
    goal: ours.goal || stored.goal,
    constraints: byKey(stored.constraints, ours.constraints).filter(c => !removedByUs.has(c.key)).slice(-TASK_CAPS.constraints),
    preferences: byKey(stored.preferences, ours.preferences).slice(-TASK_CAPS.preferences),
    entities: [...stored.entities, ...ours.entities.filter(e => !stored.entities.some(x => fold(x.name) === fold(e.name)))].slice(-TASK_CAPS.entities),
    research_state: {
      searches: [...stored.research_state.searches.filter(x => !ours.research_state.searches.some(y => y.tool === x.tool && y.query === x.query)), ...ours.research_state.searches].slice(-TASK_CAPS.searches),
      findings: [...new Set([...stored.research_state.findings, ...ours.research_state.findings])].slice(-TASK_CAPS.findings),
    },
    turns: Math.max(ours.turns, stored.turns),
    rev: stored.rev + 1,
  }
  return { task: merged, outcome: 'merged' }
}

// ── the compact context Luna reads (fenced DATA, never instructions) ───────────────────────────────────────────────────────────

const ago = (iso: string, now: Date) => { const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000)); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước` }

/**
 * A few lines (≤ ~900 chars), not the task object: only what helps the next step. Empty task on its first turn → only the id line.
 * The lines go into the DATA block (agentContext `extra`), which is fenced and stripped of fence markers.
 */
export function taskContextLines(t: AgentTask, history: readonly TaskSummary[], now: Date): string[] {
  const out: string[] = []
  const status = t.status === 'completed' ? ' (đã xong — tiếp tục thì cập nhật, việc khác hẳn thì new_task)' : t.status === 'abandoned' ? ' (đã bỏ)' : ''
  out.push(t.goal ? `Nhiệm vụ đang làm (lượt ${t.turns}): ${t.goal} [${t.task_type}]${status}` : `Nhiệm vụ: mới (lượt ${t.turns}) — chưa có mục tiêu; đặt bằng update_task nếu đây là một việc cần nhiều lượt.`)
  if (t.constraints.length) out.push(`Ràng buộc: ${t.constraints.map(c => `${c.key}: ${c.value}${c.hard ? ' (bắt buộc)' : ''}`).join(' · ')}`)
  if (t.preferences.length) out.push(`Ưu tiên: ${t.preferences.map(p => `${p.key}: ${p.value}`).join(' · ')}`)
  if (t.entities.length) out.push(`Đối tượng: ${t.entities.map(e => e.name).join(' · ')}`)
  if (t.selected_items.length) out.push(`Người dùng đã chọn: ${t.selected_items.map(s => s.note ? `${s.name} (${s.note})` : s.name).join(' · ')}`)
  const recent = t.research_state.searches.slice(-5)
  if (recent.length) out.push(`Đã tra: ${recent.map(s => `${s.tool} "${s.query}" (${s.results} kết quả, ${ago(s.at, now)})`).join(' · ')}`)
  if (t.research_state.findings.length) out.push(`Ghi chú nghiên cứu: ${t.research_state.findings.slice(-4).join(' · ')}`)
  if (t.pending_question) out.push(`Bạn vừa hỏi người dùng: "${t.pending_question.text}" — tin nhắn mới nhất có thể là câu trả lời.`)
  const prev = history.slice(-1)[0]
  if (prev && prev.task_id !== t.task_id && prev.goal) out.push(`Việc trước đó: ${prev.goal} (${prev.status === 'completed' ? 'đã xong' : 'đã dừng'})`)
  // Hard cap: the block must stay small whatever the task holds.
  let total = 0
  return out.filter(l => (total += l.length) <= 900)
}

/** A compact view for the update_task result the model reads back (no ids, no timestamps). */
export function taskView(t: AgentTask): Record<string, unknown> {
  return { goal: t.goal, task_type: t.task_type, status: t.status, constraints: t.constraints.map(c => `${c.key}: ${c.value}`), preferences: t.preferences.map(p => `${p.key}: ${p.value}`), selected_items: t.selected_items.map(s => s.name) }
}
