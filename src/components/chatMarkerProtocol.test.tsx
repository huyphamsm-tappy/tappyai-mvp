// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parsePlan, parseCTA, parseFollowups } from './ChatInterface'
import { parseShoppingMarker } from '@/lib/ai/consultative/synthesisView'

// ── P0-1: the marker protocol boundary, web side ─────────────────────────────
//
// The server owns a CLOSED set of marker blocks and injects them into the assistant TEXT stream,
// because text is the only channel that survives persistence and reload. It does not branch on
// which client is reading. So every marker must be consumed by every client, in every shape the
// transport can produce, or its payload renders as message body.
//
// This file is the WEB half of a matrix that Android runs too
// (ChatResponseParserMarkerLeakTest.kt). Same markers, same shapes, same assertions — because the
// bug being prevented is "one client learned about a marker and the others did not", and a test
// that exists on only one client cannot catch it.
//
//   closed        `[X]…[/X]`                  the normal, complete block
//   unterminated  `[X]…` at end of snapshot   a block still arriving mid-stream, or a reply that
//                                             hit finishReason "length" mid-JSON
//   orphan-open   a lone `[X]`                a block whose payload never came
//   orphan-close  a lone `[/X]`               a block whose opening was consumed upstream
//   malformed     `[X]{not json[/X]`          a block whose payload does not parse
//
// ⚠️ THE ASSERTION CHECKS THE PAYLOAD, NOT JUST THE TAG. Stripping `[TAPPY_SHOPPING]` while
// leaving the JSON it wrapped still shows the user raw JSON. The Android version of this test was
// initially written tag-only and a mutation proved it worthless, so each body carries a sentinel —
// one that deliberately does NOT contain the marker name, otherwise the two assertions fire
// together and neither can be shown to work on its own.

const MARKERS = ['TAPPY_PLAN', 'CTA_BUTTONS', 'FOLLOWUPS', 'TAPPY_SHOPPING'] as const
type Marker = (typeof MARKERS)[number]

const sentinel = (m: Marker) => `ZQSENTINEL${MARKERS.indexOf(m)}QZ`

const bodyFor = (m: Marker): string => {
  switch (m) {
    case 'TAPPY_PLAN':
      return JSON.stringify({ type: 'trip', title: sentinel(m), days: [] })
    case 'CTA_BUTTONS':
      return JSON.stringify({ buttons: [{ label: sentinel(m), type: 'maps', url: 'https://maps.example', primary: true }] })
    case 'FOLLOWUPS':
      return `${sentinel(m)}|Có chỗ đậu xe không?|Mở cửa mấy giờ?`
    case 'TAPPY_SHOPPING':
      return JSON.stringify({ v: 1, entities: [{ key: sentinel(m), config: 'M1 · 32GB', offers: [] }], recommendation: null })
  }
}

/** The exact chain ChatInterface renders with — order included, because order is behaviour. */
function renderText(content: string): string {
  const { text: afterPlan } = parsePlan(content)
  const { text: afterCta } = parseCTA(afterPlan)
  const { text: afterFollowups } = parseFollowups(afterCta)
  const { text } = parseShoppingMarker(afterFollowups)
  return text
}

function expectClean(label: string, reply: string) {
  const text = renderText(reply)
  for (const m of MARKERS) {
    // The context goes in expect()'s message argument, NOT into the asserted value: interpolating
    // the marker name into the string under test makes `not.toContain(m)` fail unconditionally.
    expect(text, `${label} · ${m} · tag survived`).not.toContain(m)
    expect(text, `${label} · ${m} · body survived`).not.toContain(sentinel(m))
  }
}

