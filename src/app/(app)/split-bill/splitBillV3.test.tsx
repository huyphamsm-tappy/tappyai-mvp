// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/split-bill',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))
vi.mock('@/components/v3/TappyPresence', () => ({
  __esModule: true,
  default: ({ pose }: { pose?: string }) => <span data-testid="tappy" data-pose={pose} />,
}))
vi.mock('@/components/chat/AskTappyButton', () => ({
  __esModule: true,
  default: ({ subject }: { subject: string }) => <button type="button" data-testid="ask-tappy" data-subject={subject} />,
}))

import SplitBillPage from './page'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/w3/splitBill'

// ── Split the bill — the V3 skin over the SAME arithmetic ──────────────────
//
// The reskin (2026-09-12) recomposed the page: hero, four input cards, a
// stepper, segmented tip and mode controls, a gradient result. The math is
// exactly what it was — total × (1 + tip/100) ÷ people, display-rounded by
// `fmt` — and so are the limits (2–20 people, presets 0/5/10/15/20, a free
// percentage, equal or by-item). These tests pin the numbers first.

const SRC = readFileSync('src/app/(app)/split-bill/page.tsx', 'utf8')
const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })

// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
afterEach(cleanup)

const total = () => document.getElementById('sb-total') as HTMLInputElement
const perPerson = () => document.querySelector('[data-sb-per-person]') as HTMLElement | null
const count = () => document.querySelector('[data-sb-count]')!.textContent
const dec = () => document.querySelector('[data-sb-dec]') as HTMLButtonElement
const inc = () => document.querySelector('[data-sb-inc]') as HTMLButtonElement
const tipButton = (label: string) => within(document.querySelector('[data-sb-tip]') as HTMLElement).getByRole('button', { name: label })

describe('arithmetic and rounding are the page’s own', () => {
  it('splits total × (1 + tip) ÷ people and formats with fmt — the default is 2 people, no tip', () => {
    render(<SplitBillPage />)
    expect(document.querySelector('[data-sb-empty]')).toBeTruthy()
    expect(perPerson()).toBeNull()
    fireEvent.change(total(), { target: { value: '1000000' } })
    expect(perPerson()!.textContent).toBe(`${fmt(500000)} đ`)
    expect(document.querySelector('[data-sb-includes-tip]')).toBeNull()
    const cells = [...document.querySelectorAll('[data-sb-breakdown] p:nth-child(2)')].map(p => p.textContent)
    expect(cells).toEqual([`${fmt(1000000)} đ`, `${fmt(0)} đ`, `${fmt(1000000)} đ`])
  })

  it('applies a preset tip to the grand total before dividing, and says so', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '1000000' } })
    fireEvent.click(tipButton('10%'))
    expect(tipButton('10%').getAttribute('aria-pressed')).toBe('true')
    expect(perPerson()!.textContent).toBe(`${fmt(550000)} đ`)
    expect(document.querySelector('[data-sb-includes-tip]')!.textContent).toContain(fmt(1100000))
  })

  it('a custom percentage overrides the preset and clears the preset highlight', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '300000' } })
    fireEvent.click(tipButton('20%'))
    fireEvent.change(document.getElementById('sb-tip-custom') as HTMLInputElement, { target: { value: '7' } })
    expect(tipButton('20%').getAttribute('aria-pressed')).toBe('false')
    expect(perPerson()!.textContent).toBe(`${fmt(300000 * 1.07 / 2)} đ`)
    // Picking a preset again clears the custom field.
    fireEvent.click(tipButton('5%'))
    expect((document.getElementById('sb-tip-custom') as HTMLInputElement).value).toBe('')
    expect(perPerson()!.textContent).toBe(`${fmt(300000 * 1.05 / 2)} đ`)
  })

  it('rounds for DISPLAY only — the underlying float is not rounded before dividing', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '100000' } })
    fireEvent.click(tipButton('15%'))
    // 115000 / 2 = 57500 exactly; with 3 people 38333.33 → shown as 38.333
    fireEvent.click(inc())
    expect(perPerson()!.textContent).toBe(`${fmt(115000 / 3)} đ`)
    expect(perPerson()!.textContent).toBe('38.333 đ')
    // The source never rounds the math: no Math.round / toFixed around the formulas.
    expect(SRC).not.toMatch(/Math\.round\(|\.toFixed\(/)
  })

  it('the stepper stops at 2 and at 20, and disables the button at each end', () => {
    render(<SplitBillPage />)
    expect(count()).toBe('2')
    expect(dec().disabled).toBe(true)
    fireEvent.click(dec())
    expect(count()).toBe('2')
    for (let i = 0; i < 25; i++) fireEvent.click(inc())
    expect(count()).toBe('20')
    expect(inc().disabled).toBe(true)
    fireEvent.click(dec())
    expect(count()).toBe('19')
    expect(inc().disabled).toBe(false)
  })

  it('offers exactly the five presets plus the custom field', () => {
    render(<SplitBillPage />)
    const labels = [...document.querySelectorAll('[data-sb-tip] button')].map(b => b.textContent)
    expect(labels).toEqual([enCopy['splitBill.tipNone'], '5%', '10%', '15%', '20%'])
    expect(document.getElementById('sb-tip-custom')).toBeTruthy()
    expect(SRC).toContain('const TIP_PRESETS = [0, 5, 10, 15, 20]')
  })
})

