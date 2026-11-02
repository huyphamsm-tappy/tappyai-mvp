// ── TURN PROGRESS — what the pipeline is actually doing, on the wire (A1(b), 2026-09-20) ──────────
//
// Measured on both surfaces: a place turn shows a rotating generic hint ("Tappy đang suy nghĩ…")
// for the 13–17 s the prose is buffered, because the only progress signal the client had was the
// tool invocation state — and with the pre-search (A1(c)) the call and its result arrive in the
// same instant, so even "🔎 Đang tìm địa điểm…" is gone before it is read. These frames say what
// is true at the moment they are written: how many rows the search returned, that the reply is
// being written from them, that it is being checked and the photos fetched.
//
// An `8:` message annotation, like the place decision — never text, so it cannot reach the
// message body, TTS, copy or persistence — gated on its own `kind` so a client that does not
// know it skips it (Android `ChatStreamFrames` filters by kind; iOS treats `8:` as unknown).
// `text` is written in the turn's language on the server so both clients show one sentence.

export const PROGRESS_ANNOTATION_KIND = 'tappy.progress.v1' as const

// C2_PROGRESS (P1, agent runtime, default off): `thinking` = the turn has started (written before the first model round), `researching` = a
// lookup of one KIND has started (fixed copy per tool kind, c2Policy.progressLabelForTool). Neither ever carries the user's words, a query or data.
export type ProgressStage = 'thinking' | 'searching' | 'researching' | 'found' | 'writing' | 'finishing'
const STAGES: ReadonlySet<string> = new Set<ProgressStage>(['thinking', 'searching', 'researching', 'found', 'writing', 'finishing'])

export interface ProgressAnnotation {
  kind: typeof PROGRESS_ANNOTATION_KIND
  v: 1
  stage: ProgressStage
  /** Rows the search returned (stage `found`). */
  count?: number
  text: string
}

const COPY: Record<ProgressStage, { vi: (n?: number) => string; en: (n?: number) => string }> = {
  thinking: { vi: () => 'Tappy đang suy nghĩ…', en: () => 'Tappy is thinking…' },
  researching: { vi: () => 'Đang tra cứu…', en: () => 'Looking things up…' },
  searching: { vi: () => 'Đang tìm chỗ quanh bạn…', en: () => 'Searching places around you…' },
  found: {
    vi: n => (n && n > 0 ? `Đã có ${n} chỗ phù hợp — đang chọn cho bạn…` : 'Đang xem kết quả tìm được…'),
    en: n => (n && n > 0 ? `Found ${n} matching places — choosing for you…` : 'Looking at what was found…'),
  },
  writing: { vi: () => 'Đang viết gợi ý…', en: () => 'Writing the suggestion…' },
  finishing: { vi: () => 'Đang kiểm tra thông tin và lấy ảnh…', en: () => 'Checking details and fetching photos…' },
}

export function buildProgressAnnotation(stage: ProgressStage, lang: string, count?: number): ProgressAnnotation {
  const copy = COPY[stage][lang === 'en' ? 'en' : 'vi']
  return { kind: PROGRESS_ANNOTATION_KIND, v: 1, stage, ...(typeof count === 'number' && count >= 0 ? { count } : {}), text: copy(count) }
}

/** Client: the LATEST progress frame among a message's annotations, or null. */
export function readProgress(annotations: unknown[] | undefined | null): ProgressAnnotation | null {
  if (!Array.isArray(annotations)) return null
  let latest: ProgressAnnotation | null = null
  for (const a of annotations) {
    if (!a || typeof a !== 'object') continue
    const c = a as Partial<ProgressAnnotation>
    if (c.kind !== PROGRESS_ANNOTATION_KIND || typeof c.text !== 'string' || !c.text) continue
    if (typeof c.stage !== 'string' || !STAGES.has(c.stage)) continue
    latest = { kind: PROGRESS_ANNOTATION_KIND, v: 1, stage: c.stage, text: c.text, ...(typeof c.count === 'number' ? { count: c.count } : {}) }
  }
  return latest
}

/** The "searching" progress frame as one data-stream line (`8:` annotation). Shared by the consult pre-search and the agent runtimes. */
export function searchingFrame(lang: string): string {
  return '8:' + JSON.stringify([buildProgressAnnotation('searching', lang)]) + '\n'
}

// ── C2 P2 · the turn's END state, as its own annotation (never text appended to the answer) ──────────────────────────────────────────────────────
// `incomplete`  — the answer stops early (still cut after the one rescue, or the request budget / deadline ended it); what was sent stays as is.
// `interrupted` — a server / provider error broke the answer while it was streaming; the part already shown stays, the question is refunded.
// The client shows its own fixed status line for it (never inserted into the assistant text), and keeps it with the message.
export const TURN_STATUS_KIND = 'tappy.turn_status.v1' as const
export type TurnStatusValue = 'incomplete' | 'interrupted'
export interface TurnStatusAnnotation { kind: typeof TURN_STATUS_KIND; v: 1; status: TurnStatusValue; reason: string }

export function turnStatusFrame(status: TurnStatusValue, reason: string): string {
  const a: TurnStatusAnnotation = { kind: TURN_STATUS_KIND, v: 1, status, reason: String(reason).slice(0, 40) }
  return '8:' + JSON.stringify([a]) + '\n'
}

/** Client: the turn status among a message's annotations (the last one wins), or null. Unknown values are ignored. */
export function readTurnStatus(annotations: unknown[] | undefined | null): TurnStatusAnnotation | null {
  if (!Array.isArray(annotations)) return null
  let out: TurnStatusAnnotation | null = null
  for (const a of annotations) {
    const c = a as Partial<TurnStatusAnnotation> | null
    if (!c || typeof c !== 'object' || c.kind !== TURN_STATUS_KIND) continue
    if (c.status !== 'incomplete' && c.status !== 'interrupted') continue
    out = { kind: TURN_STATUS_KIND, v: 1, status: c.status, reason: typeof c.reason === 'string' ? c.reason.slice(0, 40) : '' }
  }
  return out
}

/**
 * C2_PROGRESS: one status line (`8:` annotation) with server-written copy. `text` must be fixed copy chosen by the server (c2Policy labels) —
 * never the user's words, a query, a tool argument or tool data. Without `text` the stage's own copy is used.
 */
export function statusFrame(stage: ProgressStage, lang: string, text?: string): string {
  const a = buildProgressAnnotation(stage, lang)
  return '8:' + JSON.stringify([text ? { ...a, text } : a]) + '\n'
}
