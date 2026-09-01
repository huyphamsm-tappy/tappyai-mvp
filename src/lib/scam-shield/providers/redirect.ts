import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS, REDIRECT_WARNING_COUNT, REDIRECT_CRITICAL_COUNT } from '../config'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { safeHeadRequest, BlockedDestinationError } from '@/lib/security/safeFetch'
import { registrableDomain } from '../domain'

interface RedirectHop {
  url: string
  statusCode: number
}

export const redirectProvider: ScamShieldProvider = {
  id: 'redirect',
  name: 'Redirect Chain',

  isConfigured(): boolean {
    return true
  },

  async check(target: CheckTarget, signal: AbortSignal): Promise<ProviderSignal> {
    const base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'> = {
      provider: this.id,
      status: 'completed',
    }
    const maxWeight = PROVIDER_MAX_WEIGHTS[this.id]

    // Declared out here so the catch below can report WHICH hop was refused — a blocked
    // destination is thrown from inside the loop, and the chain so far is the useful part.
    const hops: RedirectHop[] = []
    let currentUrl = target.url.toString()

    try {
      const maxRedirects = 10
      const visited = new Set<string>()

      for (let i = 0; i < maxRedirects; i++) {
        if (signal.aborted) {
          return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'Redirect check timed out' }
        }

        if (visited.has(currentUrl)) break
        visited.add(currentUrl)

        // 🚨 `&& i > 0` used to sit here, exempting the FIRST url from the check. That was safe
        // only while every caller validated before arriving — and one did not (`checkQr`), which
        // is how BUG-007 happened. The exemption bought nothing and hid a hole, so it is gone:
        // every hop is checked before it is fetched, including the first, and a public host that
        // 302s to `169.254.169.254` is refused before that second request goes out.
        if (!isSafeHttpsUrl(currentUrl)) {
          return {
            ...base, finding: 'UNSAFE_REDIRECT', severity: 'critical',
            weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
            detail: `Redirect chain leads to unsafe URL`,
            raw: { hops, finalUrl: currentUrl },
          }
        }

        // 🔑 The check above reads the URL; this call decides where the socket goes. They are
        // different questions, and only the second one is binding — `https://looks-fine.example/`
        // passes the string check and can still resolve to `10.0.0.5`. `safeHeadRequest` resolves
        // once, validates every answer, and connects to what it validated, so a hop that points
        // inward is refused with no connection rather than reported after one.
        const res = await safeHeadRequest(currentUrl, signal)

        if (res.status >= 300 && res.status < 400) {
          if (!res.location) break

          const nextUrl = new URL(res.location, currentUrl).toString()
          hops.push({ url: currentUrl, statusCode: res.status })
          currentUrl = nextUrl
        } else {
          break
        }
      }

      if (hops.length === 0) {
        return { ...base, finding: 'NO_REDIRECTS', severity: 'safe', weight: 0, detail: 'No redirects detected', raw: { hops } }
      }

      const finalDomain = registrableDomain(new URL(currentUrl).hostname)
      const crossDomain = hops.some(h => registrableDomain(new URL(h.url).hostname) !== finalDomain)

      if (hops.length >= REDIRECT_CRITICAL_COUNT || crossDomain) {
        return {
          ...base, finding: crossDomain ? 'CROSS_DOMAIN_REDIRECT' : 'EXCESSIVE_REDIRECTS',
          severity: 'critical',
          weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
          detail: crossDomain
            ? `Redirects across ${new Set(hops.map(h => registrableDomain(new URL(h.url).hostname))).size + 1} different domains`
            : `${hops.length} redirects detected`,
          raw: { hops, finalUrl: currentUrl, crossDomain },
        }
      }

      if (hops.length >= REDIRECT_WARNING_COUNT) {
        return {
          ...base, finding: 'MULTIPLE_REDIRECTS', severity: 'warning',
          weight: maxWeight * SEVERITY_MULTIPLIERS.warning,
          detail: `${hops.length} redirects detected`,
          raw: { hops, finalUrl: currentUrl, crossDomain },
        }
      }

      return {
        ...base, finding: 'FEW_REDIRECTS', severity: 'safe',
        weight: 0,
        detail: `${hops.length} redirect${hops.length === 1 ? '' : 's'} (same domain)`,
        raw: { hops, finalUrl: currentUrl, crossDomain },
      }
    } catch (err) {
      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'Redirect check timed out' }
      }
      // A hostname that resolved inward is the same finding as a URL that named an internal
      // address outright — the visitor was pointed at our network either way, and calling it a
      // generic "check failed" would score it as a shrug.
      //
      // 🚨 Nothing about the resolved address goes into `raw`. `finalUrl` is the URL the attacker
      // supplied, which they already know; the ADDRESS it resolved to is ours, and the evidence
      // report is returned to the client. Echoing it would answer "what is on your network?"
      if (err instanceof BlockedDestinationError) {
        return {
          ...base, finding: 'UNSAFE_REDIRECT', severity: 'critical',
          weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
          detail: 'Redirect chain leads to unsafe URL',
          raw: { hops, finalUrl: currentUrl },
        }
      }
      return { ...base, status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: 'Redirect check failed', raw: String(err) }
    }
  },
}
