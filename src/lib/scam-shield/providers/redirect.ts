import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS, REDIRECT_WARNING_COUNT, REDIRECT_CRITICAL_COUNT } from '../config'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
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

    try {
      const hops: RedirectHop[] = []
      let currentUrl = target.url.toString()
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

        const res = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal,
          headers: { 'User-Agent': 'TappyAI-ScamShield/1.0' },
        })

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location')
          if (!location) break

          const nextUrl = new URL(location, currentUrl).toString()
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
      return { ...base, status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: 'Redirect check failed', raw: String(err) }
    }
  },
}
