// ── Luna does not recommend a shop it was not given ─────────────────────────────────────────────────────────────────
//
// Owner UAT 2026-10-01 (ca d): the reply was right ("chưa có kính cường lực") but added "bạn có thể tìm trên Shopee" — a shop
// name chosen by the model, not by code. Links and shop names are code's to decide (verified data + the per-service link
// templates). A sentence that SENDS the user to a marketplace is dropped unless that marketplace is one of this turn's own
// verified links. Facts about a listing ("giá bán trên Shopee 120k" in a card's own reason) are not touched: only
// suggestion sentences — a verb of looking/buying + «trên/ở/tại» + the shop.

const SHOPS: ReadonlyArray<readonly [key: string, re: string]> = [
  ['shopee', 'shopee'], ['lazada', 'lazada'], ['tiki', 'tiki'], ['sendo', 'sendo'], ['tiktok', 'tiktok\\s*shop'],
  ['cellphones', 'cellphone\\s?s'], ['fptshop', 'fpt\\s*shop'], ['dienmayxanh', '(?:điện máy xanh|dien may xanh|dmx)'], ['thegioididong', '(?:thế giới di động|the gioi di dong|tgdd)'],
  ['amazon', 'amazon'], ['aliexpress', 'ali\\s?express'], ['facebook', 'facebook marketplace'],
]
const SHOP_ALT = SHOPS.map(([, re]) => re).join('|')
const SUGGEST = new RegExp(`(?:t[ìi]m|xem|mua|th[ửu]|ki[ểe]m tra|săn|sắm|đặt|check|search|look|try|buy|find)[^.!?\\n]{0,40}\\b(?:trên|ở|tại|on|at|from|via|qua)\\s+(?:${SHOP_ALT})`, 'iu')

// A sentence that STATES a price is a fact about a listing, not a pointer to a shop.
const PRICE_FACT = /\d[\d.,]*\s?(?:đ|₫|k(?![a-z])|nghìn|triệu|vnd)/iu

export function scrubUnsuppliedMarketplaces(text: string, allowedUrls: Iterable<string> = []): { text: string; removed: string[] } {
  const hosts = [...allowedUrls].map(u => { try { return new URL(u).hostname.toLowerCase() } catch { return u.toLowerCase() } }).join(' ')
  const given = (shopKey: string) => hosts.includes(shopKey)
  const removed: string[] = []
  const parts = text.split(/(?<=[.!?])(?=\s)|(?=\n)/u)
  const kept = parts.filter(p => {
    if (/\]\(https?:\/\//.test(p) || /^\s*\[/.test(p)) return true // the sentence carries a real link
    if (!SUGGEST.test(p) || PRICE_FACT.test(p)) return true
    const named = SHOPS.filter(([, re]) => new RegExp(re, 'iu').test(p))
    if (named.length === 0 || named.every(([k]) => given(k))) return true
    removed.push(p.trim()); return false
  })
  return { text: removed.length ? kept.join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trimEnd() : text, removed }
}
