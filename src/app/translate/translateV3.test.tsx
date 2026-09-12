// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/translate',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/Header', () => ({
  __esModule: true,
  default: ({ title }: { title?: string }) => <header data-testid="header">{title}</header>,
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))
vi.mock('@/components/v3/TappyPresence', () => ({
  __esModule: true,
  default: ({ pose }: { pose?: string }) => <span data-testid="tappy" data-pose={pose} />,
}))

import TranslatePage from './page'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/w3/translate'

// ── Translate — the V3 skin over the SAME request ──────────────────────────
//
// The reskin (2026-09-12) changed composition: a hero with Tappy, a source card
// with the live counter, a listbox selector, a gradient CTA, a shimmer while the
// request is out, a result card with the two existing actions. It changed
// nothing about the request, the 2000-character limit, the 30 targets, the
// 30/day cap line, dictation or read-aloud. Both halves are pinned here.

const SRC = readFileSync('src/app/translate/page.tsx', 'utf8')
const API = readFileSync('src/app/api/translate/route.ts', 'utf8')

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ translation: 'Hello world' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const textarea = () => document.getElementById('tr-source') as HTMLTextAreaElement
const submit = () => document.querySelector('[data-tr-submit]') as HTMLButtonElement

describe('what the page claims is what the code does', () => {
  it('the hero and the tiles quote the real language count, taken from LANGUAGES', () => {
    render(<TranslatePage />)
    const count = (SRC.match(/\{ code: '/g) ?? []).length
    expect(count).toBe(30)
    expect(document.querySelector('[data-tr-hero]')!.textContent).toContain(`${count} `)
    expect(document.querySelector('[data-tr-features]')!.textContent).toContain(`${count} `)
    // And the API knows the same targets.
    for (const code of ['vi', 'en', 'ja', 'ko', 'zh-CN', 'uk', 'no']) expect(API).toMatch(new RegExp(`['"]?${code}['"]?:`))
  })

  it('the character limit is one constant shared by textarea, counter and the route', () => {
    render(<TranslatePage />)
    expect(textarea().getAttribute('maxlength')).toBe('2000')
    expect(document.querySelector('[data-tr-counter]')!.textContent).toBe('0/2000')
    expect(API).toContain('text.length > 2000')
    fireEvent.change(textarea(), { target: { value: 'abc' } })
    expect(document.querySelector('[data-tr-counter]')!.textContent).toBe('3/2000')
  })

  it('the free-limit line states the route’s DAILY_LIMIT and needs no account', () => {
    render(<TranslatePage />)
    expect(API).toContain('const DAILY_LIMIT = 30')
    expect(document.querySelector('[data-tr-tip]')!.textContent).toMatch(/30/)
    expect(API).not.toContain('getRequestUser')
  })

  it('says the source language is detected, and offers no source selector', () => {
    render(<TranslatePage />)
    expect(document.querySelector('[data-tr-source-auto]')).toBeTruthy()
    expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(0)
    expect(document.querySelectorAll('[aria-haspopup="listbox"]')).toHaveLength(1)
  })
})

describe('hero', () => {
  it('has one h1 from the dictionary, Tappy in the welcome pose, and an aria-hidden scene without images', () => {
    render(<TranslatePage />)
    const hero = document.querySelector('[data-tr-hero]') as HTMLElement
    const h1s = document.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toContain(enCopy['translate.heroTitle1'])
    expect(within(hero).getByTestId('tappy').getAttribute('data-pose')).toBe('welcome')
    const scene = hero.querySelector('[data-tr-scene]') as HTMLElement
    expect(scene.getAttribute('aria-hidden')).toBe('true')
    expect(hero.querySelector('img, video, picture')).toBeNull()
    // Greeting bubbles are samples in fixed languages, not the user's text.
    expect(scene.textContent).toContain('Hello')
    expect(scene.querySelector('[lang="ja"]')).toBeTruthy()
  })
})

describe('the request is the one it always was', () => {
  it('POSTs {text, targetLang} to /api/translate and renders the result with read-aloud and copy', async () => {
    render(<TranslatePage />)
    expect(submit().disabled).toBe(true)
    fireEvent.change(textarea(), { target: { value: '  Xin chào thế giới ' } })
    expect(submit().disabled).toBe(false)
    fireEvent.click(submit())
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/translate')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ text: 'Xin chào thế giới', targetLang: 'vi' })
    const result = await waitFor(() => document.querySelector('[data-tr-result]') as HTMLElement)
    expect(result.textContent).toContain('Hello world')
    expect(within(result).getByRole('button', { name: /read aloud|đọc to/i })).toBeTruthy()
    expect(within(result).getByRole('button', { name: /^copy$|sao chép/i })).toBeTruthy()
    expect(result.querySelectorAll('button')).toHaveLength(2) // no invented share / swap / save
  })

  it('shows a shimmer while the request is out — no percentage — and disables the CTA', async () => {
    let resolve!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r })))
    render(<TranslatePage />)
    fireEvent.change(textarea(), { target: { value: 'hi' } })
    fireEvent.click(submit())
    await waitFor(() => expect(document.querySelector('[data-tr-loading]')).toBeTruthy())
    expect(submit().disabled).toBe(true)
    expect(submit().textContent).toMatch(/translating|đang dịch/i)
    expect(document.body.textContent).not.toMatch(/\d+%/)
    resolve({ ok: true, json: async () => ({ translation: 'ok' }) })
    await waitFor(() => expect(document.querySelector('[data-tr-loading]')).toBeNull())
  })

  it('surfaces the server’s own message on a failed request, as an alert, and renders no result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'rate_limit', message: 'Daily limit reached' }) })))
    render(<TranslatePage />)
    fireEvent.change(textarea(), { target: { value: 'hi' } })
    fireEvent.click(submit())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Daily limit reached')
    expect(document.querySelector('[data-tr-result]')).toBeNull()
  })

  it('falls back to the network message when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<TranslatePage />)
    fireEvent.change(textarea(), { target: { value: 'hi' } })
    fireEvent.click(submit())
    expect((await screen.findByRole('alert')).textContent).toContain(enCopy['translate.errorNetwork'])
  })
})

