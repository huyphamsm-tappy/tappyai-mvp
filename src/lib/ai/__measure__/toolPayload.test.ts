import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI } from '@/lib/ai/llm'
import { searchPlaces } from '@/lib/ai/tools/food'
import { splitToolResult } from '@/lib/ai/toolResultSplit'

// ── B4 tool-payload measurement ──────────────────────────────────────────────
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/toolPayload.test.ts --disable-console-intercept
//
// Character counts are a poor proxy here: gstatic URLs and Vietnamese place
// names tokenize very differently. So each payload is tokenized by the provider
// itself — sent as a prompt with maxTokens:1, reading back promptTokens.
//
// A live `searchPlaces` call is included, but note it runs the OSM/Overpass
// fallback locally: GOOGLE_PLACES_API_KEY and SERPER_API_KEY pull as empty
// strings from Vercel (Sensitive variables). The production Google Places branch
// returns MORE enrichment per place (google_rating, website_uri and up to 3
// gstatic photo URLs), so the live figure here is a FLOOR, not the production
// number. The synthetic fixture models the production shape.

const MEASURE = process.env.TAPPY_MEASURE === '1'

if (MEASURE) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

/** Tokenize with the real provider tokenizer. */
async function tokens(payload: unknown): Promise<number> {
  const r = await AI.generate({ role: 'smart', prompt: JSON.stringify(payload), maxTokens: 1 })
  return r.usage?.promptTokens ?? 0
}

function report(label: string, before: number, after: number, chars: [number, number]) {
  const pct = ((1 - after / (before || 1)) * 100).toFixed(1)
  console.log(
    `${label.padEnd(30)} model-facing ${String(before).padStart(6)} -> ${String(after).padStart(6)} tokens ` +
    `(-${pct}%)   chars ${chars[0]} -> ${chars[1]}`,
  )
}

// One place, production-shaped: Google Places branch with 3 gstatic photos and
// the ShopeeFood/GrabFood/BeFood order links the food path always attaches.
const prodPlace = (i: number) => ({
  place_id: `ChIJ${'x'.repeat(20)}${i}`,
  name: `Nhà Hàng Hải Sản Biển Đông ${i}`,
  address: `${i}23 Đường Trần Phú, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng`,
  google_rating: `4.${i}⭐ (2,${i}47 đánh giá Google Maps)`,
  maps_link: `https://www.google.com/maps/place/?q=place_id:ChIJ${'x'.repeat(20)}${i}`,
  website_uri: `https://haisanbiendong${i}.com.vn`,
  photo_url: `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ${'A'.repeat(40)}${i}&s=10`,
  photo_urls: [
    `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ${'A'.repeat(40)}${i}&s=10`,
    `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR${'B'.repeat(40)}${i}&s=10`,
    `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS${'C'.repeat(40)}${i}&s=10`,
  ],
  order_links: [
    { name: 'ShopeeFood', url: `https://shopeefood.vn/tim-kiem?q=Nh%C3%A0%20H%C3%A0ng%20H%E1%BA%A3i%20S%E1%BA%A3n%20Bi%E1%BB%83n%20%C4%90%C3%B4ng%20${i}%20%C4%90%C3%A0%20N%E1%BA%B5ng` },
    { name: 'GrabFood', url: `https://food.grab.com/vn/en/s?searchKeyword=Nh%C3%A0%20H%C3%A0ng%20H%E1%BA%A3i%20S%E1%BA%A3n%20Bi%E1%BB%83n%20%C4%90%C3%B4ng%20${i}` },
    { name: 'BeFood', url: 'https://be.com.vn/' },
  ],
})

describe.skipIf(!MEASURE)('B4 — tool payload', () => {
  it('production-shaped fixture (8 places, Google Places branch)', async () => {
    const full = {
      source: 'Google Maps',
      count: 8,
      results: Array.from({ length: 8 }, (_, i) => prodPlace(i + 1)),
      price_search_results: Array.from({ length: 6 }, (_, i) => ({
        title: `Menu Nhà Hàng Hải Sản ${i + 1} - Giá cả cập nhật`,
        link: `https://foody.vn/da-nang/nha-hang-hai-san-${i + 1}`,
        snippet: 'Tôm hùm 1.200.000đ, cua rang me 450.000đ, ghẹ hấp 380.000đ...',
      })),
      price_note: 'Gia tham khao tu ket qua tim kiem hien tai...',
    }
    const { model } = splitToolResult('search_places', full)
    const [before, after] = [await tokens(full), await tokens(model)]
    report('PROD-shaped search_places', before, after, [JSON.stringify(full).length, JSON.stringify(model).length])
    expect(after).toBeLessThan(before)
  }, 180_000)

  it('live search_places (OSM fallback — a FLOOR, not production)', async () => {
    const r = await searchPlaces('quan an ngon', 'Quan 1 Ho Chi Minh', 'restaurant', 'vi', null)
    const { model, enrichment } = splitToolResult('search_places', r)
    const [before, after] = [await tokens(r), await tokens(model)]
    report('LIVE search_places (OSM)', before, after, [JSON.stringify(r).length, JSON.stringify(model).length])
    console.log(`${''.padEnd(30)} enrichment retained server-side: ${enrichment.length} places`)
  }, 180_000)
})
