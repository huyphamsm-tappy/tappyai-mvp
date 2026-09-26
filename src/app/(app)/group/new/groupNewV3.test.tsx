// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/group/new',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/Header', () => ({
  __esModule: true,
  // Phase 7: Back pops history and falls back to Smart Tools; `backHref="/"` (a fixed push
  // to Home) is gone, so the mock reports both props.
  default: ({ title, showBack, backHref, backFallbackHref }: { title?: string; showBack?: boolean; backHref?: string; backFallbackHref?: string }) => (
    <header data-testid="header" data-back={showBack ? 'yes' : 'no'} data-back-href={backHref ?? ''} data-back-fallback={backFallbackHref ?? ''}>{title}</header>
  ),
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))

import GroupNewForm from './GroupNewForm'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/w5/group'

// ── Create group — the V3 skin over the SAME form ───────────────────────────
//
// The reskin (2026-09-13) changed composition: a hero with the three Tappy poses
// (thinking, searching, food), three feature tiles, a name card with a live
// counter and static quick picks, a gradient CTA. It changed nothing about the
// form: one field, `maxLength` 80, submit disabled while empty, the `/api/group`
// request, the redirect to the new group, or the two error strings. Both halves
// are pinned here.

const SRC = readFileSync('src/app/(app)/group/new/GroupNewForm.tsx', 'utf8')
const API = readFileSync('src/app/api/group/route.ts', 'utf8')
const PAGE = readFileSync('src/app/(app)/group/new/page.tsx', 'utf8')

