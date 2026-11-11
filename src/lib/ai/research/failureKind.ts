// The KIND of a failed model call, for the log (11/11): the error's name, the first line of its message, how the answer ended (finishReason "length" = cut off), how many characters it had, and which
// fields of the schema it was refused on (paths and kinds only). Never the answer's text, never a value from it, never a nested message. Pure; never throws.

export interface FailureKind { name: string; message: string; finishReason?: string; textChars?: number; issues?: string[] }

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

export function failureKind(e: unknown): FailureKind {
  if (!e || typeof e !== 'object') return { name: 'unknown', message: '' }
  const x = e as Loose
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
  }
}
