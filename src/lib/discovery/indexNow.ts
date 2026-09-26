// ─────────────────────────────────────────────────────────────────────────────
// IndexNow — push a NEW public URL to the search engines that accept pushes.
//
// Protocol (indexnow.org/documentation): host a key file, POST the URL list to
// one participating engine and "submitted URLs will be automatically shared
// with all other participating search engines" — Bing, Yandex, Naver, Seznam,
// Yep, Amazon (indexnow.org/faq). Google does NOT participate. Bing's index is
// what grounds Copilot and is one of the providers behind ChatGPT search, so a
// public result reaching Bing quickly is the cheapest free lever this site has
// on those answer engines' freshness. It is NOT a ranking or citation lever.
//
// Cost: $0 — no account, no fee, one outbound POST per new public page.
// Safety: env-gated (no key → no-op), never awaited on the request path
// (fire-and-forget with a short timeout), never throws, only ever sends URLs
// of pages that are public AND listed (an anonymous-owned share is noindex and
// is never submitted). Pure builders are exported for tests.
// ─────────────────────────────────────────────────────────────────────────────

import { absoluteUrl } from '@/lib/share/openGraph'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow'
export const INDEXNOW_TIMEOUT_MS = 5000
const KEY_RE = /^[a-f0-9]{8,128}$/i

/** The configured key, or null when IndexNow is off. Validated to the protocol's charset/length. */
export function indexNowKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const k = (env.INDEXNOW_KEY ?? '').trim()
  return KEY_RE.test(k) ? k.toLowerCase() : null
}

/** Where the key file is served (`/.well-known/indexnow/<key>.txt`). */
export function indexNowKeyPath(key: string): string {
  return `/.well-known/indexnow/${key}.txt`
}

/** The POST body for a list of paths. Pure. Only same-host absolute URLs are sent. */
export function buildIndexNowBody(paths: readonly string[], env: NodeJS.ProcessEnv = process.env): { host: string; key: string; keyLocation: string; urlList: string[] } | null {
  const key = indexNowKey(env)
  if (!key) return null
  const origin = absoluteUrl('/', env).replace(/\/$/, '')
  const host = new URL(origin).host
  const urlList = [...new Set(paths.map((p) => absoluteUrl(p, env)))].filter((u) => u.startsWith(`${origin}/`))
  if (urlList.length === 0) return null
  return { host, key, keyLocation: absoluteUrl(indexNowKeyPath(key), env), urlList }
}

/**
 * Submit paths. Resolves to what happened (for logs/tests); never rejects.
 * `fetchImpl` is injectable so tests never touch the network.
 */
export async function submitIndexNow(
  paths: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: false; reason: 'disabled' | 'nothing' | 'error'; status?: number } | { sent: true; status: number; count: number }> {
  const body = buildIndexNowBody(paths, env)
  if (!body) return { sent: false, reason: indexNowKey(env) ? 'nothing' : 'disabled' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), INDEXNOW_TIMEOUT_MS)
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    return { sent: true, status: res.status, count: body.urlList.length }
  } catch {
    return { sent: false, reason: 'error' }
  }
}

/**
 * Fire-and-forget from a request handler: schedules the submission and returns
 * immediately. A share is created whether or not Bing hears about it.
 */
export function notifyIndexNow(paths: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  if (!indexNowKey(env)) return
  void submitIndexNow(paths, env).catch(() => undefined)
}