describe('split modes', () => {
  it('defaults to equal; switching to by-item shows the per-person list and hides the equal result', () => {
    render(<SplitBillPage />)
    expect(document.querySelector('[data-sb-mode-equal]')!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(document.querySelector('[data-sb-mode-custom]') as HTMLElement)
    expect(document.querySelector('[data-sb-result]')).toBeNull()
    expect(document.querySelector('[data-sb-custom]')).toBeTruthy()
    expect(document.querySelectorAll('[data-sb-custom] li')).toHaveLength(2)
  })

  it('by-item: each share is the person’s amount × (1 + tip); add and remove stay within 2–20', () => {
    render(<SplitBillPage />)
    fireEvent.click(document.querySelector('[data-sb-mode-custom]') as HTMLElement)
    fireEvent.click(tipButton('10%'))
    fireEvent.change(document.getElementById('sb-amount-1') as HTMLInputElement, { target: { value: '100000' } })
    fireEvent.change(document.getElementById('sb-amount-2') as HTMLInputElement, { target: { value: '50000' } })
    const result = document.querySelector('[data-sb-custom-result]') as HTMLElement
    expect(result.textContent).toContain(`${fmt(110000)} đ`)
    expect(result.textContent).toContain(`${fmt(55000)} đ`)
    expect(result.textContent).toContain(`${fmt(165000)} đ`)
    // No remove button at the minimum of two.
    expect(screen.queryByRole('button', { name: /remove|xóa/i })).toBeNull()
    fireEvent.click(document.querySelector('[data-sb-add]') as HTMLElement)
    expect(document.querySelectorAll('[data-sb-custom] li')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /remove|xóa/i })).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: /remove|xóa/i })[2])
    expect(document.querySelectorAll('[data-sb-custom] li')).toHaveLength(2)
  })

  it('the Ask-Tappy bridge appears only with a real equal-split result', () => {
    render(<SplitBillPage />)
    expect(screen.queryByTestId('ask-tappy')).toBeNull()
    fireEvent.change(total(), { target: { value: '200000' } })
    expect(screen.getByTestId('ask-tappy').getAttribute('data-subject')).toContain(fmt(100000))
    fireEvent.click(document.querySelector('[data-sb-mode-custom]') as HTMLElement)
    expect(screen.queryByTestId('ask-tappy')).toBeNull()
  })
})

