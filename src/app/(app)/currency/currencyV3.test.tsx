// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/currency',
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

import CurrencyPage from './page'
import { crossRate } from '@/lib/finance/exchange'
import { formatAmount, formatRate } from '@/lib/finance/format'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/w3/currency'

// ── Currency converter — the V3 skin over the SAME arithmetic ──────────────
//
// The reskin (2026-09-12) changed composition: a hero, an amount card with the
// four presets, native selects dressed as fields, a circular swap, a gradient
// result. Every number on screen still comes from `/api/rates` → `crossRate` →
// `formatAmount` / `formatRate`, and the hero says "hourly" because that is
// what the route does. Both halves are pinned here.

const SRC = readFileSync('src/app/(app)/currency/page.tsx', 'utf8')
const API = readFileSync('src/app/api/rates/route.ts', 'utf8')

/** A USD-based table like the route returns. Deliberately NOT the mockup's 25 887,1. */
const RATES = { USD: 1, VND: 24000, EUR: 0.5, JPY: 150, KRW: 1300, GBP: 0.8, AUD: 1.5, SGD: 1.3, THB: 35, CNY: 7, HKD: 7.8, TWD: 32 }
const PAYLOAD = { rates: RATES, date: 'Fri, 12 Sep 2026 00:02:31 +0000', fallback: false }

let fetchMock: ReturnType<typeof vi.fn>
// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const amount = () => document.getElementById('fx-amount') as HTMLInputElement
const converted = () => document.querySelector('[data-fx-converted]') as HTMLElement | null
const selects = () => document.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
const loaded = () => waitFor(() => expect(document.querySelector('[data-fx-loading]')).toBeNull())

describe('what the page claims is what the code does', () => {
  it('quotes the real currency count from CURRENCIES, which matches the route’s SUPPORTED list', () => {
    render(<CurrencyPage />)
    const count = (SRC.match(/\{ code: '/g) ?? []).length
    expect(count).toBe(12)
    expect(document.querySelector('[data-fx-chips]')!.textContent).toContain(`${count} `)
    for (const code of ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'GBP', 'AUD', 'SGD', 'THB', 'CNY', 'HKD', 'TWD']) expect(API).toContain(`'${code}'`)
    expect(selects()[0].options).toHaveLength(count)
  })

  it('says HOURLY, not real-time — the route revalidates every 3600s', () => {
    render(<CurrencyPage />)
    expect(API).toContain('revalidate = 3600')
    const text = document.querySelector('[data-fx-hero]')!.textContent ?? ''
    expect(text).toMatch(/hourly|hàng giờ/i)
    expect(text).not.toMatch(/real[- ]time|thời gian thực|live/i)
  })

  it('names the real provider from the existing key', async () => {
    render(<CurrencyPage />)
    await loaded()
    expect(API).toContain('open.er-api.com')
    expect(document.querySelector('[data-fx-note]')!.textContent).toContain('open.er-api.com')
  })
})

describe('the arithmetic is the finance library’s, not the mockup’s', () => {
  it('converts the default 1 000 000 VND → USD with crossRate and formatAmount, and shows both rate lines', async () => {
    render(<CurrencyPage />)
    expect(fetchMock).toHaveBeenCalledWith('/api/rates')
    await loaded()
    const rate = crossRate(RATES, 'VND', 'USD')
    expect(converted()!.textContent).toBe(formatAmount(1_000_000 * rate, 2))
    expect(converted()!.textContent).toBe(formatAmount(41.666666, 2))
    // 🚨 Not the reference's figures.
    expect(document.body.textContent).not.toContain('38,63')
    expect(document.body.textContent).not.toContain('25.887,1')
    const lines = document.querySelector('[data-fx-rates]')!.textContent ?? ''
    expect(lines).toContain(`1 VND = ${formatRate(rate)} USD`)
    expect(lines).toContain(`1 USD = ${formatRate(1 / rate)} VND`)
    expect(document.querySelector('[data-fx-status]')!.textContent).toMatch(/hourly|hàng giờ/i)
  })

  it('recomputes when the amount changes and when a preset is pressed (the four existing values)', async () => {
    render(<CurrencyPage />)
    await loaded()
    fireEvent.change(amount(), { target: { value: '240000' } })
    expect(converted()!.textContent).toBe(formatAmount(10, 2))
    const presets = within(document.querySelector('[data-fx-amount]') as HTMLElement).getAllByRole('button')
    expect(presets.map(b => b.textContent?.replace(/\D/g, ''))).toEqual(['100000', '500000', '1000000', '5000000'])
    fireEvent.click(presets[3])
    expect(amount().value).toBe('5000000')
    expect(presets[3].getAttribute('aria-pressed')).toBe('true')
    expect(converted()!.textContent).toBe(formatAmount(5_000_000 / 24000, 2))
  })

  it('swap exchanges the pair and the result follows — with the target currency’s decimals', async () => {
    render(<CurrencyPage />)
    await loaded()
    fireEvent.click(document.querySelector('[data-fx-swap]') as HTMLElement)
    expect(selects()[0].value).toBe('USD')
    expect(selects()[1].value).toBe('VND')
    expect(converted()!.textContent).toBe(formatAmount(1_000_000 * 24000, 0))
    expect(document.querySelector('[data-fx-to]')!.textContent).toContain('VND')
  })

  it('changing a select changes the pair; the amount field’s code follows the source currency', async () => {
    render(<CurrencyPage />)
    await loaded()
    fireEvent.change(selects()[1], { target: { value: 'JPY' } })
    expect(converted()!.textContent).toBe(formatAmount(1_000_000 * (150 / 24000), 0))
    fireEvent.change(selects()[0], { target: { value: 'EUR' } })
    expect(document.querySelector('[data-fx-amount]')!.textContent).toContain('EUR')
  })

  it('an empty amount shows the prompt, never a zero conversion', async () => {
    render(<CurrencyPage />)
    await loaded()
    fireEvent.change(amount(), { target: { value: '' } })
    expect(converted()).toBeNull()
    expect(document.querySelector('[data-fx-empty]')).toBeTruthy()
  })
})

describe('states', () => {
  it('shows a shimmer while rates load and no number', async () => {
    let resolve!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r })))
    render(<CurrencyPage />)
    expect(document.querySelector('[data-fx-loading]')).toBeTruthy()
    expect(converted()).toBeNull()
    expect(document.body.textContent).not.toMatch(/\d+%/)
    resolve({ ok: true, json: async () => PAYLOAD })
    await loaded()
  })

  it('a missing currency is an alert from the finance library, not a silent 1:1', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...PAYLOAD, rates: { USD: 1, VND: 24000 } }) })))
    render(<CurrencyPage />)
    await loaded()
    fireEvent.change(selects()[1], { target: { value: 'EUR' } })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('EUR')
    expect(converted()).toBeNull()
  })

  it('the fallback table is labelled as estimated, in the status pill and the note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ rates: RATES, date: null, fallback: true }) })))
    render(<CurrencyPage />)
    await loaded()
    expect(document.querySelector('[data-fx-status]')!.getAttribute('data-fallback')).toBe('true')
    expect(document.querySelector('[data-fx-status]')!.textContent).toMatch(/estimated|ước tính/i)
    expect(screen.getByRole('status').textContent).toMatch(/estimated|ước tính/i)
    expect(document.querySelector('[data-fx-note]')!.textContent).not.toMatch(/updated|cập nhật/i)
  })

  it('a network failure falls back the same way the page always did', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<CurrencyPage />)
    await loaded()
    expect(screen.getByRole('status').textContent).toMatch(/estimated|ước tính/i)
  })

  it('shows the real update date from the payload, and always the disclaimer', async () => {
    render(<CurrencyPage />)
    await loaded()
    const note = document.querySelector('[data-fx-note]')!.textContent ?? ''
    expect(note).toMatch(/12\/09\/2026/)
    expect(note).toContain(enCopy['currency.disclaimer'])
  })
})

