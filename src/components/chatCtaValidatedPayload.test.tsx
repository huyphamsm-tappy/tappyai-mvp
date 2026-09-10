// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseCTA, parseCTAValidated } from './ChatInterface'
import { vi as viDict } from '@/lib/i18n/w5/placeDecision'

// ── The measured model-authored CTA, end to end through the parse path ──────
//
// 🚨 Verbatim from the event turn 2026-09-09. The reply had just said it found
// no events and still emitted a purchase promise pointing at an aggregator
// HOMEPAGE. `parseCTA` returns the model's buttons unchanged, so the label was
// whatever the model felt like writing.

const t = (key: string, vars?: Record<string, string>) => {
  const raw = (viDict as Record<string, string>)[key] ?? key
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : raw
}

/** The exact block the model produced. */
const MEASURED = 'Bạn có thể xem thêm.\n\n[CTA_BUTTONS]' + JSON.stringify({
  buttons: [
    { label: '🎫 Ticketbox - Mua vé sự kiện', type: 'website', url: 'https://ticketbox.vn/', primary: true },
    { label: '📅 Lịch sự kiện TP.HCM', type: 'website', url: 'https://sodulich.hochiminhcity.gov.vn/', primary: false },
  ],
}) + '[/CTA_BUTTONS]'

describe('the measured CTA payload', () => {
  it('the raw parse still lets the promise through — that was the hole', () => {
    const { buttons } = parseCTA(MEASURED)
    expect(buttons[0].label).toContain('Mua vé')
  })

  it('the validated parse downgrades it to a search label', () => {
    const { buttons } = parseCTAValidated(MEASURED, t)
    expect(buttons[0].label).not.toContain('Mua vé')
    expect(buttons[0].label).toBe('Tìm vé trên Ticketbox')
    expect(buttons[0].type).toBe('search')
  })

  it('keeps the destination and the other button untouched', () => {
    const { buttons } = parseCTAValidated(MEASURED, t)
    expect(buttons[0].url).toBe('https://ticketbox.vn/')
    expect(buttons).toHaveLength(2)
    expect(buttons[1].label).toBe('📅 Lịch sự kiện TP.HCM')
  })

  it('strips the marker from the visible text exactly as before', () => {
    expect(parseCTAValidated(MEASURED, t).text).toBe(parseCTA(MEASURED).text)
    expect(parseCTAValidated(MEASURED, t).text).not.toContain('CTA_BUTTONS')
  })

  it('a direct entity-level ticket URL keeps its purchase label', () => {
    const content = '[CTA_BUTTONS]' + JSON.stringify({
      buttons: [{ label: '🎫 Mua vé CGV', type: 'booking', url: 'https://www.cgv.vn/default/cinox/site/cgv-vincom-dong-khoi/', primary: true }],
    }) + '[/CTA_BUTTONS]'
    const { buttons } = parseCTAValidated(content, t)
    expect(buttons[0].label).toBe('🎫 Mua vé CGV')
    expect(buttons[0].type).toBe('booking')
  })
})
