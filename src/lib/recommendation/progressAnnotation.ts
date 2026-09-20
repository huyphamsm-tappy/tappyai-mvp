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

export type ProgressStage = 'found' | 'writing' | 'finishing'

export interface ProgressAnnotation {
  kind: typeof PROGRESS_ANNOTATION_KIND
  v: 1
  stage: ProgressStage
  /** Rows the search returned (stage `found`). */
  count?: number
  text: string
}

const COPY: Record<ProgressStage, { vi: (n?: number) => string; en: (n?: number) => string }> = {
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
    if (c.stage !== 'found' && c.stage !== 'writing' && c.stage !== 'finishing') continue
    latest = { kind: PROGRESS_ANNOTATION_KIND, v: 1, stage: c.stage, text: c.text, ...(typeof c.count === 'number' ? { count: c.count } : {}) }
  }
  return latest
}
