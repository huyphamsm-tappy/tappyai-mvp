/** How many "🔗 Liên kết đối tác" buttons one answer shows. A flight + hotel turn used to end in a row of about 13. */
export const SYSTEM_LINK_ROW_CAP = 6

const PARTNER_LABEL = /\b(agoda|vexere|lazada)\b/i

/**
 * The row(s) under an answer: the affiliate partners (Agoda, Vexere, Lazada) on their own line under `labels.main`, every other platform on a second line under `labels.more`
 * ("Tham khảo thêm" - owner 20/11: the partners are the suggestion, the rest are for reference). Thinned like compactSystemLinks; empty when there is no link. Pure.
 */
export function systemLinkLines<T extends { name: string; url: string }>(links: readonly T[], labels: { main: string; more: string }, render: (l: T) => string): string {
  const rows = compactSystemLinks(links)
  const partners = rows.filter(l => PARTNER_LABEL.test(l.name))
  const others = rows.filter(l => !PARTNER_LABEL.test(l.name))
  const lines: string[] = []
  if (partners.length) lines.push(`${labels.main} ${partners.map(render).join(' · ')}`)
  if (others.length) lines.push(`${labels.more} ${others.map(render).join(' · ')}`)
  return lines.join('\n\n')
}

/** The platform's validated links for a turn, thinned for display: one per label, the first (best-ranked) ones kept. Pure; never changes a URL. */
export function compactSystemLinks<T extends { name: string; url: string }>(links: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  // Owner decision 19/11/2026: the affiliate partners (Agoda hotels, Vexere transport, Lazada shopping) lead the row; every other platform follows,
  // each group in the order the tools ranked it. Judged by the link's label (the tracked URL is a wrapper), never by composing anything.
  const ranked = [...links.filter(l => PARTNER_LABEL.test(l.name)), ...links.filter(l => !PARTNER_LABEL.test(l.name))]
  for (const l of ranked) {
    const key = l.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
    if (out.length >= SYSTEM_LINK_ROW_CAP) break
  }
  return out
}
