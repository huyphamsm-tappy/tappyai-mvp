// Server-side HTTP for URLs a stranger chose, with the destination address pinned.
//
// ============================================================================
// THE PROBLEM THIS SOLVES
// ============================================================================
// Refusing `http://10.0.0.5/` by inspecting the string is easy and stops nothing, because an
// attacker does not have to write the address down. `https://looks-fine.example/` is a perfectly
// ordinary URL that any hostname filter waves through, and its owner decides what it resolves to.
// Point the A record at `169.254.169.254` and the server fetches cloud metadata on their behalf.
//
// The classic hardening — resolve, check the answer, then fetch — does not close it either. That
// is two resolutions with a gap in between, and the attacker controls the DNS TTL: answer
// publicly for the check, privately for the connection. DNS rebinding lives in that gap.
//
// ============================================================================
// THE INVARIANT
// ============================================================================
// 🔑 There is exactly ONE resolution, and the socket connects to ITS result:
//
//     VALIDATED ADDRESS  ==  CONNECTED ADDRESS
//
// Node lets us hold that guarantee by accepting a custom `lookup` on the request. The socket layer
// calls it, and connects to whatever it returns — so validating inside the lookup and refusing
// there means the connection is never attempted, not merely reported afterwards. There is no
// second resolution to poison because nothing resolves the name again.
//
// Measured, not assumed (`__tests__/dnsPinning.test.ts` re-measures it on every run):
//   · a custom lookup is called, once, and the socket goes where it says
//   · an error from the lookup ⇒ ZERO connections observed at the destination
//   · TLS still verifies the certificate against the HOSTNAME, so pinning does not become MITM
//
// `agent: false` — Node 19+ enables keepAlive on the global agent, and a reused socket skips
// `lookup` entirely. That is NOT an SSRF hole on its own: a pooled socket is already connected to
// an address this policy approved, so reuse cannot reach anywhere new. It is here so that one
// request means one validation, rather than the guarantee resting on pool internals.
//
// 🚨 Honesty about coverage: no test in this repo distinguishes this line, because pooling only
// engages on a connection that SUCCEEDS, and the test harness has no TLS endpoint to succeed
// against. Mutating it away leaves the suite green. It was measured by hand instead — a scratch
// probe against a local TLS server showed a second request reusing the socket with zero lookup
// calls. Kept because it is correct and free, not because anything is holding it in place.

import https from 'node:https'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { isAllowedDestinationAddress } from './addressPolicy'

/**
 * Thrown when a destination resolves somewhere we will not go.
 *
 * 🚨 The message deliberately says nothing about WHICH address came back. Callers fold provider
 * errors into the evidence report that goes to the client, so a message naming `10.0.0.5` would
 * turn the SSRF fix into an internal-topology oracle — the attacker probes names and reads our
 * error text for the answer.
 */
export class BlockedDestinationError extends Error {
  constructor() {
    super('Destination is not allowed')
    this.name = 'BlockedDestinationError'
  }
}

