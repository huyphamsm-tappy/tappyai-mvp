/**
 * Safety scan of a chat picture BEFORE it is stored (owner approved 04/11/2026: "nếu OpenAI miễn phí thì làm").
 *
 * Uses OpenAI's moderation endpoint (model `omni-moderation-latest`), which accepts images and is free of charge. The picture is the CLEAN one (already re-encoded
 * without metadata), sent once, as a data URL; nothing is kept by us. Because the picture of a private conversation goes to a provider, the upload route first requires
 * the same AI-data consent as every other AI endpoint (aiConsentGuard).
 *
 * Verdicts:
 *  - 'ok'          the provider flagged none of the blocked categories.
 *  - 'blocked'     sexual content, sexual content involving minors, or graphic violence.
 *  - 'unavailable' the scan could not be completed (no key, timeout, HTTP error, unreadable answer). The route REFUSES the upload in this case: a state that cannot be
 *                  verified is not assumed to be safe (the same rule as the consent guard). Switching the scan off is explicit: CHAT_IMAGE_SCAN_ENABLED=false.
 */

export type ImageScanVerdict = 'ok' | 'blocked' | 'unavailable' | 'off'

export const BLOCKED_CATEGORIES = ['sexual', 'sexual/minors', 'violence/graphic'] as const

const ENDPOINT = 'https://api.openai.com/v1/moderations'
const MODEL = 'omni-moderation-latest'
const TIMEOUT_MS = 8000

export function imageScanEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CHAT_IMAGE_SCAN_ENABLED ?? '').trim().toLowerCase() !== 'false'
}

export interface ImageScanDeps {
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
}

export async function scanChatImage(bytes: Uint8Array, mime: string, deps: ImageScanDeps = {}): Promise<ImageScanVerdict> {
  const env = deps.env ?? process.env
  if (!imageScanEnabled(env)) return 'off'
  const key = (env.OPENAI_API_KEY ?? '').trim()
  if (!key) {
    console.error('[messaging/imageScan] no OPENAI_API_KEY: refusing pictures until the scan is available or switched off explicitly')
    return 'unavailable'
  }
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
    })
    if (!res.ok) {
      console.error('[messaging/imageScan] provider answered', res.status)
      return 'unavailable'
    }
    const body = (await res.json()) as { results?: Array<{ categories?: Record<string, boolean> }> }
    const categories = body?.results?.[0]?.categories
    if (!categories || typeof categories !== 'object') return 'unavailable'
    return BLOCKED_CATEGORIES.some((c) => categories[c] === true) ? 'blocked' : 'ok'
  } catch (e) {
    console.error('[messaging/imageScan] scan failed:', e instanceof Error ? e.message : e)
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}