let fetchMock: ReturnType<typeof vi.fn>
// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
beforeEach(() => {
  push.mockReset()
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'g-42', name: 'Hội bạn thân' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const input = () => document.getElementById('group-name') as HTMLInputElement
const submit = () => q<HTMLButtonElement>('[data-group-submit]')!
const type = (v: string) => fireEvent.change(input(), { target: { value: v } })

describe('what the page claims is what the code does', () => {
  it('renders the V3 hero, a history-popping Back that falls back to Smart Tools, and no help control', () => {
    render(<GroupNewForm />)
    const header = q('[data-testid="header"]')!
    expect(header.textContent).toBe(enCopy['groupNew.title'])
    expect(header.getAttribute('data-back')).toBe('yes')
    // No fixed parent (Back returns to wherever the person came from); Smart Tools is the fallback.
    expect(header.getAttribute('data-back-href')).toBe('')
    expect(header.getAttribute('data-back-fallback')).toBe('/tools')
    const hero = q('[data-group-hero]')!
    expect(hero.textContent).toContain(enCopy['groupNew.heroEyebrow'])
    expect(hero.textContent).toContain(enCopy['groupNew.heroTitle1'])
    expect(hero.querySelector('.v3-group-hero-accent')!.textContent).toBe(enCopy['groupNew.heroTitle2'])
    expect(hero.textContent).toContain(enCopy['groupNew.heroBody'])
    expect(document.body.textContent).not.toMatch(/Trợ giúp|Help/)
  })

  it('shows all three official Tappy poses — thinking, searching, food — from the owner’s PNGs', () => {
    render(<GroupNewForm />)
    const imgs = Array.from(document.querySelectorAll('[data-group-scene] img')).map(i => i.getAttribute('src'))
    expect(imgs).toEqual(['/tappy/thinking.png', '/tappy/searching.png', '/tappy/food.png'])
    for (const pose of ['thinking', 'searching', 'food']) {
      expect(existsSync(`public/tappy/${pose}.png`)).toBe(true)
      expect(q(`[data-role="${pose}"]`)).toBeTruthy()
    }
    // The scene is decoration: hidden from assistive tech, and no other image on the page.
    expect(q('[data-group-scene]')!.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelectorAll('img')).toHaveLength(3)
    expect(q('[data-group-bubble]')!.textContent).toBe(enCopy['groupNew.bubble'])
  })

  it('the three feature tiles describe the real group flow and make no speed or accuracy promise', () => {
    render(<GroupNewForm />)
    const tiles = Array.from(q('[data-group-features]')!.querySelectorAll('li')).map(li => li.textContent)
    expect(tiles).toHaveLength(3)
    expect(tiles[0]).toContain(enCopy['groupNew.featPlan'])
    expect(tiles[1]).toContain(enCopy['groupNew.featShare'])
    expect(tiles[2]).toContain(enCopy['groupNew.featSuggest'])
    for (const key of ['groupNew.featPlan', 'groupNew.featPlanDesc', 'groupNew.featShare', 'groupNew.featShareDesc', 'groupNew.featSuggest', 'groupNew.featSuggestDesc']) {
      expect(viCopy[key]).not.toMatch(/siêu nhanh|chính xác|thông minh|tức thì/i)
      expect(enCopy[key]).not.toMatch(/instant|fast|accurate|smart/i)
    }
    // Each tile is backed by code: the join form's fields, the group page's copy-link, the suggest route.
    const GROUP_PAGE = readFileSync('src/app/(app)/group/[id]/page.tsx', 'utf8')
    expect(GROUP_PAGE).toContain('food_preferences')
    expect(GROUP_PAGE).toContain('async function copyLink')
    expect(existsSync('src/app/api/group/[id]/suggest/route.ts')).toBe(true)
  })

  it('the counter quotes the input’s real maxLength (80), not the mockup’s 50', () => {
    render(<GroupNewForm />)
    expect(input().getAttribute('maxlength')).toBe('80')
    expect(SRC).toContain('const NAME_MAX = 80')
    expect(q('[data-group-counter]')!.textContent).toBe('0/80')
    type('Team Marketing')
    expect(q('[data-group-counter]')!.textContent).toBe('14/80')
    expect(q('[data-group-counter]')!.getAttribute('data-full')).toBe('false')
    type('x'.repeat(80))
    expect(q('[data-group-counter]')!.getAttribute('data-full')).toBe('true')
    expect(document.body.textContent).not.toContain('/50')
  })

  it('the page still requires a signed-in user before it renders the form', () => {
    expect(PAGE).toContain("if (!user) redirect('/login')")
    expect(API).toContain('refuseAnonymousSocialWrite(req, user)')
  })
})

describe('quick picks are static shortcuts, not suggestions from anywhere', () => {
  it('fills the field, marks the chosen chip pressed, and enables the CTA', () => {
    render(<GroupNewForm />)
    const picks = Array.from(q('[data-group-presets]')!.querySelectorAll('button'))
    expect(picks.map(b => b.textContent)).toEqual([1, 2, 3, 4, 5].map(n => enCopy[`groupNew.preset${n}`]))
    expect(submit().disabled).toBe(true)
    fireEvent.click(picks[1])
    expect(input().value).toBe(enCopy['groupNew.preset2'])
    expect(picks[1].getAttribute('aria-pressed')).toBe('true')
    expect(picks[0].getAttribute('aria-pressed')).toBe('false')
    expect(submit().disabled).toBe(false)
    // Every pick is `type="button"` so none of them submits the form.
    for (const b of picks) expect(b.getAttribute('type')).toBe('button')
    expect(fetchMock).not.toHaveBeenCalled()
    // And they are labelled as quick picks, not as AI.
    expect(q('[data-group-presets]')!.textContent).toContain(enCopy['groupNew.quickLabel'])
    expect(viCopy['groupNew.quickLabel']).not.toMatch(/AI|Tappy/)
  })
})

describe('the request, its states and the redirect are the same', () => {
  it('CTA is disabled while the name is empty or whitespace', () => {
    render(<GroupNewForm />)
    expect(submit().disabled).toBe(true)
    type('   ')
    expect(submit().disabled).toBe(true)
    type('Gia đình')
    expect(submit().disabled).toBe(false)
  })

  it('submits the trimmed name to POST /api/group and pushes to the new group', async () => {
    render(<GroupNewForm />)
    type('  Hội bạn thân  ')
    await act(async () => { fireEvent.submit(submit().closest('form')!) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/group')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Hội bạn thân' })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/group/g-42'))
    expect(q('[data-group-error]')).toBeNull()
  })

  it('shows the submitting label and disables the CTA while the request is out', async () => {
    let release!: () => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve({ ok: true, json: async () => ({ id: 'g-1' }) })
    }))
    render(<GroupNewForm />)
    type('Team công ty')
    await act(async () => { fireEvent.submit(submit().closest('form')!) })
    await waitFor(() => expect(submit().disabled).toBe(true))
    expect(submit().textContent).toContain(enCopy['groupNew.submitting'])
    await act(async () => { release() })
    await waitFor(() => expect(push).toHaveBeenCalled())
  })

  it('a non-OK response shows the server message in the alert and does not navigate', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: 'anonymous', message: 'Hãy đăng nhập để đăng bài, bình luận và theo dõi.' }) }))
    render(<GroupNewForm />)
    type('Gia đình')
    await act(async () => { fireEvent.submit(submit().closest('form')!) })
    await waitFor(() => expect(q('[data-group-error]')).toBeTruthy())
    expect(q('[data-group-error]')!.getAttribute('role')).toBe('alert')
    expect(q('[data-group-error]')!.textContent).toContain('Hãy đăng nhập để đăng bài, bình luận và theo dõi.')
    expect(push).not.toHaveBeenCalled()
    expect(submit().disabled).toBe(false)
  })

  it('a non-OK response without a message falls back to the create error; a thrown fetch to the network error', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: 'create_failed' }) }))
    const { unmount } = render(<GroupNewForm />)
    type('Gia đình')
    await act(async () => { fireEvent.submit(submit().closest('form')!) })
    await waitFor(() => expect(q('[data-group-error]')!.textContent).toContain(enCopy['groupNew.error.create']))
    unmount()

    fetchMock.mockImplementationOnce(async () => { throw new Error('offline') })
    render(<GroupNewForm />)
    type('Gia đình')
    await act(async () => { fireEvent.submit(submit().closest('form')!) })
    await waitFor(() => expect(q('[data-group-error]')!.textContent).toContain(enCopy['groupNew.error.network']))
  })
})

describe('i18n', () => {
  it('vi and en carry the same groupNew keys, none empty, and the form reads every key it uses from them', () => {
    expect(Object.keys(enCopy).sort()).toEqual(Object.keys(viCopy).sort())
    for (const k of Object.keys(viCopy)) {
      expect(viCopy[k].trim(), k).not.toBe('')
      expect(enCopy[k].trim(), k).not.toBe('')
    }
    const used = Array.from(SRC.matchAll(/t\('(groupNew\.[a-zA-Z0-9.]+)'/g)).map(m => m[1])
    expect(used.length).toBeGreaterThan(12)
    for (const k of used) expect(viCopy, k).toHaveProperty(k)
    // The presets are read through the dictionary too, not typed into the component.
    for (let n = 1; n <= 5; n++) expect(viCopy).toHaveProperty(`groupNew.preset${n}`)
  })
})
