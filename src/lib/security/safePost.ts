// A POST with a body and headers, for a fixed upstream API (the provider's Responses endpoint), with the same destination guarantees as safeFetch.
//
// Why this exists: safeFetch can only GET or HEAD. The Responses transport needs POST, a JSON body, an Authorization header and an SSE stream.
// Writing those with a bare fetch() in the provider layer would drop the pinned-address check, so the transport lives here instead.
//
// What it guarantees, on the real socket (not only the URL string):
//   · https only, no userinfo, no IP literal as the host (Node skips the custom lookup for IP literals, so they are refused outright).
//   · The address is chosen by the pinned lookup (safeLookup): a private or loopback answer is refused before any connection; the socket
//     connects to the validated address. TLS verifies the certificate against the HOSTNAME (servername), so pinning is not MITM.
//   · Redirects are never followed: a 3xx comes back as the response and the caller treats it as a failure.
//   · The response body is streamed (a web ReadableStream over the socket). Backpressure is the stream's; a consumer that cancels, or an
//     abort signal, destroys the socket. Nothing is buffered here.
//   · No retries here: retry policy belongs to the provider layer, which can see the request's cost and role.
//   · Nothing is logged here, so the Authorization header never reaches a log.
//
// The one non-https path is the local test seam (LLM_RESPONSES_BASE_URL=http://127.0.0.1:…, honoured only for loopback in responsesUrl):
// a plain loopback socket to a mock upstream. A non-loopback http URL is refused.

import https from 'node:https'
import http from 'node:http'
import { Readable } from 'node:stream'
import type { LookupFunction } from 'node:net'
import { BlockedDestinationError, safeLookup } from './safeFetch'

export interface SafePostOptions {
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
  /** Test seam only: the address chooser. Production uses the pinned safeLookup. */
  lookup?: LookupFunction
  /** Test seam only: a CA that signs a fixture certificate. Production trusts the platform roots. */
  tlsCa?: string | Buffer
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Resolves with the upstream response (any status). Rejects only when no response could be read (refused destination, network, abort). */
export function safePostResponse(rawUrl: string, opts: SafePostOptions): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let url: URL
    try { url = new URL(rawUrl) } catch { return reject(new BlockedDestinationError()) }
    if (url.username || url.password) return reject(new BlockedDestinationError())
    const isHttps = url.protocol === 'https:'
    const loopbackHttp = url.protocol === 'http:' && LOOPBACK.has(url.hostname)
    if (!isHttps && !loopbackHttp) return reject(new BlockedDestinationError())
    // An IP literal is never dialled: a custom lookup is not consulted for it, so the address could not be validated.
    if (isHttps && (url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))) return reject(new BlockedDestinationError())
    if (opts.signal?.aborted) return reject(opts.signal.reason ?? new Error('aborted'))

    const payload = Buffer.from(opts.body, 'utf8')
    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : isHttps ? 443 : 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { ...opts.headers, Host: url.host, 'Content-Length': String(payload.length) },
      agent: false,
    }
    if (isHttps) {
      reqOptions.servername = url.hostname
      reqOptions.lookup = opts.lookup ?? safeLookup
      if (opts.tlsCa) reqOptions.ca = opts.tlsCa
    }

    const lib = isHttps ? https : http
    const req = lib.request(reqOptions, res => {
      const status = res.statusCode ?? 0
      const headers = new Headers()
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v))
      // A body-less status cannot carry a stream; everything else streams from the socket.
      const body = status === 204 || status === 304 ? null : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>)
      if (!body) res.resume()
      resolve(new Response(body, { status, headers }))
    })
    const onAbort = () => req.destroy(opts.signal?.reason instanceof Error ? opts.signal.reason : new Error('aborted'))
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    req.on('close', () => opts.signal?.removeEventListener('abort', onAbort))
    req.on('error', reject)
    req.end(payload)
  })
}