describe('surface', () => {
  it('has one h1, labelled amount and selects, an aria-labelled swap, and an aria-hidden scene with the existing pose', () => {
    render(<CurrencyPage />)
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    // The amount card (a labelled region) and the input share the label text; the INPUT is the control.
    expect(screen.getAllByLabelText(enCopy['currency.amountLabel']).find(el => el.tagName === 'INPUT')).toBe(amount())
    expect(screen.getByLabelText(enCopy['currency.fromLabel']).tagName).toBe('SELECT')
    expect(screen.getByLabelText(enCopy['currency.toLabel']).tagName).toBe('SELECT')
    expect(screen.getByRole('button', { name: enCopy['currency.swapDirection'] })).toBeTruthy()
    const scene = document.querySelector('[data-fx-scene]') as HTMLElement
    expect(scene.getAttribute('aria-hidden')).toBe('true')
    expect(within(scene).getByTestId('tappy').getAttribute('data-pose')).toBe('wave')
    expect(document.querySelector('[data-fx-hero]')!.querySelector('img, video, picture')).toBeNull()
  })

  it('draws no chart, no history, no alerts, no favourites — and no "reliable" claim', () => {
    render(<CurrencyPage />)
    expect(document.querySelector('svg[class*="chart"], canvas, [data-fx-chart]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/đáng tin cậy|reliable|lịch sử|history|favou?rite|cảnh báo/i)
  })

  it('talks only to /api/rates and holds no hardcoded Vietnamese UI text', () => {
    expect([...SRC.matchAll(/fetch\('([^']+)'/g)].map(m => m[1])).toEqual(['/api/rates'])
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l))).toEqual([])
  })

  it('every currency.* key the page renders exists in both dictionaries', () => {
    const keys = [...SRC.matchAll(/'(currency\.[a-zA-Z0-9]+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(12)
    for (const key of keys) {
      expect(viCopy[key], `${key} missing from vi`).toBeTruthy()
      expect(enCopy[key], `${key} missing from en`).toBeTruthy()
    }
  })
})