describe('the target language selector', () => {
  it('opens a listbox of the 30 targets, marks the current one, and changes the request payload', async () => {
    render(<TranslatePage />)
    fireEvent.click(document.querySelector('[aria-haspopup="listbox"]') as HTMLElement)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(30)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: '日本語' }))
    expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(0)
    expect((document.querySelector('[aria-haspopup="listbox"]') as HTMLElement).textContent).toContain('日本語')
    fireEvent.change(textarea(), { target: { value: 'hi' } })
    fireEvent.click(submit())
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).targetLang).toBe('ja')
  })
})

describe('dictation and clear are the existing controls', () => {
  it('keeps the microphone button with the shared voice copy and reports an unsupported browser through the dictionary', () => {
    render(<TranslatePage />)
    const mic = document.querySelector('[data-tr-voice]') as HTMLButtonElement
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(mic) // jsdom has no SpeechRecognition
    expect(screen.getByRole('status').textContent?.length).toBeGreaterThan(0)
  })

  it('offers no paste button — the page has no clipboard-read code', () => {
    render(<TranslatePage />)
    expect(document.body.textContent).not.toMatch(/dán văn bản|paste text/i)
    expect(SRC).not.toContain('clipboard.readText')
  })

  it('clear empties the text, the result and the error', async () => {
    render(<TranslatePage />)
    fireEvent.change(textarea(), { target: { value: 'hi' } })
    fireEvent.click(submit())
    await waitFor(() => expect(document.querySelector('[data-tr-result]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^clear$|xóa/i }))
    expect(textarea().value).toBe('')
    expect(document.querySelector('[data-tr-result]')).toBeNull()
  })
})

describe('boundaries the skin did not cross', () => {
  it('talks only to /api/translate', () => {
    expect([...SRC.matchAll(/fetch\('([^']+)'/g)].map(m => m[1])).toEqual(['/api/translate'])
  })

  it('keeps the legacy chrome and the three feature tiles, and holds no hardcoded Vietnamese UI text', () => {
    render(<TranslatePage />)
    expect(screen.getByTestId('header').textContent).toBe(enCopy['translate.headerTitle'])
    expect(screen.getByTestId('bottom-nav')).toBeTruthy()
    expect(document.querySelectorAll('[data-tr-features] li')).toHaveLength(3)
    expect(document.querySelector('[data-tr-features]')!.textContent).not.toMatch(/accurate|chính xác/i)
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/name: '[^']*'/g, '')
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l))).toEqual([])
  })

  it('every translate.* key the page renders exists in both dictionaries', () => {
    const keys = [...SRC.matchAll(/'(translate\.[a-zA-Z0-9]+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(12)
    for (const key of keys) {
      expect(viCopy[key], `${key} missing from vi`).toBeTruthy()
      expect(enCopy[key], `${key} missing from en`).toBeTruthy()
    }
  })
})
