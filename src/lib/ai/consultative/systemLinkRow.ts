/** How many "🔗 Liên kết đối tác" buttons one answer shows. A flight + hotel turn used to end in a row of about 13. */
export const SYSTEM_LINK_ROW_CAP = 6

/** The platform's validated links for a turn, thinned for display: one per label, the first (best-ranked) ones kept. Pure; never changes a URL. */
export function compactSystemLinks<T extends { name: string; url: string }>(links: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const l of links) {
    const key = l.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
    if (out.length >= SYSTEM_LINK_ROW_CAP) break
  }
  return out
}