describe('P0-1 · no marker block survives the web parse chain', () => {
  it.each(MARKERS)('closed %s block leaves no tag and no payload', (m) => {
    expectClean('closed', `Gợi ý đây nhé.\n[${m}]${bodyFor(m)}[/${m}]`)
  })

  it.each(MARKERS)('unterminated %s block at end of snapshot leaves no tag and no payload', (m) => {
    expectClean('unterminated', `Gợi ý đây nhé.\n[${m}]${bodyFor(m)}`)
  })

  it.each(MARKERS)('orphan opening %s tag leaves nothing behind', (m) => {
    expectClean('orphan-open', `Gợi ý đây nhé.\n[${m}]\nCòn gì nữa không?`)
  })

  it.each(MARKERS)('orphan closing %s tag leaves nothing behind', (m) => {
    expectClean('orphan-close', `Gợi ý đây nhé.\n[/${m}]\nCòn gì nữa không?`)
  })

  it.each(MARKERS)('malformed %s payload leaks neither the tag nor the payload', (m) => {
    expectClean('malformed', `Trước.\n[${m}]{not json[/${m}]\nSau.`)
  })
})

describe('P0-1 · the production shape of the shopping leak', () => {
  // streamEnrichment emits the shopping block as its own `0:` frame right after the tool result,
  // so it arrives BEFORE any prose. A test that only ever puts the marker at the end would miss
  // how the leak actually presented: as the first thing on screen.
  it('a shopping block arriving before the prose leaves clean prose', () => {
    const reply = `[TAPPY_SHOPPING]${bodyFor('TAPPY_SHOPPING')}[/TAPPY_SHOPPING]\n\nMình gợi ý cấu hình này.`
    expectClean('early-emit', reply)
    expect(renderText(reply)).toBe('Mình gợi ý cấu hình này.')
  })

  it('a full reply carrying all four blocks keeps its prose', () => {
    const reply =
      `[TAPPY_SHOPPING]${bodyFor('TAPPY_SHOPPING')}[/TAPPY_SHOPPING]\n\n` +
      'Mình nghiêng về **MacBook Air M1** nhé.\n' +
      `[TAPPY_PLAN]${bodyFor('TAPPY_PLAN')}[/TAPPY_PLAN]\n` +
      `[CTA_BUTTONS]${bodyFor('CTA_BUTTONS')}[/CTA_BUTTONS]\n` +
      `[FOLLOWUPS]${bodyFor('FOLLOWUPS')}`
    expectClean('full-reply', reply)
    expect(renderText(reply)).toContain('MacBook Air M1')
  })
})

describe('P0-1 · existing protocols still WORK, not merely stop leaking', () => {
  // Stripping is trivially achievable by deleting everything. These pin that each block is still
  // decoded into its model after the chain was extended.
  it('CTA buttons are still decoded', () => {
    const { buttons } = parseCTA(`Đi thử nhé.\n[CTA_BUTTONS]${bodyFor('CTA_BUTTONS')}[/CTA_BUTTONS]`)
    expect(buttons).toHaveLength(1)
    expect(buttons[0].label).toBe(sentinel('CTA_BUTTONS'))
  })

  it('followups are still decoded', () => {
    const { followups } = parseFollowups(`Gợi ý đây.\n[FOLLOWUPS]${bodyFor('FOLLOWUPS')}`)
    expect(followups).toEqual([sentinel('FOLLOWUPS'), 'Có chỗ đậu xe không?', 'Mở cửa mấy giờ?'])
  })

  it('a valid plan is still decoded', () => {
    const body = JSON.stringify({ type: 'trip', title: 'Đà Nẵng', days: [{ label: 'Ngày 1', items: [] }] })
    const { plan } = parsePlan(`Kế hoạch đây.\n[TAPPY_PLAN]${body}[/TAPPY_PLAN]`)
    expect(plan?.days).toHaveLength(1)
  })

  it('a valid shopping view is still decoded', () => {
    const reply = `Gợi ý.\n[TAPPY_SHOPPING]${bodyFor('TAPPY_SHOPPING')}[/TAPPY_SHOPPING]`
    expect(parseShoppingMarker(reply).view?.entities[0].key).toBe(sentinel('TAPPY_SHOPPING'))
  })

  it('a reply with no markers is returned unchanged', () => {
    expect(renderText('Quán này ngon lắm, bạn thử nhé!')).toBe('Quán này ngon lắm, bạn thử nhé!')
  })

  it('ordinary text mentioning brackets is not eaten', () => {
    // The strip patterns must key on the marker names, not on brackets in general.
    const reply = 'Cú pháp là [key] và {value} nhé.'
    expect(renderText(reply)).toBe(reply)
  })
})
