/**
 * OpenAI moderation adapter: the ONE place the picture-safety scan of the Messenger talks to the provider and reads its key (the architecture guard allows vendor keys only in this
 * layer). It sends one picture to the moderation endpoint (model `omni-moderation-latest`, which accepts images and is free of charge) and returns the provider's category flags.
 * What to DO with the flags (which categories block, what an unavailable scan means) is decided by the caller: src/lib/messaging/imageScan.ts.
 *
 * Never throws and never logs the key or the picture. Anything that is not a clean answer (no key, timeout, HTTP error, unreadable body) is `unavailable`.
 */
export type ModerationOutcome =
  | { status: 'ok'; categories: Record<string, boolean> }
  | { status: 'unavailable'; reason: 'no_key' | 'http_error' | 'bad_answer' | 'failed' }

const ENDPOINT = 'https://api.openai.com/v1/moderations'
const MODEL = 'omni-moderation-latest'
const TIMEOUT_MS = 8000

export interface ModerationDeps {
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
}

export async function moderateImageWithOpenAI(bytes: Uint8Array, mime: string, deps: ModerationDeps = {}): Promise<ModerationOutcome> {
  const key = ((deps.env ?? process.env).OPENAI_API_KEY ?? '').trim()
  if (!key) return { status: 'unavailable', reason: 'no_key' }
  const doFetch = deps.fetchImpl ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const url = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: [{ type: 'image_url', image_url: { url } }] }),
      signal: ctl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[openai-moderation] provider answered', res.status)
      return { status: 'unavailable', reason: 'http_error' }
    }
    const body = (await res.json()) as { results?: Array<{ categories?: Record<string, boolean> }> }
    const categories = body?.results?.[0]?.categories
    if (!categories || typeof categories !== 'object') return { status: 'unavailable', reason: 'bad_answer' }
    return { status: 'ok', categories }
  } catch (e) {
    console.error('[openai-moderation] request failed:', e instanceof Error ? e.message : e)
    return { status: 'unavailable', reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}
