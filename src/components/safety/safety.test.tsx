// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string, v?: Record<string, string>) => (v?.name ? `${k}|${v.name}` : k), locale: 'vi', setLocale: vi.fn() }),
}))

import { SafetyMenu } from './SafetyMenu'
import { ReportDialog } from './ReportDialog'
import { REPORT_REASONS, REPORT_NOTE_MAX, sendReport, setBlocked, myBlocks, rememberBlock, __resetSafetyClient } from '@/lib/safety/safetyClient'
import { useSafetyFlags, __resetSafetyFlags } from '@/lib/safety/useSafetyFlags'
import { isUserReportReason, canonicalReportReason } from '@/lib/reviews/reportReasons'
import { vi as safetyVi, en as safetyEn } from '@/lib/i18n/safety'

// WEB-ONLY Phase 8 / WP-06 — the Safety UI against the per-target routes that exist in this line. The network is faked and every call is recorded,
// so "which route, which body, which verb" is measured. Nothing here calls /api/reports: that endpoint does not exist.

type Reply = { status: number; body?: unknown } | 'network'
const calls: { method: string; url: string; body?: any }[] = []
let routes: Record<string, Reply | ((method: string) => Reply)>
let config: Reply
const stub = () => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: any, opts?: any) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    calls.push({ method, url: u, body: opts?.body ? JSON.parse(opts.body) : undefined })
    const pick = u === '/api/config' ? config : (() => { const r = routes[u]; return typeof r === 'function' ? r(method) : r })()
    if (!pick) return { ok: true, status: 200, json: async () => ({}) } as Response
    if (pick === 'network') throw new TypeError('network down')
    return { ok: pick.status < 400, status: pick.status, json: async () => pick.body ?? {} } as Response
  }))
}
const ON = { status: 200, body: { p8: { reports: true, userBlocks: true } } } as const
const OFF = { status: 200, body: { p8: { reports: false, userBlocks: false } } } as const

