// @vitest-environment jsdom
//
// Owner UAT blocker 2026-09-28: a literal "**" in chat answers, every vertical. The web prose
// renderer and every web card that prints a model string as plain text must never paint one.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { formatMessage } from './ChatInterface'
import TripPlanCard, { type TappyPlan } from './TripPlanCard'
import ShoppingDecision from './chat/ShoppingDecision'
import { parseFollowups } from '@/lib/structuredContent/parseFollowups'
import type { SynthesisView } from '@/lib/ai/consultative/synthesisView'

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }), setLocale: () => {} }))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

afterEach(cleanup)

const visible = (html: string) => {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent ?? ''
}

describe('formatMessage — prose', () => {
  it.each([
    ['orphan at line end', 'Giá tốt nhất **'],
    ['pair across a line break', '**Ngày 1\nđi chơi**'],
    ['inner spaces', '** text**'],
    ['card-shaped rating', '**4.7⭐'],
    ['triple', '***Đà Lạt***'],
    ['nested / unbalanced', '**a **b** c** và **d'],
    ['triple closer', '**Lưu ý:*** mang áo mưa'],
  ])('%s never paints an asterisk', (_name, input) => {
    const html = formatMessage(input)
    expect(visible(html)).not.toContain('*')
    expect(html).not.toContain('<em></em>')
  })
  it('matched pairs still render bold', () => {
    expect(formatMessage('**Phở Gà** ngon')).toContain('<strong>Phở Gà</strong>')
    expect(formatMessage('** text**')).toContain('<strong>text</strong>')
    expect(formatMessage('***Đà Lạt***')).toContain('<strong>Đà Lạt</strong>')
  })
})

describe('cards — model strings render as plain text', () => {
  it('TripPlanCard strips markdown from every text field', () => {
    const plan: TappyPlan = {
      type: 'trip', title: '**Đà Lạt 2N1Đ**', budget_total: '**3 triệu**',
      days: [{ label: '**Ngày 1**', items: [{ time: '08:00', emoji: '☕', category: 'food', name: '**Quán A**', description: 'Đánh giá **4.7⭐', price: '**50k**', address: '**1 Lê Lợi**' }] }],
      cost_breakdown: { '**Ăn uống**': '**1 triệu**' },
      local_tips: [{ text: '**Mang áo ấm**', basis: 'general' }],
    }
    const { container } = render(<TripPlanCard plan={plan} />)
    expect(container.textContent).not.toContain('*')
    expect(container.textContent).toContain('Đánh giá 4.7⭐')
  })

  it('ShoppingDecision strips markdown from names and configs', () => {
    const view: SynthesisView = {
      v: 1,
      entities: [{
        key: 'm1', name: '**MacBook Air M1**', config: '**M1 · 8GB**', specs: [], condition: null, matchesRequest: 'khop', recommended: true,
        priceLow: 18_000_000, priceHigh: 19_000_000, image: null,
        offers: [{ seller: 'Zin100.vn', url: 'https://shop/zin', price: 18_000_000, currency: 'VND', condition: null }],
      }],
      recommendation: null,
    }
    const { container } = render(<ShoppingDecision view={view} />)
    expect(container.textContent).toContain('MacBook Air M1')
    expect(container.textContent).not.toContain('*')
  })

  it('follow-up chips are plain text', () => {
    expect(parseFollowups('ok\n[FOLLOWUPS]**Giá**?|Còn *quán* khác?[/FOLLOWUPS]').followups).toEqual(['Giá?', 'Còn quán khác?'])
  })
})
