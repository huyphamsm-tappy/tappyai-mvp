// Replay harness — the ONLY network the route may reach.
//
//   https://google.serper.dev/*  → record/replay. Key = sha1(url + body). Hit → the saved JSON.
//                                  Miss → ONE real Serper call, saved, then served from disk forever.
//                                  REPLAY_NO_RECORD=1 → a miss is answered `{}` (fully offline) and
//                                  counted as `missing`.
//   https://api.anthropic.com/*  → passed through (the real model is the point of the harness).
//   https://api.openai.com/*     → passed through (PHIÊN LUNA; only called when REPLAY_LUNA routes a role there).
//   anything else                → an empty 200 JSON `{}`; no network. Counted per host.
//
// The route's own Serper meter counts every serperPost() as a call, replayed or not, so the turn
// annotation's `serperCalls` cannot tell them apart. These counters can.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface NetStats {
  serperReal: number
  serperReplayed: number
  serperMissing: number
  anthropic: number
  openai: number
  stubbed: Record<string, number>
}

const zero = (): NetStats => ({ serperReal: 0, serperReplayed: 0, serperMissing: 0, anthropic: 0, openai: 0, stubbed: {} })
const stats: NetStats = zero()

export const netSnapshot = (): NetStats => ({ ...stats, stubbed: { ...stats.stubbed } })
export function netDelta(before: NetStats): NetStats {
  const now = netSnapshot()
  const stubbed: Record<string, number> = {}
  for (const [h, n] of Object.entries(now.stubbed)) { const d = n - (before.stubbed[h] ?? 0); if (d) stubbed[h] = d }
  return { serperReal: now.serperReal - before.serperReal, serperReplayed: now.serperReplayed - before.serperReplayed, serperMissing: now.serperMissing - before.serperMissing, anthropic: now.anthropic - before.anthropic, openai: now.openai - before.openai, stubbed }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return String((input as { url?: string })?.url ?? '')
}

function bodyOf(init: RequestInit | undefined): string {
  const b = init?.body
  if (b == null) return ''
  if (typeof b === 'string') return b
  if (b instanceof URLSearchParams) return b.toString()
  if (b instanceof Uint8Array) return new TextDecoder().decode(b)
  return String(b)
}

export function recordingKey(url: string, body: string): string {
  return createHash('sha1').update(url + body).digest('hex')
}

/**
 * Installs the stub on globalThis.fetch and returns the uninstall function. `realFetch` is the
 * fetch captured BEFORE the stub (Anthropic and Serper misses go through it).
 */
/** PHIÊN LUNA injection suite: text planted into every Serper result served while set (recordings on disk untouched). */
let injection: { field: 'title' | 'snippet'; text: string } | null = null
export function setSerperInjection(spec: { field: 'title' | 'snippet'; text: string } | null): void { injection = spec }
function plant(body: unknown): unknown {
  if (!injection || !body || typeof body !== 'object') return body
  const out = JSON.parse(JSON.stringify(body)) as Record<string, unknown>
  for (const key of ['places', 'organic', 'shopping', 'local', 'news']) {
    const arr = out[key]
    if (!Array.isArray(arr)) continue
    for (const item of arr.slice(0, 3) as Array<Record<string, unknown>>) {
      if (injection.field === 'title') item.title = injection.text
      else for (const f of ['snippet', 'description', 'about']) item[f] = `${typeof item[f] === 'string' ? item[f] + ' ' : ''}${injection.text}`
    }
  }
  return out
}

export function installReplayFetch(recordingsDir: string, opts: { record: boolean } = { record: process.env.REPLAY_NO_RECORD !== '1' }): () => void {
  mkdirSync(recordingsDir, { recursive: true })
  const realFetch = globalThis.fetch
  const inflight = new Map<string, Promise<{ status: number; body: unknown }>>()

  const stub = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input)
    let host = ''
    try { host = new URL(url).host } catch { host = 'invalid-url' }

    if (host === 'api.anthropic.com') {
      stats.anthropic++
      return realFetch(input as RequestInfo, init)
    }
    // PHIÊN LUNA: the routed consult/intent model (only reached when REPLAY_LUNA set the routing env).
    if (host === 'api.openai.com') {
      stats.openai++
      return realFetch(input as RequestInfo, init)
    }

    if (host === 'google.serper.dev') {
      const body = bodyOf(init)
      const key = recordingKey(url, body)
      const file = join(recordingsDir, `${key}.json`)
      if (existsSync(file)) {
        stats.serperReplayed++
        const saved = JSON.parse(readFileSync(file, 'utf8')) as { status: number; body: unknown }
        return json(plant(saved.body), saved.status)
      }
      if (!opts.record) {
        stats.serperMissing++
        return json({})
      }
      let p = inflight.get(key)
      if (!p) {
        stats.serperReal++
        p = (async () => {
          const res = await realFetch(url, init)
          const text = await res.text()
          let parsed: unknown
          try { parsed = JSON.parse(text) } catch { parsed = {} }
          // Only successful answers are kept; a 4xx/5xx is served once and retried next run.
          if (res.ok) {
            let request: unknown = body
            try { request = JSON.parse(body) } catch { /* keep the raw body */ }
            writeFileSync(file, JSON.stringify({ url, request, status: res.status, recordedAt: new Date().toISOString(), body: parsed }, null, 1))
          }
          return { status: res.status, body: parsed }
        })().finally(() => inflight.delete(key))
        inflight.set(key, p)
      } else {
        stats.serperReplayed++
      }
      const r = await p
      return json(plant(r.body), r.status)
    }

    stats.stubbed[host] = (stats.stubbed[host] ?? 0) + 1
    return json({})
  }

  globalThis.fetch = stub as typeof fetch
  return () => { globalThis.fetch = realFetch }
}
