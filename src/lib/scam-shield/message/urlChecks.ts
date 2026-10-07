import { checkUrl } from '../index'
import type { CheckResult } from '../types'
import type { UrlCheckSummary } from './types'
import { MAX_URLS_CHECKED } from './config'

// Scam Shield · message analysis — the bridge to the deterministic URL engine.
//
// Every link found in a message goes through `checkUrl` — the SAME function the URL tab and the
// QR route call, with the same SSRF gate, providers, brand directory and scoring. Nothing is
// re-implemented here; this file only bounds the fan-out and folds each result into the shape the
// message result carries.
//
// 🚨 A link that cannot be checked is reported as `failed`, never dropped. "We could not look at
// this link" is information the fused verdict must keep (it lowers confidence); silently omitting
// it would let a message with an unreachable link read as a message with no link.

/** Injectable for tests; production always uses the real engine. */
export type UrlChecker = (url: string) => Promise<CheckResult>

export async function checkExtractedUrls(
  urls: string[],
  checker: UrlChecker = checkUrl,
): Promise<UrlCheckSummary[]> {
  const toCheck = urls.slice(0, MAX_URLS_CHECKED)
  const skipped: UrlCheckSummary[] = urls.slice(MAX_URLS_CHECKED).map(url => ({
    url, status: 'skipped', reason: 'limit',
  }))

  const checked = await Promise.all(
    toCheck.map(async (url): Promise<UrlCheckSummary> => {
      try {
        const result = await checker(url)
        return {
          url: result.url,
          status: 'checked',
          level: result.risk.level,
          score: result.risk.score,
          confidence: result.risk.confidence,
          officialMatch: result.officialMatch
            ? { brand: result.officialMatch.brand, website: result.officialMatch.website, ...(result.officialMatch.hotline ? { hotline: result.officialMatch.hotline } : {}) }
            : null,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        // The engine's own refusal wording (see `assertSafeTarget`). Reported as such so the user
        // learns the link points somewhere a public checker will not follow.
        const reason = /private|internal/i.test(message) ? 'private_address' : 'check_failed'
        return { url, status: 'failed', reason }
      }
    }),
  )

  return [...checked, ...skipped]
}
