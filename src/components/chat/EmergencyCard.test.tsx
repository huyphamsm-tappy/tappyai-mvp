/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/i18n/useTranslation', async () => {
  const { vi: dict } = await import('@/lib/i18n/w5/safetyEmergency')
  return { useTranslation: () => ({ t: (k: string, v?: Record<string, string>) => Object.entries(v ?? {}).reduce((s, [a, b]) => s.replace(`{${a}}`, b), dict[k] ?? k), locale: 'vi' }) }
})
import EmergencyCard from './EmergencyCard'
import { buildEmergencyTurn } from '@/lib/safety/emergencyResponse'

afterEach(cleanup)
const turn = (category: Parameters<typeof buildEmergencyTurn>[0]['category']) => buildEmergencyTurn({ category, lang: 'vi', userLocation: { lat: 21.03, lng: 105.85 }, priorMessages: [], now: new Date() })

describe('EmergencyCard', () => {
  it('renders a tel: button in plain Vietnamese for 115 and states neither hours nor "free"', () => {
    const { container } = render(<EmergencyCard view={turn('MEDICAL').annotation} />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('tel:115')
    expect(a.textContent).toContain('Gọi 115')
    expect(container.textContent).not.toMatch(/24\/7|Miễn phí|Trực/)
  })
  it('shows hours and "free" for 111, where the registry has them', () => {
    const { container } = render(<EmergencyCard view={turn('CHILD_PROTECTION').annotation} />)
    expect(container.textContent).toMatch(/Trực 24\/7/)
    expect(container.textContent).toMatch(/Miễn phí/)
  })
  it('renders nothing when there is no card (unknown place)', () => {
    const t = buildEmergencyTurn({ category: 'MEDICAL', lang: 'vi', userLocation: null, priorMessages: [], now: new Date() })
    const { container } = render(<EmergencyCard view={t.annotation} />)
    expect(container.innerHTML).toBe('')
  })
})
