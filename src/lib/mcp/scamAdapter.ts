import type { ServiceAdapter } from './serviceMap'
import { linkVerdict } from '@/lib/scam-shield/verdict'
import { scamVerdictText } from '@/lib/i18n/scamVerdict'

// The 'scam.check' service of the Gateway (27/11/2026): Scam Shield's link check, the SAME engine the web and the apps use (lib/scam-shield checkUrl: threat list, WHOIS, DNS, certificate, redirects, the directory of
// official Vietnamese brands). No LLM. Public vocabulary only (owner 02/10, legal): three states, never "safe"; SAFE and LOW are reported as "unrecognized", whose text says in words that this is not the same as safe.
// The row names the HOST that was checked (no path, no query). A link the engine refuses (private/internal address, unparseable) yields NO row; any other failure is thrown for the gateway to report without detail.

const REFUSED = /private|internal|not allowed|invalid url/i

function hostOf(raw: string): string {
  const s = raw.trim()
  try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase() } catch { return '' }
}

export const scamCheckAdapter: ServiceAdapter = async c => {
  const { checkUrl } = await import('@/lib/scam-shield')
  let res
  try {
    res = await checkUrl(c.query)
  } catch (e) {
    if (e instanceof TypeError || REFUSED.test(e instanceof Error ? e.message : '')) return { rows: [] }
    throw e
  }
  const lang = c.lang
  const verdict = linkVerdict(res.risk.level)
  const rank: Record<string, number> = { critical: 0, warning: 1 }
  const signals = res.evidence.items
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .map(i => (lang === 'en' ? i.reason_en ?? i.summary : i.reason_vi ?? i.summary))
  return {
    rows: [{
      target: hostOf(c.query) || hostOf(res.url),
      verdict,
      verdict_title: scamVerdictText(lang, `scamVerdict.link.${verdict}.title`),
      summary: scamVerdictText(lang, `scamVerdict.link.${verdict}.body`),
      signals,
      resembles_brand: res.officialMatch?.brand,
      official_site: res.officialMatch?.website,
      official_hotline: res.officialMatch?.hotline,
      next_steps: res.actions.map(a => (lang === 'en' ? a.label_en : a.label_vi)),
    }],
  }
}
