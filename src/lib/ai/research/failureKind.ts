// The KIND of a failed model call, for the log (11/11): the error's name, the first line of its message, how the answer ended (finishReason "length" = cut off), how many characters it had, and which
// fields of the schema it was refused on (paths and kinds only). Never the answer's text, never a value from it, never a nested message. Pure; never throws.

export interface FailureKind { name: string; message: string; finishReason?: string; textChars?: number; issues?: string[]; /** 18/11: the top-level fields of the refused answer and their kinds ("sections:absent", "thesis:string", "doubts:array[2]"), given only for the fields in `expect`; never a value */ shape?: string[] }

/**
 * The shape of a refused JSON answer, for the fields the caller names: each as "name:kind" where kind is absent, string, number, boolean, null, array[n] or object[n keys]. Never a value. null when the
 * text is not a JSON object. Pure; never throws.
 */
export function answerShape(text: unknown, expect: readonly string[]): string[] | null {
  if (typeof text !== 'string') return null
  let v: unknown
  try { v = JSON.parse(text) } catch { return null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return expect.map(k => {
    const x = o[k]
    if (x === undefined) return `${k}:absent`
    if (x === null) return `${k}:null`
    if (Array.isArray(x)) return `${k}:array[${x.length}]`
    if (typeof x === 'object') return `${k}:object[${Object.keys(x as object).length}]`
    return `${k}:${typeof x}`
  })
}

/** The line added to a second try after the schema refused the first answer: which fields it refused, and that every required field is to be returned in full. Empty when nothing is known. Pure. */
export function retryHint(issues: readonly string[] | undefined, required: string): string {
  const fields = [...new Set((issues ?? []).map(i => i.split(':')[0].split('.')[0]).filter(Boolean))]
  if (!fields.length) return ''
  return `\n\nYour previous answer was refused: ${fields.join(', ')} ${fields.length > 1 ? 'were' : 'was'} missing or of the wrong kind. Return the whole object this time: ${required}.`
}

type Loose = { name?: unknown; message?: unknown; finishReason?: unknown; text?: unknown; cause?: unknown; issues?: unknown }

/** The zod-style issues found along the cause chain (a few levels), or []. */
function issuesOf(e: unknown): Array<{ path?: unknown; code?: unknown; expected?: unknown }> {
  let cur: unknown = e
  for (let depth = 0; depth < 5 && cur && typeof cur === 'object'; depth++) {
    const x = cur as Loose
    if (Array.isArray(x.issues)) return x.issues as Array<{ path?: unknown; code?: unknown; expected?: unknown }>
    cur = x.cause
  }
  return []
}

export function failureKind(e: unknown, expect: readonly string[] = []): FailureKind {
  if (!e || typeof e !== 'object') return { name: 'unknown', message: '' }
  const x = e as Loose
  const shape = expect.length ? answerShape(x.text, expect) : null
  const issues = issuesOf(e).slice(0, 8).map(i => {
    const path = Array.isArray(i.path) ? i.path.map(String).join('.') : ''
    return `${path}:${typeof i.code === 'string' ? i.code : '?'}${typeof i.expected === 'string' ? `(${i.expected})` : ''}`
  })
  return {
    name: typeof x.name === 'string' ? x.name : 'Error',
    message: String(typeof x.message === 'string' ? x.message : '').split('\n')[0].slice(0, 120),
    ...(typeof x.finishReason === 'string' ? { finishReason: x.finishReason } : {}),
    ...(typeof x.text === 'string' ? { textChars: x.text.length } : {}),
    ...(issues.length ? { issues } : {}),
    ...(shape ? { shape } : {}),
  }
}
