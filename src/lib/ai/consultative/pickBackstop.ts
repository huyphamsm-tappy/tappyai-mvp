// ── CONSULTATIVE V1 — the stated pick, from card fields only ─────────────────
//
// Used by the stream filter when the model's body names no retrieved venue or product at all
// (measured 2026-09-18, S2: "bạn ưu tiên cái gì nhất — giá rẻ, hiệu năng hay pin?" with six priced
// rows and an engine pick in hand). Every value here is a field the card already renders; nothing
// is invented, and the model's own text is left in place below the sentence.

/** The app-owned shopping decision marker: `[TAPPY_SHOPPING]{...}[/TAPPY_SHOPPING]`. */
const SHOPPING_MARKER = /\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/

interface ShoppingEntity {
  name?: unknown
  recommended?: unknown
  priceLow?: unknown
  priceHigh?: unknown
  offers?: Array<{ rating?: unknown; ratingCount?: unknown; seller?: unknown }>
}

export function shoppingPickFromMarker(marker: string | undefined, lang = 'vi'): { name: string; sentence: string } | null {
  if (!marker) return null
  const m = SHOPPING_MARKER.exec(marker)
  if (!m) return null
  let parsed: { entities?: ShoppingEntity[] }
  try { parsed = JSON.parse(m[1]) } catch { return null }
  const pick = (parsed.entities ?? []).find(e => e && e.recommended === true) ?? null
  const name = typeof pick?.name === 'string' ? pick.name.trim() : ''
  if (!pick || !name) return null
  const price = typeof pick.priceLow === 'number' && pick.priceLow > 0 ? pick.priceLow : null
  const offer = (pick.offers ?? [])[0]
  const rating = typeof offer?.rating === 'number' ? offer.rating : null
  const count = typeof offer?.ratingCount === 'number' ? offer.ratingCount : null
  const seller = typeof offer?.seller === 'string' && offer.seller ? offer.seller : null
  const en = lang === 'en'
  const facts: string[] = []
  if (price !== null) facts.push(en ? `${price.toLocaleString('en-US')} VND` : `${price.toLocaleString('vi-VN')}₫`)
  if (rating !== null) facts.push(`${rating}⭐${count !== null ? (en ? ` (${count.toLocaleString('en-US')} reviews)` : ` (${count.toLocaleString('vi-VN')} đánh giá)`) : ''}`)
  if (seller) facts.push(en ? `at ${seller}` : `tại ${seller}`)
  const tail = facts.length ? ` — ${facts.join(', ')}` : ''
  return {
    name,
    sentence: en
      ? `I'd go with **${name}**${tail}, the best fit for your request among the results.`
      : `Mình chọn **${name}**${tail} — phù hợp nhất với yêu cầu của bạn trong các kết quả tìm được.`,
  }
}
