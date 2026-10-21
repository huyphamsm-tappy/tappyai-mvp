// @vitest-environment jsdom
//
// Gate 2 F-A (A3-2 a) — TripPlanCard renders a stop photo only through the urlGuard contract (`isSafeHttpsUrl`). A plan read back
// from stored history may carry a photo_url written before A1. This is a risk reduction, not provenance: T10r pins that an https
// URL on any public host still renders (the residual this option was chosen with).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TripPlanCard, { type TappyPlan } from './TripPlanCard'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

afterEach(cleanup)

const planWith = (photo_url: string): TappyPlan => ({
  type: 'trip', title: 'Đà Lạt', people: 2, budget_total: '',
  days: [{ label: 'Ngày 1', items: [{ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', description: '', price: '', photo_url }] }],
})
const srcs = (photo: string) => {
  const { container } = render(<TripPlanCard plan={planWith(photo)} />)
  const out = [...container.querySelectorAll('img')].map(i => i.getAttribute('src'))
  cleanup()
  return out
}

describe('T10 · unsafe stop photos are not rendered', () => {
  for (const bad of [
    'data:image/svg+xml;base64,PHN2Zy8+',
    'javascript:alert(1)',
    'http://cdn.example/a.jpg',
    'https://u:p@cdn.example/a.jpg',
    'https://10.0.0.5/a.jpg',
    'https://localhost/a.jpg',
  ]) {
    it(bad, () => { expect(srcs(bad)).not.toContain(bad) })
  }
  it('control: a public https photo renders', () => {
    expect(srcs('https://cdn.example/a.jpg')).toContain('https://cdn.example/a.jpg')
  })
  it('the stop itself still renders without its photo', () => {
    const { container } = render(<TripPlanCard plan={planWith('javascript:alert(1)')} />)
    expect(container.textContent).toContain('Quán A')
  })
})

describe('T10r · residual of option (a), not a gate', () => {
  it('an https URL on an arbitrary public host still renders', () => {
    const exfil = 'https://attacker.example/p?d=x'
    expect(srcs(exfil)).toContain(exfil)
  })
})
