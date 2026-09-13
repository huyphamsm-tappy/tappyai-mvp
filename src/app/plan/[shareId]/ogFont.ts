// The font the social image is set in.
//
// 🚨 @vercel/og ships ONE font, `noto-sans-v27-latin-regular.ttf` — Latin only.
// Every Vietnamese title ("Quy Nhơn", "3 ngày 2 đêm") needs Latin Extended
// Additional, which that file lacks: the letters would render as boxes. So the
// card loads Be Vietnam Pro from Google Fonts on first use and keeps it for the
// life of the instance. One fetch per cold start, to a fixed host, never to a
// URL a payload could choose. If the fetch fails the card still renders with
// the bundled font rather than failing the preview — a crawler must always get
// an image.

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@700&display=swap'
// An old UA makes the CSS endpoint answer with a single TTF instead of split woff2 ranges.
const TTF_UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:5.0) Gecko/20100101 Firefox/5.0'

let cached: Promise<ArrayBuffer | null> | null = null

async function load(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(CSS_URL, { headers: { 'User-Agent': TTF_UA } }).then(r => (r.ok ? r.text() : ''))
    const m = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/)
    if (!m) return null
    const r = await fetch(m[1])
    return r.ok ? r.arrayBuffer() : null
  } catch {
    return null
  }
}

/** The font data for the card, or null to fall back to the bundled Latin font. */
export function ogFont(): Promise<ArrayBuffer | null> {
  if (!cached) cached = load()
  return cached
}

export const OG_FONT_FAMILY = 'Be Vietnam Pro'
