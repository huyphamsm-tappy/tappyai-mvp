// The share artifact — the ONE thing that leaves TappyAI when a user shares a
// recommendation or a plan.
//
// It is a WHITELIST. `SharedPlace` names every field allowed out; `pickPlace`
// copies exactly those. The tests below feed the builder a REAL `8:` annotation
// captured from `/api/chat` (not a hand-made fixture that is cleaner than
// production) and prove: every user-facing fact is present, nothing internal
// can appear, the text is deterministic, the brand footer is there, and the
// Inbox body fits `chat_messages.body ≤ 4000` without ever cutting a URL.

import { describe, it, expect } from 'vitest'
import type { LivePlace, PlacesLiveView } from '@/lib/recommendation/liveView'
import type { TappyPlan } from '@/components/TripPlanCard'
import fixture from './__fixtures__/placesLiveView.food.json'
import {
  INBOX_MAX_BODY,
  artifactUrls,
  buildPlacesArtifact,
  buildPlanArtifact,
  buildProseArtifact,
  compactBrochure,
  inboxBody,
  pickPlace,
  placeBlock,
  type SharedPlace,
} from './shareArtifact'
import { isShareableUrl } from './shareTargets'

const view = fixture as unknown as PlacesLiveView
const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const TITLE = 'Quán bún bò ngon ở TP.HCM'

// ------------------------------------------------------------ the fixture
describe('fixture is a real production frame', () => {
  it('is the tappy.places.v1 annotation with eight places', () => {
    expect(view.kind).toBe('tappy.places.v1')
    expect(view.items).toHaveLength(8)
    // The fields the prose stream does NOT carry — the reason mobile parses `8:`.
    expect(view.items[0].phone).toBeTruthy()
    expect(view.items[0].openingHours).toBeTruthy()
    expect(view.items[0].actions.some((a) => a.kind === 'maps' && a.urlKind === 'direct')).toBe(true)
    // And the internal fields the whitelist must keep out.
    expect(view.items[0].id).toMatch(/^place:/)
    expect(typeof view.items[0].rank).toBe('number')
  })
})