describe('surface', () => {
  it('has one h1 from the existing title, the hero copy, three truthful chips, and an aria-hidden scene with the existing pose', () => {
    render(<SplitBillPage />)
    const h1s = document.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toBe(enCopy['splitBill.title'])
    expect(document.querySelector('[data-sb-hero]')!.textContent).toContain(enCopy['splitBill.heroSubtitle'])
    const chips = [...document.querySelectorAll('[data-sb-chips] li')].map(li => li.textContent)
    expect(chips).toHaveLength(3)
    expect(chips[0]).toContain('2–20')
    const scene = document.querySelector('[data-sb-scene]') as HTMLElement
    expect(scene.getAttribute('aria-hidden')).toBe('true')
    expect(within(scene).getByTestId('tappy').getAttribute('data-pose')).toBe('wave')
    expect(document.querySelector('[data-sb-hero]')!.querySelector('img, video, picture')).toBeNull()
  })

  it('labels every control and keeps the disclaimer', () => {
    render(<SplitBillPage />)
    expect(screen.getByLabelText(enCopy['splitBill.billTotalLabel'])).toBe(total())
    expect(screen.getByRole('group', { name: enCopy['splitBill.peopleLabel'] })).toBeTruthy()
    expect(screen.getByRole('group', { name: enCopy['splitBill.tipLabel'] })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: enCopy['splitBill.modeLabel'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: enCopy['splitBill.decrease'] })).toBe(dec())
    expect(document.querySelector('[data-sb-disclaimer]')!.textContent).toContain(enCopy['splitBill.disclaimer'])
  })

  it('draws no scanner, payment, history or recommendation — and no hardcoded Vietnamese UI text', () => {
    render(<SplitBillPage />)
    expect(document.body.textContent).not.toMatch(/scan|quét|thanh toán ngay|pay now|lịch sử|history|đề xuất|recommend/i)
    expect(SRC).not.toMatch(/fetch\(/)
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // `đ` after a formatted amount is the currency sign the page has always printed, not UI copy.
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l.replace(/\{fmt\([^)]*\)\} đ|>đ<|'đ'/g, '')))).toEqual([])
  })

  it('every splitBill.* key the page renders exists in both dictionaries', () => {
    const keys = [...SRC.matchAll(/'(splitBill\.[a-zA-Z0-9]+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(20)
    for (const key of keys) {
      expect(viCopy[key], `${key} missing from vi`).toBeTruthy()
      expect(enCopy[key], `${key} missing from en`).toBeTruthy()
    }
  })
})

// ── UAT fix 2026-09-12: entering by-item fits the list to the people count ──
//
// `syncPeopleCount` only resized the person list while ALREADY in by-item mode. Stepping
// 2 → 5 in equal mode and then switching showed two rows for five people. Entering the mode
// now fits the list first; the stepper inside the mode behaves as before.

const enterCustom = () => fireEvent.click(document.querySelector('[data-sb-mode-custom]') as HTMLElement)
const rows = () => document.querySelectorAll('[data-sb-custom] li')
const names = () => [...document.querySelectorAll('[data-sb-custom] li input:not([type="number"])')].map(i => (i as HTMLInputElement).value)
const nameInput = (id: number) => document.getElementById(`sb-name-${id}`) as HTMLInputElement

