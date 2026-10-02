// ── Images and photo addresses written by the MODEL never reach the reader (A3, owner 2026-10-02) ───────────────────
//
// Product rule (decided): links and images are built by CODE from allowed sources; the model writes advice. An image appears
// ONLY inside a card (or, for a client without cards, where the code injects the venue's own photo AFTER this filter runs).
//
// Owner UAT 2026-10-02: a travel answer carried a raw `gstatic.com/images?q=tbn:…` address and an embedded hotel photo. The existing
// egress guard (`stripUnownedImages` / `stripUnownedLinks`) lets a model copy any URL a tool handed it — and a hotel / shopping
// tool result is full of Google thumbnails, so a «given» thumbnail passed. This module is the deterministic rule that closes it,
// shared by the live (progressive) path and the settle path so a released prefix stays a prefix of the final text:
//
//   · a markdown image `![alt](url)` and an HTML `<img>` → gone (the alt text stays when it says something, e.g. a venue name);
//   · a link or bare URL whose target IS a photo address (Google/Meta/TikTok/YouTube image CDNs, or an image file) → gone, whoever
//     handed it over: it is never the destination a person wants, only a thumbnail;
//   · everything else is left to the existing allow-list egress guard (links must be copies of what a tool gave this turn).
//
// Pure functions; no I/O. `earliestMarker`-style structured blocks ([CTA_BUTTONS], [TAPPY_*]) are NOT prose: callers pass only the
// prose part, or use `stripModelMediaInProse` which finds the cut itself.

/** Hosts that only ever serve pictures. A page on one of these (e.g. google.com/maps) is not listed — only the CDN hosts. */
const IMAGE_CDN_HOST = /(^|\.)(googleusercontent\.com|gstatic\.com|ggpht\.com|fbcdn\.net|cdninstagram\.com|tiktokcdn\.com|tiktokcdn-us\.com|ytimg\.com|twimg\.com|staticflickr\.com)$/i
const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif|avif|bmp|svg)(?:$|[?#])/i

/** Does this URL point at a picture (a photo CDN, a Google thumbnail address, or an image file)? */
export function isPhotoAddress(url: string): boolean {
  try {
    const u = new URL(url.replace(/&amp;/g, '&'))
    if (IMAGE_FILE.test(u.pathname)) return true
    if (/(^|[?&])q=tbn:/i.test(u.search) || /\/images\?q=tbn/i.test(u.pathname + u.search)) return true
    return IMAGE_CDN_HOST.test(u.hostname) && !/\/maps\b|\/search\b/.test(u.pathname)
  } catch { return false }
}

/** Alt text that says nothing («Ảnh địa điểm», «image», «») is dropped; a real caption (a venue name) stays as plain text. */
function altKept(alt: string): string {
  const a = alt.trim()
  if (!a) return ''
  if (/^(?:ảnh|hình|hinh|anh|image|photo|picture|pic|img|thumbnail|thumb|logo)\b/i.test(a)) return ''
  if (/^https?:\/\//i.test(a)) return ''
  return a
}

const MD_IMAGE = /!\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+|data:[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g
const HTML_IMG = /<img\b[^>]*>/gi
const MD_LINK = /(?<!!)\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g
const BARE_URL = /(\*\*|__)?(?<!\w)(https?:\/\/[^\s<>()\\[\]]+)/g

/**
 * Remove every picture the model wrote from PROSE: markdown images, `<img>`, photo-address links and bare photo addresses.
 * Idempotent; leaves all other text byte for byte (blank-line runs a removal leaves are collapsed).
 */
export function stripModelMedia(prose: string): string {
  let removed = false
  const mark = <T,>(v: T): T => { removed = true; return v }
  let t = prose
    .replace(MD_IMAGE, (_w, alt: string) => mark(altKept(alt)))
    .replace(HTML_IMG, () => mark(''))
    .replace(MD_LINK, (whole, label: string, url: string) => (isPhotoAddress(url) ? mark(altKept(label)) : whole))
    .replace(BARE_URL, (whole: string, lead: string | undefined, url: string) => {
      const trailing = url.match(/[.,;:!?*_~)]+$/)?.[0] ?? ''
      const bare = trailing ? url.slice(0, -trailing.length) : url
      if (!isPhotoAddress(bare)) return whole
      return mark(lead && trailing.startsWith(lead) ? trailing.slice(lead.length) : (lead ?? '') + trailing)
    })
  if (!removed) return prose
  // A line that held only a picture leaves an empty line behind; collapse the gaps and trailing spaces.
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return t
}

/** The same rule over a whole reply: only the prose before the first structured block is touched. */
export function stripModelMediaInProse(text: string, proseEnd: number): string {
  const cut = Math.max(0, Math.min(proseEnd, text.length))
  return stripModelMedia(text.slice(0, cut)) + text.slice(cut)
}

const MEDIA_BLOCK_LABEL = /^📸 _(?:Hình ảnh & link review|Images & review links):_\s*$/u

/**
 * After the pictures of the legacy «📸 Hình ảnh & link review» block were removed (a web turn with no card), the block can be left as a label
 * and bare venue names. Keep only the entries that still carry a link; drop the label when no entry is left. Text outside the block is untouched.
 */
export function dropEmptyMediaBlocks(text: string): string {
  const paras = text.split(/\n{2,}/)
  const at = paras.findIndex(p => p.split('\n').some(l => MEDIA_BLOCK_LABEL.test(l.trim())))
  if (at < 0) return text
  // The label may share its paragraph with the prose line before it (single newline); split it off.
  const head = paras[at].split('\n')
  const li = head.findIndex(l => MEDIA_BLOCK_LABEL.test(l.trim()))
  const before = head.slice(0, li).join('\n')
  const label = head[li]
  const rest = head.slice(li + 1).join('\n')
  const queue = rest ? [rest, ...paras.slice(at + 1)] : paras.slice(at + 1)
  // An entry is «**Name**» alone on its first line, then only link / media lines.
  const isEntry = (p: string) => {
    const ls = p.split('\n').map(l => l.trim()).filter(Boolean)
    return ls.length > 0 && /^\*\*[^*\n]+\*\*$/.test(ls[0]) && ls.slice(1).every(l => /^(?:!?\[|🎵)/.test(l))
  }
  let n = 0
  while (n < queue.length && isEntry(queue[n])) n++
  const entries = queue.slice(0, n).filter(p => /\]\(https?:\/\//.test(p))
  const after = queue.slice(n)
  const out = [...paras.slice(0, at), ...(before ? [before] : []), ...(entries.length ? [label, ...entries] : []), ...after]
  return out.join('\n\n')
}