// --------------------------------------------------------------- whitelist
describe('pickPlace — whitelist', () => {
  it('copies only the named fields', () => {
    const p = pickPlace(view.items[0])
    expect(Object.keys(p).sort()).toEqual(
      ['address', 'category', 'image', 'links', 'name', 'openingHours', 'phone', 'rating', 'ratingCount'].sort()
    )
  })

  // The privacy field and the internal fields have NO slot to land in — even
  // when they are present on the input.
  it('cannot carry distanceKm, rank, id, matchVerdict, priceSignal or provenance', () => {
    const poisoned = {
      ...view.items[0],
      distanceKm: 0.9,
      matchVerdict: 'match',
      priceSignal: '50k',
      shortlistPosition: 1,
      provenance: { source_type: 'serper_places', evidence_type: 'listing' },
      _tappy_debug: 'x',
    } as unknown as LivePlace
    const p = pickPlace(poisoned) as unknown as Record<string, unknown>
    for (const k of ['distanceKm', 'rank', 'id', 'matchVerdict', 'priceSignal', 'shortlistPosition', 'provenance', '_tappy_debug', 'domain', 'kind']) {
      expect(p).not.toHaveProperty(k)
    }
    const text = placeBlock(p as unknown as SharedPlace, 0, 'vi')
    expect(text).not.toMatch(/0\.9|match|50k|serper|listing|_tappy_/)
  })

  it('keeps only direct https links of shareable kinds, deduplicated', () => {
    const p = pickPlace(view.items[0])
    for (const l of p.links) {
      expect(l.url).toMatch(/^https:\/\//)
      expect(['maps', 'website', 'review', 'order', 'booking', 'ticket', 'reservation']).toContain(l.kind)
    }
    expect(new Set(p.links.map((l) => l.url)).size).toBe(p.links.length)
    // Search links are the platform's search, not the venue — they stay out.
    // Checked against the ACTUAL search URLs the frame carries, not a guessed pattern.
    const searchUrls = view.items[0].actions.filter((a) => a.urlKind === 'search').map((a) => a.url)
    expect(searchUrls.length).toBeGreaterThan(0)
    for (const u of searchUrls) expect(p.links.some((l) => l.url === u)).toBe(false)
    expect(p.links.map((l) => l.url).sort()).toEqual(
      [...new Set(view.items[0].actions.filter((a) => a.urlKind === 'direct' && a.url.startsWith('https://')).map((a) => a.url))].sort()
    )
    // `call` is the phone field, not a link.
    expect(p.links.some((l) => (l.kind as string) === 'call')).toBe(false)
  })

  it('drops a javascript: or http: link even if it arrived as direct', () => {
    const bad = {
      ...view.items[0],
      actions: [
        { kind: 'maps', urlKind: 'direct', url: 'javascript:alert(1)', labelKey: 'x' },
        { kind: 'website', urlKind: 'direct', url: 'http://insecure.example', labelKey: 'x' },
        { kind: 'maps', urlKind: 'direct', url: 'https://maps.google.com/?cid=1', labelKey: 'x' },
      ],
    } as unknown as LivePlace
    expect(pickPlace(bad).links.map((l) => l.url)).toEqual(['https://maps.google.com/?cid=1'])
  })
})

describe('placeBlock — link labels', () => {
  it('names the platform when it adds information, and not when it only restates the kind', () => {
    const block = placeBlock({
      name: 'x',
      links: [
        { kind: 'website', url: 'https://a.example/', platform: 'Official Website' },
        { kind: 'maps', url: 'https://maps.google.com/?cid=1', platform: 'Google Maps' },
        { kind: 'review', url: 'https://www.tiktok.com/@a/video/1', platform: 'TikTok' },
        { kind: 'order', url: 'https://shopeefood.vn/x', platform: 'ShopeeFood' },
      ],
    }, 0, 'vi')
    expect(block).toContain('   Website: https://a.example/')
    expect(block).toContain('   Bản đồ: https://maps.google.com/?cid=1')
    expect(block).toContain('   Review (TikTok): https://www.tiktok.com/@a/video/1')
    expect(block).toContain('   Đặt món (ShopeeFood): https://shopeefood.vn/x')
    expect(block).not.toContain('Official Website')
  })
})

// ---------------------------------------------------------------- brochure
describe('buildPlacesArtifact — the brochure', () => {
  const a = buildPlacesArtifact(view, TITLE, 'vi', env)

  it('opens with the TappyAI header and closes with the brand footer', () => {
    expect(a.subject).toBe(`TappyAI gợi ý: ${TITLE}`)
    expect(a.text.startsWith(`TappyAI gợi ý: ${TITLE}\n\n1. `)).toBe(true)
    expect(a.text.endsWith('Gợi ý bởi TappyAI · www.tappyai.com')).toBe(true)
    expect(a.url).toBe('https://www.tappyai.com')
    expect(isShareableUrl(a.url, env)).toBe(true)
  })

  it('carries every place with its facts — no information loss vs the card', () => {
    expect(a.places).toHaveLength(8)
    view.items.forEach((p, i) => {
      expect(a.text).toContain(`${i + 1}. ${p.name}`)
      if (p.address) expect(a.text).toContain(`📍 ${p.address}`)
      if (p.phone) expect(a.text).toContain(`☎ ${p.phone}`)
      if (p.openingHours) expect(a.text).toContain(`🕐 ${p.openingHours}`)
      const maps = p.actions.find((x) => x.kind === 'maps' && x.urlKind === 'direct')
      if (maps) expect(a.text).toContain(`Bản đồ: ${maps.url}`)
    })
    expect(a.text).toContain('★ 4.9 (5.946 đánh giá)')
  })

  it('leaks nothing internal', () => {
    for (const forbidden of ['place:osm:', 'shortlistPosition', 'rank', 'provenance', 'evidence_type', 'source_type',
      'matchVerdict', 'distanceKm', 'priceSignal', '_tappy_', 'tappy.places.v1', 'openingHoursWeek']) {
      expect(a.text).not.toContain(forbidden)
    }
    expect(JSON.stringify(a.places)).not.toMatch(/distanceKm|provenance|matchVerdict|priceSignal|"rank"|"id"/)
  })

  it('is deterministic', () => {
    expect(buildPlacesArtifact(view, TITLE, 'vi', env).text).toBe(a.text)
  })

  it('every URL in the text is https and never a private TappyAI route', () => {
    const urls = artifactUrls(a)
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\//)
      expect(u).not.toMatch(/tappyai\.com\/(api|chat|admin|auth|login)/)
    }
  })

  it('speaks English when asked', () => {
    const en = buildPlacesArtifact(view, 'beef', 'en', env)
    expect(en.text.startsWith('TappyAI recommends: beef')).toBe(true)
    expect(en.text).toContain('Maps: https://')
    expect(en.text).toContain('(5,946 reviews)')
    expect(en.text.endsWith('Recommended by TappyAI · www.tappyai.com')).toBe(true)
  })
})

