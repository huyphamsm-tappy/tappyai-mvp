// ─────────────────────────────────────────────────────────────────────────────
// Scam Shield verdict → public shared result (the G1 wedge artifact).
//
// WHY THIS IS A GROWTH OBJECT. A scam link spreads through exactly the channels
// Tappy wants to be discovered in — Zalo groups, family chats, Messenger. The
// person who checks it with Tappy wants to warn the others, and "this link is
// dangerous — checked by TappyAI" is a message people forward. The verdict page
// is public, needs no install, costs nothing to view, and carries a one-tap
// "check another link" into the product.
//
// WHY ANONYMOUS SHARING IS SAFE HERE, WHEN CHAT SHARING IS NOT. A chat share
// publishes text a model wrote about a user's question; this publishes only
// what the deterministic Scam Shield providers found about a URL. There is no
// user prose to spam with, no memory, no conversation: the payload is built
// server-side from a `CheckResult` the server itself produced. Rate limits
// still apply (see the route).
//
// Deterministic and pure. No model, no network. Same `SharedResultPayload`
// shape as every other public result, so /r/<slug>, the OG card, attribution
// and the follow-up box all work unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import type { CheckResult, RiskLevel } from '@/lib/scam-shield/types'
import { linkVerdict } from '@/lib/scam-shield/verdict'
import { scamVerdictText } from '@/lib/i18n/scamVerdict'
import { SHARED_RESULT_PAYLOAD_VERSION, isPublicActionUrl, type PublicButton, type SharedResultPayload } from './sharedResult'

export const SCAM_SHARE_DOMAIN = 'scam' as const

/** 02/10: the same three link states as the app — never a safety word, never a number. */
function stateLabel(locale: 'vi' | 'en', result: CheckResult): string {
  return scamVerdictText(locale, `scamVerdict.link.${result.verdict ?? linkVerdict(result.risk.level)}.title`)
}

const COPY = {
  vi: {
    title: (host: string, level: string) => `Kiểm tra lừa đảo: ${host} — ${level}`,
    query: (host: string) => `Link ${host} có lừa đảo không?`,
    verdict: (level: string) => `**${level}.**`,
    disclaimer: 'TappyAI không thay thế cơ quan chức năng.',
    sources: (responded: number, total: number) => `Tappy đã đối chiếu ${responded}/${total} nguồn kiểm tra độc lập.`,
    critical: (n: number) => `${n} dấu hiệu nguy hiểm`,
    warning: (n: number) => `${n} dấu hiệu cần lưu ý`,
    official: (brand: string) => `Trang chính thức của **${brand}** là địa chỉ bên dưới — hãy so sánh kỹ trước khi đăng nhập hay chuyển tiền.`,
    officialButton: (brand: string) => `🌐 Trang chính thức ${brand}`,
    evidenceHeading: 'Bằng chứng',
    footer: 'Kết quả này được TappyAI kiểm tra tự động từ các nguồn công khai tại thời điểm chia sẻ. Hãy kiểm tra lại nếu bạn nhận được link tương tự.',
    follow: ['Dấu hiệu nhận biết link lừa đảo là gì?', 'Tôi lỡ bấm vào link lừa đảo thì phải làm gì?'],
  },
  en: {
    title: (host: string, level: string) => `Scam check: ${host} — ${level}`,
    query: (host: string) => `Is ${host} a scam?`,
    verdict: (level: string) => `**${level}.**`,
    disclaimer: 'TappyAI does not replace the authorities.',
    sources: (responded: number, total: number) => `Tappy cross-checked ${responded}/${total} independent sources.`,
    critical: (n: number) => `${n} critical signal(s)`,
    warning: (n: number) => `${n} warning(s)`,
    official: (brand: string) => `The official **${brand}** site is linked below — compare carefully before signing in or sending money.`,
    officialButton: (brand: string) => `🌐 Official ${brand} site`,
    evidenceHeading: 'Evidence',
    footer: 'Checked automatically by TappyAI from public sources at the time of sharing. Re-check if you receive a similar link.',
    follow: ['What are the signs of a scam link?', 'I clicked a scam link — what should I do?'],
  },
} as const

/**
 * The host and path, never the query or fragment. A checked URL may carry a
 * tracking token or a victim identifier in its query string; the public page
 * must not republish it. Pure.
 */
export function publicUrlForm(raw: string): { host: string; display: string } {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = u.hostname.toLowerCase()
    const path = u.pathname === '/' ? '' : u.pathname.slice(0, 80)
    return { host, display: `${host}${path}` }
  } catch {
    return { host: 'link', display: 'link' }
  }
}

export function buildScamSharePayload(result: CheckResult, locale: 'vi' | 'en' = 'vi', now: Date = new Date()): SharedResultPayload {
  const c = COPY[locale]
  const level = stateLabel(locale, result)
  const { host, display } = publicUrlForm(result.url)
  const s = result.evidence.summary

  const lines: string[] = [
    c.verdict(level),
    '',
    c.sources(s.respondedSources, s.totalSources),
    `- ${c.critical(s.criticalCount)}`,
    `- ${c.warning(s.warningCount)}`,
  ]
  // Evidence: source + the short summary the engine already wrote. `detail` and
  // `dataPoints` stay private — they can carry raw provider payloads.
  const evidence = result.evidence.items.filter(i => i.severity === 'critical' || i.severity === 'warning').slice(0, 6)
  if (evidence.length) {
    lines.push('', `## ${c.evidenceHeading}`)
    for (const e of evidence) lines.push(`- **${e.source}**: ${String(e.summary ?? e.finding).replace(/\s+/g, ' ').slice(0, 200)}`)
  }
  const buttons: PublicButton[] = []
  if (result.officialMatch && isPublicActionUrl(result.officialMatch.website)) {
    lines.push('', c.official(result.officialMatch.brand))
    buttons.push({ label: c.officialButton(result.officialMatch.brand), type: 'website', url: result.officialMatch.website, primary: true })
  }
  lines.push('', `_${c.footer}_`, `_${c.disclaimer}_`)

  return {
    v: SHARED_RESULT_PAYLOAD_VERSION,
    kind: 'scam_check',
    title: c.title(display, level).slice(0, 120),
    query: c.query(display).slice(0, 200),
    domain: SCAM_SHARE_DOMAIN,
    locale,
    body: lines.join('\n'),
    buttons,
    images: [],
    suggestedQuestions: [...c.follow],
    createdAt: now.toISOString(),
  }
}

/** Public metadata the share route returns beside the URL — never the raw checked URL. */
export function scamShareSummary(result: CheckResult): { host: string; level: RiskLevel } {
  return { host: publicUrlForm(result.url).host, level: result.risk.level }
}
