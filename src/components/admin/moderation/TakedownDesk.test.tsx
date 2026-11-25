// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setLocale } from '@/lib/i18n/useTranslation'
import { TakedownDesk } from './TakedownDesk'

// The takedown register's screen, rendered. Network is a stubbed fetch; nothing here touches a server.
const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const REVIEW = '22222222-2222-4222-8222-222222222222'
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, received_at: '2026-11-25T08:00:00.000Z', source: 'authority', agency: 'Cơ quan A', reference_no: 'CV-123', legal_basis: null, urgency: 'standard_24h', due_at: '2026-11-26T08:00:00.000Z',
  target_type: 'review', target_id: REVIEW, status: 'received', action_taken: null, actioned_at: null, notes: null, clock: 'ok', minutes_left: 600, ...over,
})
type Reply = { status?: number; body?: unknown }
function stub(routes: Record<string, Reply>) {
  const calls: Array<{ url: string; method: string; body?: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body as string | undefined })
    const rep = routes[`${method} ${url}`]
    if (!rep) throw new Error(`no stub for ${method} ${url}`)
    const status = rep.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => rep.body } as Response
  }))
  return calls
}
const OPEN = 'GET /api/admin/takedowns?view=open'
const ALL = { hide: true, ban: true }

beforeEach(() => setLocale('en'))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.removeItem('tappy_lang') })

describe('the takedown desk', () => {
  it('shows each request with its clock, how long is left, the agency and the content', async () => {
    stub({ [OPEN]: { body: { data: [row({ clock: 'at_risk', minutes_left: 125 }), row({ id: 'b', clock: 'overdue', minutes_left: -61, target_type: 'comment' })] } } })
    render(<TakedownDesk can={ALL} />)
    expect(await screen.findByText('At risk', { selector: 'span,div' })).toBeTruthy()
    expect(screen.getByText('OVERDUE')).toBeTruthy()
    expect(screen.getByText('2 h 5 min left')).toBeTruthy()
    expect(screen.getByText('1 h 1 min late')).toBeTruthy()
    expect(screen.getAllByText('Cơ quan A').length).toBe(2)
    expect(screen.getAllByText(REVIEW).length).toBe(2)
  })
  it('says so when the register cannot be read, instead of showing an empty list', async () => {
    stub({ [OPEN]: { status: 500, body: { error: { code: 'INTERNAL_ERROR' } } } })
    render(<TakedownDesk can={ALL} />)
    expect(await screen.findByText(/Could not read the register/)).toBeTruthy()
  })
  it('taking a request down asks for a confirmation first, then sends execute', async () => {
    const calls = stub({ [OPEN]: { body: { data: [row()] } }, [`POST /api/admin/takedowns/${ID}`]: { body: { data: row({ status: 'actioned' }) } } })
    const user = userEvent.setup()
    render(<TakedownDesk can={ALL} />)
    await user.click(await screen.findByRole('button', { name: 'Take down now' }))
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0) // nothing is sent by the first click
    expect(screen.getByText(/will be hidden or removed now/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1))
    expect(JSON.parse(calls.find((c) => c.method === 'POST')!.body!)).toEqual({ action: 'execute' })
  })
  it('an account takedown says it locks the account; reject needs a written reason', async () => {
    const calls = stub({ [OPEN]: { body: { data: [row({ target_type: 'user' })] } }, [`POST /api/admin/takedowns/${ID}`]: { body: { data: row() } } })
    const user = userEvent.setup()
    render(<TakedownDesk can={ALL} />)
    await user.click(await screen.findByRole('button', { name: 'Take down now' }))
    expect(screen.getByText(/LOCKING the account/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    await user.type(screen.getByLabelText(/Reason \/ note/), 'out of scope')
    expect(send.disabled).toBe(false)
    await user.click(send)
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1))
    expect(JSON.parse(calls.find((c) => c.method === 'POST')!.body!)).toEqual({ action: 'reject', notes: 'out of scope' })
  })
  it('without the hide permission the register is readable but no action or form is drawn; without the ban permission an account cannot be taken down', async () => {
    stub({ [OPEN]: { body: { data: [row(), row({ id: 'u', target_type: 'user' })] } } })
    const { unmount } = render(<TakedownDesk can={{ hide: false, ban: false }} />)
    await screen.findAllByText('Cơ quan A')
    expect(screen.queryByRole('button', { name: 'Take down now' })).toBeNull()
    expect(screen.queryByText('Record a new request')).toBeNull()
    expect(screen.getByText(/you may not take content down/)).toBeTruthy()
    unmount()
    stub({ [OPEN]: { body: { data: [row({ target_type: 'user' })] } } })
    render(<TakedownDesk can={{ hide: true, ban: false }} />)
    await screen.findByText('Cơ quan A')
    expect(screen.queryByRole('button', { name: 'Take down now' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
  })
  it('records a new request with the time it was RECEIVED in ISO form and executes it in the same call', async () => {
    const calls = stub({ [OPEN]: { body: { data: [] } }, 'POST /api/admin/takedowns': { status: 201, body: { data: row() } } })
    const user = userEvent.setup()
    render(<TakedownDesk can={ALL} />)
    await screen.findByText('No open requests.')
    const submit = screen.getByRole('button', { name: 'Record request' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true) // an agency and a content id are required
    await user.type(screen.getByLabelText('Agency / sender'), 'Bộ X')
    await user.type(screen.getByLabelText('Content id'), REVIEW)
    await user.type(screen.getByLabelText('Reference number'), 'CV-9')
    expect(submit.disabled).toBe(false)
    await user.click(submit)
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1))
    const body = JSON.parse(calls.find((c) => c.method === 'POST')!.body!)
    expect(body).toMatchObject({ source: 'authority', agency: 'Bộ X', reference_no: 'CV-9', urgency: 'standard_24h', target_type: 'review', target_id: REVIEW, execute: true })
    expect(new Date(body.received_at).toISOString()).toBe(body.received_at)
    expect(await screen.findByText('Request recorded.')).toBeTruthy()
  })
  it('a user complaint is forced to the 48 h window; an authority cannot pick it', async () => {
    stub({ [OPEN]: { body: { data: [] } } })
    const user = userEvent.setup()
    render(<TakedownDesk can={ALL} />)
    await screen.findByText('No open requests.')
    const urgency = screen.getByLabelText('Deadline') as HTMLSelectElement
    expect((screen.getByRole('option', { name: '48 hours (user complaint)' }) as HTMLOptionElement).disabled).toBe(true)
    await user.selectOptions(screen.getByLabelText('Source'), 'user_complaint')
    expect(urgency.value).toBe('complaint_48h'); expect(urgency.disabled).toBe(true)
  })
  it('maps the server\'s refusals to a message a person can act on', async () => {
    stub({ [OPEN]: { body: { data: [] } }, 'POST /api/admin/takedowns': { status: 409, body: { error: { code: 'CONFLICT' } } } })
    const user = userEvent.setup()
    render(<TakedownDesk can={ALL} />)
    await screen.findByText('No open requests.')
    await user.type(screen.getByLabelText('Agency / sender'), 'Bộ X')
    await user.type(screen.getByLabelText('Content id'), REVIEW)
    await user.click(screen.getByRole('button', { name: 'Record request' }))
    expect(await screen.findByText('This content already has an open request.')).toBeTruthy()
  })
})
