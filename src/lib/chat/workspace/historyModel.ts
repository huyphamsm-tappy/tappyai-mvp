// Chat workspace · history sidebar — the pure part (no React, no network): search, time groups, and the .md export.
// Everything the sidebar decides about a list of conversations is decided here, so it is testable without a browser.

export interface HistoryMessage {
  role?: string
  content?: unknown
}

export interface HistoryConversation {
  id: string
  title: string | null
  category?: string | null
  updated_at: string
  messages?: HistoryMessage[] | null
}

/** Lower-cases, strips Vietnamese diacritics (đ → d), trims. "Đà Lạt" and "da lat" normalise to the same string. */
export function normalizeVietnamese(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
}

export function matchesQuery(text: string | null | undefined, query: string): boolean {
  if (!query.trim()) return true
  if (!text) return false
  if (text.toLowerCase().includes(query.trim().toLowerCase())) return true
  return normalizeVietnamese(text).includes(normalizeVietnamese(query))
}

/** The readable text of a saved message: a string, or the text parts of a parts array. Anything else is empty. */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'string' ? part : part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** True when the query is in the title or in any message. */
export function conversationMatches(conv: HistoryConversation, query: string): boolean {
  if (!query.trim()) return true
  if (matchesQuery(conv.title, query)) return true
  return (conv.messages ?? []).some(m => matchesQuery(messageText(m?.content), query))
}

export type TimeGroupKey = 'today' | 'sevenDays' | 'older'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Today = the same calendar day (local time); seven days = the 7 days before that; everything else (and an unreadable date) = older. */
export function timeGroupOf(updatedAt: string, now: Date): TimeGroupKey {
  const t = Date.parse(updatedAt)
  if (Number.isNaN(t)) return 'older'
  const today = startOfLocalDay(now)
  if (t >= today) return 'today'
  if (t >= today - 7 * DAY_MS) return 'sevenDays'
  return 'older'
}

export interface TimeGroup<T> {
  key: TimeGroupKey
  items: T[]
}

/** Newest first inside each group; empty groups are dropped; order is today → seven days → older. */
export function groupByTime<T extends { updated_at: string }>(list: readonly T[], now: Date): TimeGroup<T>[] {
  const buckets: Record<TimeGroupKey, T[]> = { today: [], sevenDays: [], older: [] }
  for (const item of list) buckets[timeGroupOf(item.updated_at, now)].push(item)
  const byNewest = (a: T, b: T) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)
  return (['today', 'sevenDays', 'older'] as const)
    .map(key => ({ key, items: buckets[key].sort(byNewest) }))
    .filter(g => g.items.length > 0)
}

export interface TranscriptLabels {
  you: string
  tappy: string
  /** "Exported from TappyAI" line. */
  exportedFrom: string
  /** "N messages". */
  messageCount: (n: number) => string
  untitled: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** A tidy Markdown transcript. Message text is kept as saved (it is already Markdown); nothing is added to it. */
export function buildTranscriptMarkdown(conv: HistoryConversation, labels: TranscriptLabels, now: Date): string {
  const messages = (conv.messages ?? []).filter(m => messageText(m?.content).trim() !== '')
  const stamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const lines: string[] = []
  lines.push(`# ${(conv.title || '').trim() || labels.untitled}`)
  lines.push('')
  lines.push(`> ${labels.exportedFrom} • ${stamp} • ${labels.messageCount(messages.length)}`)
  lines.push('')
  lines.push('---')
  for (const m of messages) {
    lines.push('')
    lines.push(`### ${m.role === 'user' ? labels.you : labels.tappy}`)
    lines.push('')
    lines.push(messageText(m.content).trim())
  }
  lines.push('')
  return lines.join('\n')
}

/** `TappyAI_<TitleInPascalCaseWithoutDiacritics>_<yyyymmdd>.md` — safe on every file system, 40 characters of title at most. */
export function exportFileName(title: string | null | undefined, now: Date, fallback = 'CuocTroChuyen'): string {
  const words = normalizeVietnamese(title).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  const slug = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('').slice(0, 40) || fallback
  return `TappyAI_${slug}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.md`
}