// ------------------------------------------------------------- compaction
describe('inboxBody — Tappy Inbox ≤ 4000, URLs intact', () => {
  const big: PlacesLiveView = { ...view, items: Array.from({ length: 6 }, () => view.items).flat() }
  const a = buildPlacesArtifact(big, TITLE, 'vi', env)

  it('the inflated brochure really overflows', () => {
    expect(a.text.length).toBeGreaterThan(INBOX_MAX_BODY)
  })

  it('fits, keeps header + footer, says how many were dropped', () => {
    const body = inboxBody(a, 'vi')
    expect(body.length).toBeLessThanOrEqual(INBOX_MAX_BODY)
    expect(body.startsWith(`TappyAI gợi ý: ${TITLE}`)).toBe(true)
    expect(body.endsWith('Gợi ý bởi TappyAI · www.tappyai.com')).toBe(true)
    expect(body).toMatch(/và \d+ địa điểm khác/)
  })

  it('never cuts a URL — every URL in the body is a whole URL from the full text', () => {
    const body = inboxBody(a, 'vi')
    const urls = body.match(/https:\/\/\S+/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(a.text.includes(`${u}\n`) || a.text.endsWith(u)).toBe(true)
  })

  it('passes a short brochure through unchanged', () => {
    const small = buildPlacesArtifact({ ...view, items: view.items.slice(0, 2) }, TITLE, 'vi', env)
    expect(inboxBody(small, 'vi')).toBe(small.text)
  })

  it('holds the bound even for a single enormous place', () => {
    const monster = { ...view.items[0], address: 'x'.repeat(5000) } as LivePlace
    const out = compactBrochure(TITLE, [pickPlace(monster)], 'vi', 'https://www.tappyai.com')
    expect(out.length).toBeLessThanOrEqual(INBOX_MAX_BODY)
    expect(out).toContain(`1. ${monster.name}`)
  })
})

// ------------------------------------------------------------------- prose
describe('buildProseArtifact — a turn with no card and no plan', () => {
  it('keeps safe links as "label: url", drops images and unsafe links, and carries the brand', () => {
    const a = buildProseArtifact(
      'máy bay đi Đà Nẵng',
      '**Gợi ý**: đặt qua [Traveloka](https://www.traveloka.com/vi-vn) · [Evil](javascript:alert(1)) ![ảnh](https://img.example/a.jpg)\n\nXem thêm https://www.vietnamairlines.com/ nhé http://insecure.example/x',
      env,
    )
    expect(a.subject).toBe('TappyAI: máy bay đi Đà Nẵng')
    expect(a.text.startsWith('TappyAI\n\nGợi ý: đặt qua Traveloka: https://www.traveloka.com/vi-vn · Evil')).toBe(true)
    expect(a.text).not.toContain('javascript:')
    expect(a.text).not.toContain('img.example')
    expect(a.text).not.toContain('**')
    expect(a.text).toContain('https://www.vietnamairlines.com/')
    expect(a.text).not.toContain('insecure.example')
    expect(a.text.endsWith('— TappyAI · tappyai.com')).toBe(true)
    expect(a.places).toEqual([])
  })
})

// -------------------------------------------------------------------- plan
describe('buildPlanArtifact — deterministic from the plan structure', () => {
  const plan: TappyPlan = {
    type: 'trip',
    title: '1 ngày Đà Nẵng',
    people: 2,
    budget_total: '1.500.000₫',
    share_text: 'Kế hoạch 1 ngày Đà Nẵng cho 2 người — xem tại https://evil.example',
    days: [{
      label: 'Ngày 1',
      items: [{
        time: '08:00', emoji: '☕', category: 'food', name: 'Cà phê Cộng', description: 'Bắt đầu nhẹ',
        price: '60.000₫', address: '96 Bạch Đằng', maps_link: 'https://maps.google.com/?q=Cong',
        booking_link: 'javascript:alert(1)', place_id: 'ChIJ-secret',
      }],
    }],
  }

  it('builds the brochure from days/items; share_text with a URL is not copied', () => {
    const a = buildPlanArtifact(plan, 'vi', env)
    expect(a.kind).toBe('plan')
    expect(a.text.startsWith('Kế hoạch từ TappyAI: 1 ngày Đà Nẵng\n')).toBe(true)
    expect(a.text).not.toContain('evil.example')
    expect(a.text).toContain('2 người · Ngân sách: 1.500.000₫')
    expect(a.text).toContain('Ngày 1\n  08:00 ☕ Cà phê Cộng\n     Bắt đầu nhẹ\n     60.000₫ · 📍 96 Bạch Đằng\n     Bản đồ: https://maps.google.com/?q=Cong')
    expect(a.text).not.toContain('javascript:')
    expect(a.text).not.toContain('ChIJ-secret')
    expect(a.text.endsWith('Gợi ý bởi TappyAI · www.tappyai.com')).toBe(true)
  })

  it('lets a short, URL-free share_text be the intro line only', () => {
    const a = buildPlanArtifact({ ...plan, share_text: 'Một ngày thật chill ở Đà Nẵng!' }, 'vi', env)
    expect(a.text.split('\n')[1]).toBe('Một ngày thật chill ở Đà Nẵng!')
  })
})