beforeEach(() => { __resetSafetyClient(); __resetSafetyFlags(); routes = {}; config = ON; stub() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const posts = () => calls.filter(c => c.method !== 'GET')

describe('safetyClient · routes, bodies, outcomes', () => {
  it('reports go to the PER-TARGET routes (never /api/reports) with { reason } and an optional trimmed note', async () => {
    expect(await sendReport('review', 'r1', 'spam')).toBe('ok')
    expect(await sendReport('comment', 'c1', 'harassment', '  nội dung  ')).toBe('ok')
    expect(await sendReport('user', 'u1', 'scam', '   ')).toBe('ok')
    expect(calls.map(c => [c.method, c.url])).toEqual([
      ['POST', '/api/reviews/r1/report'], ['POST', '/api/comments/c1/report'], ['POST', '/api/users/u1/report'],
    ])
    expect(calls[0].body).toEqual({ reason: 'spam' })
    expect(calls[1].body).toEqual({ reason: 'harassment', note: 'nội dung' })
    expect(calls[2].body).toEqual({ reason: 'scam' }) // a blank note is not sent
    expect(calls.some(c => c.url === '/api/reports')).toBe(false)
  })

  it('a MESSAGE is reported to its own per-target route, under the Messenger path, with the same body', async () => {
    expect(await sendReport('message', 'm1', 'harassment', 'đe dọa')).toBe('ok')
    expect(calls.map(c => [c.method, c.url])).toEqual([['POST', '/api/messaging/messages/m1/report']])
    expect(calls[0].body).toEqual({ reason: 'harassment', note: 'đe dọa' })
  })

  it('ids are URL-encoded, and a note is capped at the length the routes accept', async () => {
    await sendReport('user', 'a/b?c', 'other', 'x'.repeat(REPORT_NOTE_MAX + 50))
    expect(calls[0].url).toBe('/api/users/a%2Fb%3Fc/report')
    expect(calls[0].body.note.length).toBe(REPORT_NOTE_MAX)
  })

  it('outcomes: 200 ok · already reported · 401/403 login · 429 rate limited · 5xx and network failed', async () => {
    routes['/api/reviews/r1/report'] = { status: 200, body: { ok: true, reported: true, alreadyReported: true } }
    expect(await sendReport('review', 'r1', 'spam')).toBe('already')
    for (const [status, want] of [[401, 'login'], [403, 'login'], [429, 'rate_limited'], [500, 'failed'], [404, 'failed']] as const) {
      routes['/api/reviews/r1/report'] = { status }
      expect(await sendReport('review', 'r1', 'spam'), String(status)).toBe(want)
    }
    routes['/api/reviews/r1/report'] = 'network'
    expect(await sendReport('review', 'r1', 'spam')).toBe('failed')
  })

  it('every reason the menu offers is accepted by the comment/user routes AND by the post route (which maps a native one)', () => {
    for (const r of REPORT_REASONS) {
      expect(isUserReportReason(r), `user/comment route: ${r}`).toBe(true)
      expect(canonicalReportReason(r), `post route: ${r}`).not.toBeNull()
    }
  })

  it('block verbs: POST blocks, DELETE unblocks; 401/403 → login; failure → failed', async () => {
    expect(await setBlocked('u1', true)).toBe('ok')
    expect(await setBlocked('u1', false)).toBe('ok')
    expect(calls.map(c => [c.method, c.url])).toEqual([['POST', '/api/users/u1/block'], ['DELETE', '/api/users/u1/block']])
    routes['/api/users/u1/block'] = { status: 403 }
    expect(await setBlocked('u1', true)).toBe('login')
    routes['/api/users/u1/block'] = { status: 500 }
    expect(await setBlocked('u1', true)).toBe('failed')
  })

  it('the block list is fetched once, parsed from { blocks: [{ blocked_id }] }, kept current locally, and a failure is an empty list', async () => {
    routes['/api/users/blocks'] = { status: 200, body: { blocks: [{ blocked_id: 'u1' }, { blocked_id: 'u2' }] } }
    expect([...(await myBlocks())].sort()).toEqual(['u1', 'u2'])
    await myBlocks()
    expect(calls.filter(c => c.url === '/api/users/blocks').length).toBe(1)
    await rememberBlock('u3', true); await rememberBlock('u1', false)
    expect([...(await myBlocks())].sort()).toEqual(['u2', 'u3'])
    __resetSafetyClient()
    routes['/api/users/blocks'] = { status: 404 } // flag off on the server
    expect((await myBlocks()).size).toBe(0)
  })
})

describe('useSafetyFlags', () => {
  it('everything is OFF until /api/config answers, then reads p8.reports / p8.userBlocks (exactly true)', async () => {
    config = { status: 200, body: { p8: { reports: true, userBlocks: 'yes' } } }
    const { result } = renderHook(() => useSafetyFlags())
    expect(result.current).toEqual({ reports: false, userBlocks: false })
    await waitFor(() => expect(result.current.reports).toBe(true))
    expect(result.current.userBlocks).toBe(false) // a truthy non-boolean is not "on"
  })
  it('a missing p8 block, a failed request and a network error all mean OFF — and the config is fetched once for many components', async () => {
    for (const bad of [{ status: 200, body: {} }, { status: 500 }, 'network'] as Reply[]) {
      __resetSafetyFlags(); config = bad; stub()
      const { result, unmount } = renderHook(() => useSafetyFlags())
      renderHook(() => useSafetyFlags())
      await new Promise(r => setTimeout(r, 10))
      expect(result.current).toEqual({ reports: false, userBlocks: false })
      expect(calls.filter(c => c.url === '/api/config').length).toBe(1)
      unmount()
    }
  })
})

describe('SafetyMenu · what is drawn', () => {
  it('flags OFF: a comment/user report and a block draw NOTHING; a post report is always offered (its route is not flagged)', async () => {
    config = OFF
    const a = render(<SafetyMenu report={{ target: 'comment', id: 'c1' }} user={{ id: 'u1' }} />)
    await new Promise(r => setTimeout(r, 10))
    expect(a.container.innerHTML).toBe('')
    cleanup()
    render(<SafetyMenu report={{ target: 'review', id: 'r1' }} user={{ id: 'u1' }} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    expect(screen.getByRole('menuitem', { name: 'safety.report' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'safety.block' })).toBeNull() // block flag is off
  })

  it('flags ON: Report and Block are both offered; a menu without a user offers only Report, one without a report only Block', async () => {
    render(<SafetyMenu report={{ target: 'comment', id: 'c1' }} user={{ id: 'u1', name: 'Lan' }} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    expect(screen.getAllByRole('menuitem').map(e => e.textContent)).toEqual(['safety.report', 'safety.block'])
    cleanup()
    render(<SafetyMenu report={{ target: 'comment', id: 'c1' }} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    expect(screen.getAllByRole('menuitem').map(e => e.textContent)).toEqual(['safety.report'])
    cleanup()
    render(<SafetyMenu user={{ id: 'u1' }} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    expect(screen.getAllByRole('menuitem').map(e => e.textContent)).toEqual(['safety.block'])
  })
})

describe('SafetyMenu · keyboard', () => {
  it('Escape closes the open menu and returns the focus to its button', async () => {
    render(<SafetyMenu report={{ target: 'review', id: 'r1' }} />)
    const button = await screen.findByLabelText('safety.more')
    fireEvent.click(button)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
  it('other keys and a click inside the menu area do not close it', async () => {
    render(<SafetyMenu report={{ target: 'review', id: 'r1' }} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeTruthy()
  })
})

describe('SafetyMenu · report flow', () => {
  const open = async () => {
    render(<SafetyMenu report={{ target: 'comment', id: 'c1' }} user={{ id: 'u1', name: 'Lan' }} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'safety.report' }))
    return await screen.findByTestId('report-dialog')
  }

  it('Submit is disabled until a reason is chosen; the request carries the reason and the note; success is confirmed inline', async () => {
    const dialog = await open()
    const submit = within(dialog).getByTestId('report-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(within(dialog).getByLabelText('safety.reason.scam'))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'link lạ' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => expect(within(screen.getByTestId('report-dialog')).getByRole('status').textContent).toBe('safety.reportSent'))
    expect(posts()).toEqual([{ method: 'POST', url: '/api/comments/c1/report', body: { reason: 'scam', note: 'link lạ' } }])
    fireEvent.click(screen.getByTestId('report-done'))
    await waitFor(() => expect(screen.queryByTestId('report-dialog')).toBeNull())
  })

  it('a failed report stays open with an inline error and can be retried; rate limiting has its own sentence', async () => {
    routes['/api/comments/c1/report'] = { status: 500 }
    const dialog = await open()
    fireEvent.click(within(dialog).getByLabelText('safety.reason.spam'))
    fireEvent.click(within(dialog).getByTestId('report-submit'))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('safety.failed')
    routes['/api/comments/c1/report'] = { status: 429 }
    fireEvent.click(within(dialog).getByTestId('report-submit'))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe('safety.rateLimited'))
    routes['/api/comments/c1/report'] = { status: 200, body: { ok: true } }
    fireEvent.click(within(dialog).getByTestId('report-submit'))
    await waitFor(() => expect(within(dialog).getByRole('status')).toBeTruthy())
  })

  it('a double click sends ONE report', async () => {
    const dialog = await open()
    fireEvent.click(within(dialog).getByLabelText('safety.reason.spam'))
    const submit = within(dialog).getByTestId('report-submit')
    fireEvent.click(submit); fireEvent.click(submit)
    await within(dialog).findByRole('status')
    expect(posts().length).toBe(1)
  })

  it('401/403 sends the reporter to login with the current page as the return path', async () => {
    const href = vi.fn()
    Object.defineProperty(window, 'location', { value: { pathname: '/reviews/abc', search: '', get href() { return '' }, set href(v: string) { href(v) } }, writable: true, configurable: true })
    routes['/api/comments/c1/report'] = { status: 403 }
    const dialog = await open()
    fireEvent.click(within(dialog).getByLabelText('safety.reason.spam'))
    fireEvent.click(within(dialog).getByTestId('report-submit'))
    await waitFor(() => expect(href).toHaveBeenCalledWith('/login?returnTo=' + encodeURIComponent('/reviews/abc')))
  })

  it('cancel closes without a request and the next open starts clean; the note box exists for comments/users but not for a post report', async () => {
    const dialog = await open()
    fireEvent.click(within(dialog).getByLabelText('safety.reason.hate'))
    fireEvent.click(within(dialog).getByText('safety.cancel'))
    await waitFor(() => expect(screen.queryByTestId('report-dialog')).toBeNull())
    expect(posts()).toEqual([])
    fireEvent.click(screen.getByLabelText('safety.more'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'safety.report' }))
    expect((within(await screen.findByTestId('report-dialog')).getByLabelText('safety.reason.hate') as HTMLInputElement).checked).toBe(false)
    cleanup()
    render(<ReportDialog open onOpenChange={() => {}} target="review" targetId="r1" />)
    expect(within(await screen.findByTestId('report-dialog')).queryByRole('textbox')).toBeNull()
  })
})

describe('SafetyMenu · block flow', () => {
  const openBlock = async (extra?: { onBlockedChange?: (b: boolean) => void }) => {
    render(<SafetyMenu user={{ id: 'u1', name: 'Lan' }} {...extra} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    fireEvent.click(screen.getByRole('menuitem'))
    return await screen.findByTestId('block-confirm')
  }

  it('block needs a confirmation (named), then POSTs, tells the user inline and reports the change', async () => {
    const changed = vi.fn()
    const dialog = await openBlock({ onBlockedChange: changed })
    expect(within(dialog).getByText('safety.blockConfirmTitle|Lan')).toBeTruthy()
    expect(posts()).toEqual([]) // nothing happens before the confirmation
    fireEvent.click(within(dialog).getByTestId('block-confirm-button'))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(true))
    expect(posts()).toEqual([{ method: 'POST', url: '/api/users/u1/block', body: undefined }])
    expect((await screen.findByRole('status')).textContent).toBe('safety.blocked')
    expect(screen.queryByTestId('block-confirm')).toBeNull()
  })

  it('a user already on the block list is offered Unblock, which DELETEs', async () => {
    routes['/api/users/blocks'] = { status: 200, body: { blocks: [{ blocked_id: 'u1' }] } }
    const changed = vi.fn()
    render(<SafetyMenu user={{ id: 'u1', name: 'Lan' }} onBlockedChange={changed} />)
    fireEvent.click(await screen.findByLabelText('safety.more'))
    await waitFor(() => expect(screen.getByRole('menuitem').textContent).toBe('safety.unblock'))
    fireEvent.click(screen.getByRole('menuitem'))
    fireEvent.click(await screen.findByTestId('block-confirm-button'))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(false))
    expect(posts()).toEqual([{ method: 'DELETE', url: '/api/users/u1/block', body: undefined }])
  })

  it('a failed block keeps the dialog open with an inline error and does NOT report a change', async () => {
    routes['/api/users/u1/block'] = { status: 500 }
    const changed = vi.fn()
    const dialog = await openBlock({ onBlockedChange: changed })
    fireEvent.click(within(dialog).getByTestId('block-confirm-button'))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('safety.failed')
    expect(changed).not.toHaveBeenCalled()
  })

  it('cancel makes no request and no change', async () => {
    const changed = vi.fn()
    const dialog = await openBlock({ onBlockedChange: changed })
    fireEvent.click(within(dialog).getByText('safety.cancel'))
    await waitFor(() => expect(screen.queryByTestId('block-confirm')).toBeNull())
    expect(posts()).toEqual([])
    expect(changed).not.toHaveBeenCalled()
  })
})

describe('ReportDialog · reporting a message', () => {
  const dialogFor = (target: 'message' | 'comment') => {
    render(<ReportDialog open onOpenChange={() => {}} target={target} targetId="m1" />)
    return screen.getByTestId('report-dialog')
  }

  it('says, BEFORE anything is sent, that the message goes to the moderators (a private conversation is being shared with them)', () => {
    const dialog = dialogFor('message')
    expect(within(dialog).getByTestId('report-message-notice').textContent).toBe('safety.reportMessageNotice')
  })

  it('the other targets do not carry that notice', () => {
    expect(within(dialogFor('comment')).queryByTestId('report-message-notice')).toBeNull()
  })

  it('sending reports the message to its own route, with the reason and the note, and the title is the message title', async () => {
    const dialog = dialogFor('message')
    expect(dialog.textContent).toContain('safety.reportTitle.message')
    fireEvent.click(within(dialog).getByLabelText('safety.reason.harassment'))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'đe dọa tôi' } })
    fireEvent.click(within(dialog).getByTestId('report-submit'))
    await waitFor(() => expect(within(screen.getByTestId('report-dialog')).getByRole('status').textContent).toBe('safety.reportSent'))
    expect(posts()).toEqual([{ method: 'POST', url: '/api/messaging/messages/m1/report', body: { reason: 'harassment', note: 'đe dọa tôi' } }])
  })
})

describe('copy', () => {
  it('every literal safety.* key the three components use exists in BOTH languages (a missing key would show the raw key to the user)', async () => {
    const { readFileSync } = await import('node:fs')
    const files = ['SafetyMenu.tsx', 'ReportDialog.tsx', 'SafetyModal.tsx'].map(n => readFileSync(`src/components/safety/${n}`, 'utf8'))
    const keys = new Set(files.flatMap(src => [...src.matchAll(/'(safety.[A-Za-z]+(?:.[A-Za-z_]+)?)'/g)].map(m => m[1])))
    expect(keys.size).toBeGreaterThan(15)
    for (const k of keys) { expect(safetyVi[k], `vi ${k}`).toBeTruthy(); expect(safetyEn[k], `en ${k}`).toBeTruthy() }
  })

  it('vi and en carry exactly the same keys, every reason and title the UI asks for exists, and {name} survives translation', () => {
    expect(Object.keys(safetyVi).sort()).toEqual(Object.keys(safetyEn).sort())
    for (const r of REPORT_REASONS) expect(safetyVi[`safety.reason.${r}`], r).toBeTruthy()
    for (const k of ['reportTitle.review', 'reportTitle.comment', 'reportTitle.user', 'reportTitle.message', 'reportMessageNotice', 'blockConfirmTitle', 'unblockConfirmTitle']) expect(safetyVi[`safety.${k}`], k).toBeTruthy()
    for (const k of ['reportTitle.message', 'reportMessageNotice']) expect(safetyEn[`safety.${k}`], k).toBeTruthy()
    expect(safetyVi['safety.blockConfirmTitle']).toContain('{name}')
    expect(safetyEn['safety.blockConfirmTitle']).toContain('{name}')
    for (const k of ['close', 'rateLimited', 'failed', 'reportSent', 'cancel']) expect(safetyEn[`safety.${k}`], k).toBeTruthy()
  })
})