type ResolveAll = (
  hostname: string,
  options: { all: true; verbatim: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void

/**
 * Build the pinning resolver. Injectable so tests can drive the DNS answer without a real zone.
 *
 * 🔑 It asks for ALL addresses and refuses if ANY of them is disallowed — not "if the one we
 * happened to pick" is. A name with two A records, one public and one private, is a name the
 * attacker only has to get lucky with once; and a resolver is free to return them in any order.
 */
export function createSafeLookup(resolveAll: ResolveAll): LookupFunction {
  return function safeLookupImpl(hostname, options, callback): void {
    // The socket layer ignores the address argument whenever the error is set, but the type
    // requires one, so refusals pass a placeholder rather than being cast away.
    const refuse = (err: NodeJS.ErrnoException) => callback(err, '', 4)

    resolveAll(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return refuse(err)
      if (!addresses || addresses.length === 0) {
        return refuse(Object.assign(new Error('No address'), { code: 'ENOTFOUND' }))
      }
      for (const a of addresses) {
        if (!isAllowedDestinationAddress(a.address)) {
          return refuse(Object.assign(new BlockedDestinationError(), { code: 'ENOTFOUND' }))
        }
      }
      // `all: true` and `all: false` are different callback shapes; the socket layer picks.
      if (options.all === true) return callback(null, addresses)
      return callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

/** The production resolver, backed by the system resolver. */
export const safeLookup = createSafeLookup(dnsLookup as unknown as ResolveAll)

export interface SafeHeadResponse {
  status: number
  location: string | null
}

/**
 * One HEAD request to a URL a stranger chose.
 *
 * Redirects are NOT followed — the caller inspects `location` and decides, because deciding is
 * the whole job: each hop has to clear the policy before it is fetched. An HTTP client that
 * follows redirects itself would make that impossible.
 */
export function safeHeadRequest(rawUrl: string, signal: AbortSignal): Promise<SafeHeadResponse> {
  return new Promise((resolve, reject) => {
    let url: URL
    try { url = new URL(rawUrl) } catch { return reject(new BlockedDestinationError()) }
    if (url.protocol !== 'https:') return reject(new BlockedDestinationError())

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        method: 'HEAD',
        headers: { 'User-Agent': 'TappyAI-ScamShield/1.0', Host: url.host },
        servername: url.hostname,   // SNI + certificate identity stay tied to the NAME
        lookup: safeLookup,
        agent: false,
        signal,
      },
      res => {
        res.resume()   // HEAD has no body, but an undrained response keeps the socket alive
        resolve({
          status: res.statusCode ?? 0,
          location: (res.headers.location as string | undefined) ?? null,
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export interface SafeTextResponse {
  /** Body text, truncated at `maxBytes` or at `stopAt`, whichever comes first. */
  text: string
  /** The url the body actually came from — redirects move it, and relative links resolve against it. */
  finalUrl: string
  contentType: string
}

/**
 * A bounded GET of a page a stranger chose, following redirects ONE VALIDATED HOP AT A TIME.
 *
 * 🚨 This exists because `fetch(url, { redirect: 'follow' })` cannot be made safe. The following
 * happens inside the HTTP client, so there is no seam at which to inspect hop two: a public host
 * answering `302 Location: http://169.254.169.254/` is fetched before any of our code runs again.
 * Validating the URL the caller passed in says nothing about where it ends up.
 *
 * So the loop is ours. Every hop is checked as a string (scheme, credentials, literal addresses)
 * and then connected through the pinned resolver, which refuses any hop whose NAME resolves
 * inward. The body is read incrementally and abandoned at `maxBytes` or once `stopAt` appears, so
 * a hostile server cannot stream forever.
 */
export async function safeGetText(
  rawUrl: string,
  signal: AbortSignal,
  opts: { maxBytes: number; stopAt?: RegExp; maxRedirects?: number },
): Promise<SafeTextResponse> {
  const maxRedirects = opts.maxRedirects ?? 5
  let currentUrl = rawUrl

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await getOnce(currentUrl, signal, opts)
    if (res.kind === 'body') return { text: res.text, finalUrl: currentUrl, contentType: res.contentType }

    // A redirect with nowhere to go is the end of the chain, not a failure.
    if (!res.location) throw new Error('Redirect without a location')
    currentUrl = new URL(res.location, currentUrl).toString()
  }
  throw new Error('Too many redirects')
}

type OnceResult =
  | { kind: 'body'; text: string; contentType: string }
  | { kind: 'redirect'; location: string | null }

function getOnce(
  rawUrl: string,
  signal: AbortSignal,
  opts: { maxBytes: number; stopAt?: RegExp },
): Promise<OnceResult> {
  return new Promise((resolve, reject) => {
    let url: URL
    try { url = new URL(rawUrl) } catch { return reject(new BlockedDestinationError()) }
    if (url.protocol !== 'https:') return reject(new BlockedDestinationError())
    if (url.username || url.password) return reject(new BlockedDestinationError())

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0; +https://tappyai.com)',
          Host: url.host,
        },
        servername: url.hostname,
        lookup: safeLookup,
        agent: false,
        signal,
      },
      res => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400) {
          res.resume()
          return resolve({ kind: 'redirect', location: (res.headers.location as string | undefined) ?? null })
        }
        if (status < 200 || status >= 300) {
          res.resume()
          return reject(new Error(`HTTP ${status}`))
        }

        const contentType = (res.headers['content-type'] as string | undefined) ?? ''
        let text = ''
        let bytes = 0
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          bytes += Buffer.byteLength(chunk)
          text += chunk
          // Stop reading the moment we have what we came for, or once the budget is spent.
          if (bytes >= opts.maxBytes || (opts.stopAt && opts.stopAt.test(text))) {
            res.destroy()
            resolve({ kind: 'body', text, contentType })
          }
        })
        res.on('end', () => resolve({ kind: 'body', text, contentType }))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end()
  })
}
