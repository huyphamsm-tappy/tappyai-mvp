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

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The user asks HOW TO GET to a place (not for the place's hours, price or reviews). */
const DIRECTIONS_INTENT = /(?:^| )(?:chi duong|chi giup duong|duong di(?: toi| den)?|di (?:toi|den) .* (?:nhu the nao|bang cach nao|the nao)|tim duong|dan duong|how (?:do i|to) get to|directions? to|route to|navigate to)(?: |$)/

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
    return { text: en ? 'Directions:' : 'Chỉ đường:', links: [{ name: en ? `Directions to ${r.name} (Google Maps)` : `Chỉ đường tới ${r.name} (Google Maps)`, url }] }
  }
  return null
}