describe('entering by-item fits the list to the people count', () => {
  it('A · equal mode 2 → 5, enter by-item → exactly 5 people, default-named in order', () => {
    render(<SplitBillPage />)
    for (let i = 0; i < 3; i++) fireEvent.click(inc())
    expect(count()).toBe('5')
    enterCustom()
    expect(rows()).toHaveLength(5)
    expect(names()).toEqual([1, 2, 3, 4, 5].map(n => enCopy['splitBill.personDefaultName'].replace('{n}', String(n))))
  })

  it('B · equal mode 5 → 2, enter by-item → exactly 2 people', () => {
    render(<SplitBillPage />)
    for (let i = 0; i < 3; i++) fireEvent.click(inc())
    for (let i = 0; i < 3; i++) fireEvent.click(dec())
    expect(count()).toBe('2')
    enterCustom()
    expect(rows()).toHaveLength(2)
  })

  it('C · names and amounts already entered are kept when the count grows', () => {
    render(<SplitBillPage />)
    enterCustom()
    fireEvent.change(nameInput(1), { target: { value: 'An' } })
    fireEvent.change(document.getElementById('sb-amount-1') as HTMLInputElement, { target: { value: '120000' } })
    fireEvent.change(nameInput(2), { target: { value: 'Bình' } })
    // Back to equal, grow to 4, re-enter.
    fireEvent.click(document.querySelector('[data-sb-mode-equal]') as HTMLElement)
    fireEvent.click(inc()); fireEvent.click(inc())
    enterCustom()
    expect(rows()).toHaveLength(4)
    expect(names().slice(0, 2)).toEqual(['An', 'Bình'])
    expect((document.getElementById('sb-amount-1') as HTMLInputElement).value).toBe('120000')
    // New rows are default-named by position, not renamed copies.
    expect(names()[2]).toBe(enCopy['splitBill.personDefaultName'].replace('{n}', '3'))
  })

  it('D · remaining people keep their names when the count shrinks; only the tail is dropped', () => {
    render(<SplitBillPage />)
    fireEvent.click(inc()); fireEvent.click(inc()) // 4
    enterCustom()
    expect(rows()).toHaveLength(4)
    fireEvent.change(nameInput(1), { target: { value: 'An' } })
    fireEvent.change(nameInput(2), { target: { value: 'Bình' } })
    fireEvent.change(nameInput(4), { target: { value: 'Dũng' } })
    fireEvent.click(document.querySelector('[data-sb-mode-equal]') as HTMLElement)
    fireEvent.click(dec()); fireEvent.click(dec()) // 2
    enterCustom()
    expect(rows()).toHaveLength(2)
    expect(names()).toEqual(['An', 'Bình'])
  })

  it('E/F · the bounds still hold: the list can never hold fewer than 2 or more than 20', () => {
    render(<SplitBillPage />)
    for (let i = 0; i < 30; i++) fireEvent.click(inc())
    expect(count()).toBe('20')
    enterCustom()
    expect(rows()).toHaveLength(20)
    expect(document.querySelector('[data-sb-add]'), 'no add button at the maximum').toBeNull()
    fireEvent.click(document.querySelector('[data-sb-mode-equal]') as HTMLElement)
    for (let i = 0; i < 30; i++) fireEvent.click(dec())
    expect(count()).toBe('2')
    enterCustom()
    expect(rows()).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /remove|xóa/i }), 'no remove button at the minimum').toBeNull()
  })

  it('G · add / remove inside by-item still work, and re-entering does not resurrect a removed row', () => {
    render(<SplitBillPage />)
    enterCustom()
    fireEvent.click(document.querySelector('[data-sb-add]') as HTMLElement) // 3 rows, stepper stays 2
    expect(rows()).toHaveLength(3)
    fireEvent.change(nameInput(3), { target: { value: 'Cường' } })
    fireEvent.click(screen.getAllByRole('button', { name: /remove|xóa/i })[1]) // drop row 2
    expect(names()).toEqual([enCopy['splitBill.personDefaultName'].replace('{n}', '1'), 'Cường'])
    // The in-mode stepper resizes the list as before, with a fresh (non-duplicate) id.
    fireEvent.click(inc())
    expect(rows()).toHaveLength(3)
    const ids = [...document.querySelectorAll('[data-sb-custom] li input:not([type="number"])')].map(i => i.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('H · calculations are untouched by the fit: equal split and by-item shares compute as before', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '900000' } })
    fireEvent.click(inc()) // 3
    fireEvent.click(tipButton('10%'))
    expect(perPerson()!.textContent).toBe(`${fmt(990000 / 3)} đ`)
    enterCustom()
    expect(rows()).toHaveLength(3)
    fireEvent.change(document.getElementById('sb-amount-1') as HTMLInputElement, { target: { value: '300000' } })
    fireEvent.change(document.getElementById('sb-amount-2') as HTMLInputElement, { target: { value: '300000' } })
    fireEvent.change(document.getElementById('sb-amount-3') as HTMLInputElement, { target: { value: '300000' } })
    const result = document.querySelector('[data-sb-custom-result]')!.textContent ?? ''
    expect(result.match(new RegExp(`${fmt(330000)} đ`, 'g'))).toHaveLength(3)
    expect(result).toContain(`${fmt(990000)} đ`)
  })
})
