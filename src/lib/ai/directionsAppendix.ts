// ── CONSULTATIVE_IN_AGENT — "Chỉ đường tới X" gets a code-built Directions link even when no place card is shown ──────────────────
//
// Measured (round 9, 2026-10-11): "Chỉ đường giúp mình tới Nhà thờ Đức Bà Sài Gòn" ran search_places, the answer text gave the route in words,
// and the recommendation card was cleared (`luna_none` — the user named the place, nothing to recommend) — so the card's Directions button
// (actions.ts, flag on) never reached the user. The settle path therefore adds the SAME link as a short code-built block (the collector's
// `appendix`, the A3 mechanism: sentence + links, each through the sanitiser and the label escaper), when ALL hold:
//   · the user's message asks how to get somewhere (directions intent), and no place card accompanies the reply;
//   · a place row retrieved THIS turn is named in the user's message (whole folded phrase ≥ 6 chars) — the destination is the user's own words
//     matched to a verified row, never a name the model made up;
//   · the row carries an address or a Google place id (directionsUrl) — otherwise no link rather than a wrong one.
// The URL is the Google Maps URLs API (https only, no key); the model never writes it, and it says "mình đã kèm link" only if this block exists.

import { directionsUrl } from '@/lib/recommendation/actions'
import { marketplaceSearchTemplates } from '@/lib/ccp/adapters'
import { searchEngineTemplates } from '@/lib/ccp/searchEngines'

const fold =(s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The user asks HOW TO GET to a place (not for the place's hours, price or reviews). */
const DIRECTIONS_INTENT = /(?:^| )(?:chi duong|chi giup duong|duong di(?: toi| den)?|di (?:toi|den) .* (?:nhu the nao|bang cach nao|the nao)|tim duong|dan duong|how (?:do i|to) get to|directions? to|route to|navigate to)(?: |$)/

/** The user asks where to BUY something or for a price/link. */
const BUY_INTENT = /(?:^| )(?:mua|link|o dau|gia|gia tham khao|bao nhieu|where to buy|buy|price)(?: |$)/

/**
 * A product answer that carries prices but no purchase link / shopping card: one search link per marketplace for the keyword the model SEARCHED
 * (the same CCP-registry templates the A3 block uses — https search URLs built here, never by the model). null when a card carries the links
 * already, when nothing was searched, or when the user did not ask where to buy / what it costs.
 * Gate 2 S5 (PROPOSAL): the caller passes only a keyword the user gave (isUserDerived); every link is a registry template (marketplace list,
 * or the search-engine list for Google Shopping, D-S5-4) and carries its `providerId`, so the stream records it as `server:search:<id>`.
 */
export function productSearchAppendix(o: { userText: string; searchedQuery: string | null | undefined; cardCarriesLinks: boolean; lang?: string }): { text: string; links: Array<{ name: string; url: string; providerId: string }> } | null {
  const q = (o.searchedQuery ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (o.cardCarriesLinks || q.length < 3 || !BUY_INTENT.test(` ${fold(o.userText)} `)) return null
  // Shopee's search page sends a visitor who is not logged in to a "Login Required" page (checked 2026-10-11, in a browser with no session), so it is
  // never attached; Lazada's search and Google Shopping open without login.
  const fill = (t: { providerId: string; name: string; template: string }) => ({ providerId: t.providerId, name: t.name, url: t.template.replace('{q}', encodeURIComponent(q)) })
  const links = [
    ...marketplaceSearchTemplates().map(fill).filter(l => /^https:\/\//i.test(l.url) && !/(?:^|\.)shopee\./i.test(new URL(l.url).hostname)),
    ...searchEngineTemplates().map(fill),
  ].slice(0, 3)
  if (!links.length) return null
  return { text: o.lang === 'en' ? 'Search this product on the marketplaces:' : 'Tìm sản phẩm này trên các sàn:', links }
}

export interface DirectionsRow { name?: string; address?: string; place_id?: string }

export function directionsAppendix(o: { userText: string; rows: readonly DirectionsRow[]; lang?: string }): { text: string; links: Array<{ name: string; url: string }> } | null {
  const u = fold(o.userText)
  if (!u || !DIRECTIONS_INTENT.test(` ${u} `)) return null
  const en = o.lang === 'en'
  // longest matching row name first: "Nhà thờ Đức Bà Sài Gòn" beats a shorter row named inside it
  const rows = [...o.rows].filter(r => typeof r?.name === 'string' && fold(r.name).length >= 6).sort((a, b) => fold(b.name!).length - fold(a.name!).length)
  for (const r of rows) {
    if (!` ${u} `.includes(` ${fold(r.name!)} `)) continue
    const url = directionsUrl(r.name!, r.address, r.place_id)
    if (!url) continue
    // No origin in the message → Google Maps starts from the device's current location; say so once instead of asking where from.
    const fromHere = !/(?:^| )tu .+ (?:di )?(?:toi|den)(?: |$)|(?:^| )(?:dang o|minh o|dang dung o|from) |(?:^| )from .+ to /.test(` ${u} `)
    return { text: en ? (fromHere ? 'Directions (from your current location):' : 'Directions:') : (fromHere ? 'Chỉ đường (từ vị trí hiện tại của bạn):' : 'Chỉ đường:'), links: [{ name: en ? `Directions to ${r.name} (Google Maps)` : `Chỉ đường tới ${r.name} (Google Maps)`, url }] }
  }
  return null
}
