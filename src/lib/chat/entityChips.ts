// Workspace v206 entity chips (owner 12/11: "the name Elon is a pill with an icon; click it and a right column opens with a profile").
// PURE parts, client side: which bold names of an answer MAY become a chip (cheap, conservative), and how a resolved name is drawn inside the answer's HTML.
// A chip is drawn ONLY for a name the server resolved to a real Wikipedia profile (entityProfile route): this file never decides that a name is an entity.
// No network, no model call.

/** At most this many distinct names are looked up and drawn per answer. */
export const MAX_ENTITY_CHIPS = 6

/** The CSS class and data attribute the answer's click handler looks for. */
export const ENTITY_CHIP_ATTR = 'data-entity-chip'

/** A name's identity for lookups: Unicode NFC, collapsed spaces, lower case. */
export const entityKey = (name: string): string => String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

/** Words that start with a capital in a title but are not what makes a name capitalised. */
const CONNECTORS = new Set(['of', 'the', 'de', 'da', 'van', 'von', 'bin', 'al', 'và', 'and', '&', 'for', 'la', 'le', 'du', 'del'])

/** Bold labels that look like names but are headings of the answer itself (never looked up). */
const LABELS = new Set([
  'lưu ý', 'kết luận', 'tóm lại', 'mẹo', 'ghi chú', 'quan trọng', 'tổng kết', 'nguồn', 'lời khuyên', 'gợi ý', 'đáp án', 'ưu điểm', 'nhược điểm', 'cảnh báo', 'tip', 'note', 'warning',
  'summary', 'conclusion', 'sources', 'source', 'important', 'pros', 'cons', 'answer', 'result', 'bottom line', 'ví dụ', 'example', 'kết quả', 'bước 1', 'tl;dr',
])

const WORD = /^(?:\p{Lu}[\p{L}\p{M}'’.,\-]*|\d{1,4}|[\p{Ll}]{1,2}\p{Lu}[\p{L}]*)$/u

function candidateName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 60) return null
  // a heading of a list line ("Elon Musk:"), a sentence, a figure, a link, a code-ish thing
  if (/[:：?!;,]$|[\[\]<>{}|\\/=*_`#@]|https?:/i.test(name)) return null
  const words = name.split(' ')
  if (words.length > 4) return null
  if (LABELS.has(name.toLowerCase())) return null
  let capital = 0
  for (const w of words) {
    if (CONNECTORS.has(w.toLowerCase()) && capital > 0) continue
    if (!WORD.test(w)) return null
    capital++
  }
  // a number alone, or only numbers, is not a name
  if (!words.some(w => /\p{L}/u.test(w))) return null
  return name
}

/**
 * The bold names of the markdown that MAY be an entity: `**…**` of 1-4 capitalised words, not a label, not already a place card's name (`exclude`), at most `max` distinct,
 * in order of first appearance. Code fences and inline code are skipped. Pure.
 */
export function detectEntityCandidates(markdown: string, opts: { exclude?: readonly string[]; max?: number } = {}): string[] {
  const max = Math.max(0, opts.max ?? MAX_ENTITY_CHIPS)
  const banned = new Set((opts.exclude ?? []).map(entityKey))
  const text = String(markdown ?? '').slice(0, 60000)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) {
    if (out.length >= max) break
    const name = candidateName(m[1])
    if (!name) continue
    const k = entityKey(name)
    if (seen.has(k) || banned.has(k)) continue
    // a plain place-card style name containing a banned one (e.g. "Quán X" vs a card "Quán X Saigon") is left to the place profile
    if ([...banned].some(b => b.length >= 4 && (k.includes(b) || b.includes(k)))) continue
    seen.add(k)
    out.push(name)
  }
  return out
}

/** What the chip needs of a resolved profile. */
export interface ChipInfo { name: string; icon: string }

// (lookarounds, not \b: \b only knows ASCII letters and would never match a Vietnamese word that starts with đ)
const PERSON = /(?<!\p{L})(?:businessman|businesswoman|entrepreneur|investor|engineer|scientist|physicist|inventor|politician|president|actor|actress|singer|rapper|footballer|player|athlete|writer|author|poet|painter|composer|director|chef|journalist|philosopher|economist|executive|ceo|born|nhà|doanh nhân|kỹ sư|ca sĩ|diễn viên|chính trị gia|cầu thủ|tác giả|nhạc sĩ|đạo diễn)(?!\p{L})/iu
const COMPANY = /(?<!\p{L})(?:company|corporation|manufacturer|automaker|startup|conglomerate|retailer|airline|brand|firm|bank|organization|organisation|association|công ty|tập đoàn|hãng|thương hiệu|tổ chức|ngân hàng|doanh nghiệp)(?!\p{L})/iu
const PLACE = /(?<!\p{L})(?:city|town|village|province|district|island|beach|mountain|lake|river|country|capital|resort|hotel|restaurant|park|street|ward|thành phố|tỉnh|quận|huyện|đảo|bãi|núi|hồ|sông|khách sạn|nhà hàng|công viên|quốc gia|thủ đô)(?!\p{L})/iu
const PRODUCT = /(?<!\p{L})(?:car|vehicle|sedan|suv|model|smartphone|phone|software|operating system|app|game|chatbot|language model|laptop|xe|điện thoại|phần mềm|trò chơi)(?!\p{L})/iu

/** An emoji for what a Wikipedia short description says the thing is (the mockup's chips carry one). Unknown: a book. Pure. */
export function entityIcon(description: string | null | undefined): string {
  const d = String(description ?? '')
  if (PERSON.test(d)) return '👤'
  if (COMPANY.test(d)) return '🏢'
  if (PLACE.test(d)) return '📍'
  if (PRODUCT.test(d)) return '📦'
  return '📖'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * In an answer paragraph's formatted HTML, each `<strong>Name</strong>` whose text is a RESOLVED name becomes a chip: the same bold, plus the icon and the chip attributes
 * (focusable, a button for assistive technology). Text of other tags, links, and bold that is not exactly a resolved name stay as they are. Pure.
 */
export function decorateEntityChips(html: string, resolved: ReadonlyMap<string, ChipInfo>): string {
  if (!resolved.size || !html.includes('<strong')) return html
  return html.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|<strong\b([^>]*)>([^<]{1,80})<\/strong>/g, (m, anchor: string | undefined, attrs: string | undefined, inner: string | undefined) => {
    if (anchor || inner === undefined) return m
    // the formatter has already escaped the text; compare on the decoded value
    const plain = inner.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    const info = resolved.get(entityKey(plain))
    if (!info) return m
    return `<strong${attrs ?? ''} ${ENTITY_CHIP_ATTR}="${esc(info.name)}" class="v206-ent" role="button" tabindex="0" title="${esc(info.name)}"><span class="v206-ent-i" aria-hidden="true">${info.icon}</span>${inner}</strong>`
  })
}
