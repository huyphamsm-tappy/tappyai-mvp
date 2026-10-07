// Scam Shield · message analysis — deterministic entity extraction.
//
// Pulls URLs, phone numbers and e-mail addresses out of the message BEFORE any model sees it, for
// two reasons: the URLs go through the existing deterministic engine (`checkUrl`), and the entity
// list is then a fact rather than a model claim — a model can add organisations and platforms to
// it, it cannot remove a link it would rather we did not check.

/** TLDs a bare host (no scheme) is accepted under. Scheme-carrying URLs are accepted under any
 *  TLD; this list only stops "v.v" or "e.g" in prose being promoted to a link. Skewed towards the
 *  cheap TLDs phishing kits actually register on. */
const BARE_HOST_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'io', 'co', 'me', 'app', 'dev', 'ai', 'xyz', 'top', 'site',
  'online', 'shop', 'store', 'club', 'live', 'link', 'click', 'icu', 'cfd', 'cyou', 'buzz', 'lol',
  'vip', 'win', 'bid', 'loan', 'work', 'one', 'page', 'pw', 'cc', 'tv', 'tk', 'ml', 'ga', 'cf',
  'gq', 'ru', 'cn', 'uk', 'us', 'asia', 'mobi', 'name', 'pro', 'money', 'cash', 'today', 'life',
  'world', 'fun', 'zone', 'space', 'tech', 'digital', 'services', 'support', 'help', 'center',
  'vn', 'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn', 'ac.vn', 'com.cn', 'co.uk', 'com.au',
  'co.jp', 'com.sg', 'com.my', 'co.th', 'com.hk', 'com.tw',
])

/** `hxxp://`, `example[.]com`, `example(dot)com` — de-fanging conventions people paste from
 *  security reports, plus the "example . com" some scammers use to dodge link previews. */
function refang(text: string): string {
  return text
    .replace(/\bhxxps?:\/\//gi, m => m.toLowerCase().replace('hxxp', 'http'))
    .replace(/\[\.\]|\(\.\)|\{\.\}|\s\(dot\)\s|\s+dot\s+/gi, '.')
    .replace(/\[:\/\/\]/g, '://')
}

/** Trailing characters a URL regex swallows from prose but that are not part of the link. */
const TRAILING_PUNCT = /[.,;:!?)\]}'"»”’>]+$/

// Characters a link never continues into: whitespace, angle brackets and quotes, and the CJK
// symbols/punctuation + full-width forms blocks (U+3000–303F, U+FF00–FF65) — a message mixing
// scripts routinely glues a 。or ！ straight onto a URL. Ranges are escapes, not literals (see
// normalize.ts for why).
const URL_STOP = '\\s<>"\'`«»“”‘’\\u3000-\\u303f\\uff00-\\uff65'
// Any scheme URL, cut where the sentence is.
const SCHEME_URL = new RegExp(`\\bhttps?://[^${URL_STOP}]+`, 'gi')
// A bare host: labels, then a TLD; optional port and path. Case-insensitive; the TLD is checked
// against the list above afterwards.
const BARE_HOST = new RegExp(
  `(?<![\\w@/.-])(?:www\\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+([a-z]{2,24})(?::\\d{2,5})?(?:/[^${URL_STOP}]*)?`,
  'gi',
)

/**
 * Vietnamese mobile/landline shapes (+84 / 0 prefix, 9–10 digits with optional separators) and
 * international shapes (+CC then 7–12 digits). The leading digit boundary is what stops a price
 * like 100.000.000đ or an order number from reading as a phone.
 */
const PHONE = /(?<![\d.])(?:\+?84|0)(?:[\s.\-]?\d){8,10}(?![\d])|(?<![\d.])\+(?!84)\d{1,3}(?:[\s.\-]?\d){7,12}(?![\d])/g
const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g

export interface ExtractedEntities {
  urls: string[]
  phoneNumbers: string[]
  emails: string[]
  /** `text` with every URL removed — what is left is the prose the message is made of. */
  prose: string
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-]/g, '')
}

function normalizeUrl(raw: string): string | null {
  const cleaned = raw.replace(TRAILING_PUNCT, '')
  const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

function bareTldAllowed(tld: string, host: string): boolean {
  const lower = tld.toLowerCase()
  if (BARE_HOST_TLDS.has(lower)) return true
  const parts = host.toLowerCase().split('.')
  const two = parts.slice(-2).join('.')
  return BARE_HOST_TLDS.has(two)
}

export function extractEntities(text: string): ExtractedEntities {
  const refanged = refang(text)
  const urls: string[] = []
  const seen = new Set<string>()
  const spans: Array<[number, number]> = []

  const push = (raw: string, start: number) => {
    const url = normalizeUrl(raw)
    if (!url) return
    const key = url.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    urls.push(url)
    spans.push([start, start + raw.length])
  }

  for (const m of refanged.matchAll(SCHEME_URL)) push(m[0], m.index ?? 0)

  for (const m of refanged.matchAll(BARE_HOST)) {
    const start = m.index ?? 0
    // Skip anything already inside a scheme URL — `www.` inside `https://www.…` is not a second link.
    if (spans.some(([s, e]) => start >= s && start < e)) continue
    // An e-mail's domain part is not a link either.
    if (start > 0 && refanged[start - 1] === '@') continue
    const host = m[0].split(/[/:]/)[0]
    if (!bareTldAllowed(m[1], host)) continue
    push(m[0], start)
  }

  // Emails before phones: a phone regex cannot match inside an address, but the digits in an
  // address like `12345678@mail.com` are exactly the shape a phone regex likes.
  const emails = [...new Set([...refanged.matchAll(EMAIL)].map(m => m[0].toLowerCase()))]
  const withoutEmails = refanged.replace(EMAIL, ' ')
  const phoneNumbers = [...new Set([...withoutEmails.matchAll(PHONE)].map(m => normalizePhone(m[0])))]
    // 9–13 digits after normalisation; anything else was a serial number the regex tolerated.
    .filter(p => /^\+?\d{9,13}$/.test(p))

  // Prose = everything that is not a link. Cut on the ORIGINAL spans so bare hosts go too.
  let prose = refanged
  for (const [s, e] of [...spans].sort((a, b) => b[0] - a[0])) {
    prose = prose.slice(0, s) + ' ' + prose.slice(e)
  }
  prose = prose.replace(/\s+/g, ' ').trim()

  return { urls, phoneNumbers, emails, prose }
}

/** Letters (any script) in a string — the same measure `normalizeMessage` reports. */
export function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length
}
