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
  it('🔑 follows the language of the emergency turn, not the UI language (UI is vi here)', () => {
    const mk = (lang: 'vi' | 'en' | 'zh', category: Parameters<typeof turn>[0]) => buildEmergencyTurn({ category, lang, userLocation: { lat: 21.03, lng: 105.85 }, priorMessages: [], now: new Date() }).annotation
    const zh = render(<EmergencyCard view={mk('zh', 'FIRE_RESCUE')} />)
    expect(screen.getByRole('link').textContent).toContain('拨打 114')
    expect(zh.container.textContent).toContain('紧急求助电话')
    expect(zh.container.textContent).not.toMatch(/Gọi|Số điện thoại/)
    expect(screen.getByRole('alert').getAttribute('aria-label')).toBe('紧急求助电话')
    cleanup()
    const en = render(<EmergencyCard view={mk('en', 'FIRE_RESCUE')} />)
    expect(screen.getByRole('link').textContent).toContain('Call 114')
    expect(en.container.textContent).toContain('Emergency numbers')
    cleanup()
    // 111 keeps the hours/free of its registry entry, written in the turn's language; the hotline name stays as the registry has it
    const z = render(<EmergencyCard view={mk('zh', 'CHILD_PROTECTION')} />)
    expect(z.container.textContent).toContain('Tổng đài Quốc gia Bảo vệ Trẻ em 111')
    expect(z.container.textContent).toContain('值班时间 24/7')
    expect(z.container.textContent).toContain('免费')
    expect(screen.getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['tel:111', 'tel:113'])
    cleanup()
    // 113 never gets hours or "free" in any language
    for (const lang of ['vi', 'en', 'zh'] as const) {
      const p = render(<EmergencyCard view={mk(lang, 'POLICE')} />)
      expect(p.container.textContent).not.toMatch(/24\/7|Miễn phí|Free|免费|Trực|Open|值班/)
      cleanup()
    }
  })
  it('an annotation without a language (older message) keeps the UI language', () => {
    const a = { ...turn('MEDICAL').annotation }; delete a.lang
    render(<EmergencyCard view={a} />)
    expect(screen.getByRole('link').textContent).toContain('Gọi 115')
  })
  it('renders nothing when there is no card (unknown place)', () => {
    const t = buildEmergencyTurn({ category: 'MEDICAL', lang: 'vi', userLocation: null, priorMessages: [], now: new Date() })
    const { container } = render(<EmergencyCard view={t.annotation} />)
    expect(container.innerHTML).toBe('')
  })
})
