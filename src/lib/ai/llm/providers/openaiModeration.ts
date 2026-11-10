/**
 * OpenAI moderation adapter: the ONE place the picture-safety scan of the Messenger (and the Explore video moderation) talks to the provider and reads its key (the architecture guard
 * allows vendor keys only in this layer). It sends one picture, or some text, to the moderation endpoint (model `omni-moderation-latest`, which accepts images and text and is free
 * of charge) and returns the provider's category flags and, when it sends them, the category scores. What to DO with them (which categories block, what an unavailable scan means)
 * is decided by the caller: src/lib/messaging/imageScan.ts for chat pictures, src/lib/media/video/moderationPolicy.ts for video.
 *
 * Never throws and never logs the key, the picture or the text. Anything that is not a clean answer (no key, timeout, HTTP error, unreadable body) is `unavailable`: fail closed.
 */
export type ModerationOutcome =
  | { status: 'ok'; categories: Record<string, boolean>; /** Per-category score 0..1, present only when the provider sent it. */ scores?: Record<string, number> }
  | { status: 'unavailable'; reason: 'no_key' | 'http_error' | 'bad_answer' | 'failed' }

const ENDPOINT = 'https://api.openai.com/v1/moderations'
const MODEL = 'omni-moderation-latest'
const TIMEOUT_MS = 8000

/** The model name, for the audit record of a decision (the id itself is only ever written in this file). */
export const OPENAI_MODERATION_MODEL = MODEL

export interface ModerationDeps {
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
}

type Item = { categories?: Record<string, boolean>; category_scores?: Record<string, number> }

export async function moderateImageWithOpenAI(bytes: Uint8Array, mime: string, deps: ModerationDeps = {}): Promise<ModerationOutcome> {
  const url = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
  return callModeration([{ type: 'image_url', image_url: { url } }], deps)
}

/**
 * Moderates TEXT (a speech transcript, the text layers of a video). Several pieces go in one request; the answer is merged: a category is flagged when any piece flagged it, and its
 * score is the highest of the pieces. No pieces at all is not a clean answer to anything, so it is refused as `bad_answer` rather than reported "ok".
 */
export async function moderateTextWithOpenAI(texts: string[], deps: ModerationDeps = {}): Promise<ModerationOutcome> {
  const pieces = texts.filter((t) => typeof t === 'string' && t.trim() !== '')
  if (pieces.length === 0) return { status: 'unavailable', reason: 'bad_answer' }
  return callModeration(pieces, deps)
}

async function callModeration(input: unknown[], deps: ModerationDeps): Promise<ModerationOutcome> {
  const key = ((deps.env ?? process.env).OPENAI_API_KEY ?? '').trim()
  if (!key) return { status: 'unavailable', reason: 'no_key' }
  const doFetch = deps.fetchImpl ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input }),
      signal: ctl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[openai-moderation] provider answered', res.status)
      return { status: 'unavailable', reason: 'http_error' }
    }
    const body = (await res.json()) as { results?: Item[] }
    const results = body?.results
    // One result per input piece; fewer would leave a piece unjudged.
    if (!Array.isArray(results) || results.length < input.length) return { status: 'unavailable', reason: 'bad_answer' }
    const categories: Record<string, boolean> = {}
    const scores: Record<string, number> = {}
    let anyScores = false
    for (const r of results.slice(0, input.length)) {
      if (!r?.categories || typeof r.categories !== 'object') return { status: 'unavailable', reason: 'bad_answer' }
      for (const [c, v] of Object.entries(r.categories)) categories[c] = categories[c] === true || v === true
      if (r.category_scores && typeof r.category_scores === 'object') {
        for (const [c, v] of Object.entries(r.category_scores)) {
          if (typeof v === 'number' && Number.isFinite(v)) { anyScores = true; scores[c] = Math.max(scores[c] ?? 0, v) }
        }
      }
    }
    return anyScores ? { status: 'ok', categories, scores } : { status: 'ok', categories }
  } catch (e) {
    console.error('[openai-moderation] request failed:', e instanceof Error ? e.message : e)
    return { status: 'unavailable', reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}
