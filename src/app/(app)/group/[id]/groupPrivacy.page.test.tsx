// @vitest-environment jsdom
// Group dining is private (owner 20/11): the page draws what the server says the caller may see: sign-in, a join REQUEST, "waiting for the leader", the leader's list of requests to accept or decline, a member's view.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'g-1' }) }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }) }))
vi.mock('@/components/Header', () => ({ default: ({ title }: { title?: string }) => <header data-testid="header">{title}</header> }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))
vi.mock('../GroupAvatarPicker', () => ({ default: () => null }))
vi.mock('@/lib/groups/avatarClient', () => ({ uploadGroupAvatar: vi.fn() }))
vi.mock('@/lib/i18n/useTranslation', async () => {
  const { vi: dict } = await import('@/lib/i18n/presentation')
  const t = (k: string, vars?: Record<string, string>) => Object.entries(vars ?? {}).reduce((s, [n, v]) => s.split(`{${n}}`).join(v), dict[k] ?? k)
  return { useTranslation: () => ({ t, locale: 'vi' }) }
})

import GroupPage from './page'

type Reply = { status: number; body: unknown }
let groupReply: Reply
const calls: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('/api/group?id=')) return new Response(JSON.stringify(groupReply.body), { status: groupReply.status })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const member = (id: string, name: string) => ({ id, name, budget: '100–200k', food_preferences: 'lau', dietary_restrictions: 'chay', area: 'Quan 1' })

describe('the group page draws what the server says the caller may see', () => {
  it('no account: asks to sign in, with the way back to this group', async () => {
    groupReply = { status: 401, body: { error: 'unauthorized' } }
    render(<GroupPage />)
    const box = await screen.findByTestId('group-need-login')
    expect(box.textContent).toContain('Đăng nhập để vào nhóm')
    expect(box.querySelector('a')!.getAttribute('href')).toBe('/login?returnTo=%2Fgroup%2Fg-1')
  })
  it('a stranger with the link sees the name and a REQUEST form, and no member of the group', async () => {
    groupReply = { status: 200, body: { state: 'none', id: 'g-1', name: 'Bua toi thu 6' } }
    render(<GroupPage />)
    const form = await screen.findByTestId('group-request-form')
    expect(form.textContent).toContain('Xin vào nhóm "Bua toi thu 6"')
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu tham gia' })).toBeTruthy()
    expect(screen.queryByTestId('group-requests')).toBeNull()
    expect(document.body.textContent).not.toContain('thành viên')
  })
  it('after the request is sent the page says it waits for the leader (and the form is gone)', async () => {
    groupReply = { status: 200, body: { state: 'pending', id: 'g-1', name: 'Bua toi thu 6' } }
    render(<GroupPage />)
    const waiting = await screen.findByTestId('group-pending')
    expect(waiting.textContent).toContain('Chờ trưởng nhóm chấp nhận')
    expect(screen.queryByTestId('group-request-form')).toBeNull()
  })
  it('the leader sees the requests and can accept or decline each one; the page then reloads the group', async () => {
    groupReply = { status: 200, body: { state: 'creator', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'me', status: 'open', suggestion: null, members: [member('m1', 'Linh')], pendingRequests: [member('m2', 'Bao')] } }
    render(<GroupPage />)
    const requests = await screen.findByTestId('group-requests')
    expect(requests.textContent).toContain('Yêu cầu chờ duyệt (1)')
    expect(requests.textContent).toContain('Bao')
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }))
    await waitFor(() => expect(calls.some(c => c.url === '/api/group/g-1/members')).toBe(true))
    const post = calls.find(c => c.url === '/api/group/g-1/members')!
    expect(JSON.parse(String(post.init?.body))).toEqual({ memberId: 'm2', action: 'approve' })
    await waitFor(() => expect(calls.filter(c => c.url.startsWith('/api/group?id=')).length).toBeGreaterThanOrEqual(2))
  })
  it('the leader can remove an accepted member, and is told the group is private', async () => {
    groupReply = { status: 200, body: { state: 'creator', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'me', status: 'open', suggestion: null, members: [member('m1', 'Linh')], pendingRequests: [] } }
    render(<GroupPage />)
    await screen.findByTestId('group-private-note')
    expect(screen.queryByTestId('group-requests')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa khỏi nhóm' }))
    await waitFor(() => expect(JSON.parse(String(calls.find(c => c.url === '/api/group/g-1/members')!.init?.body))).toEqual({ memberId: 'm1', action: 'remove' }))
  })
  it('a member can leave, a pending person can withdraw, the leader can delete: each asks first, then calls the server', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const loc = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', { value: { origin: 'http://t.test', href: '' }, writable: true, configurable: true })
    try {
      groupReply = { status: 200, body: { state: 'member', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'boss', status: 'open', suggestion: null, members: [member('m1', 'Linh')] } }
      const a = render(<GroupPage />)
      fireEvent.click(await screen.findByTestId('group-leave'))
      await waitFor(() => expect(calls.some(c => c.url === '/api/group/g-1/leave' && c.init?.method === 'POST')).toBe(true))
      a.unmount()
      groupReply = { status: 200, body: { state: 'pending', id: 'g-1', name: 'Bua toi thu 6' } }
      const b = render(<GroupPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Rút yêu cầu' }))
      await waitFor(() => expect(calls.filter(c => c.url === '/api/group/g-1/leave').length).toBe(2))
      b.unmount()
      groupReply = { status: 200, body: { state: 'creator', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'me', status: 'open', suggestion: null, members: [], pendingRequests: [] } }
      render(<GroupPage />)
      fireEvent.click(await screen.findByTestId('group-delete'))
      await waitFor(() => expect(calls.some(c => c.url === '/api/group/g-1' && c.init?.method === 'DELETE')).toBe(true))
      expect(confirm).toHaveBeenCalledTimes(3)
    } finally {
      if (loc) Object.defineProperty(window, 'location', loc)
      confirm.mockRestore()
    }
  })
  it('declining the confirmation calls nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    groupReply = { status: 200, body: { state: 'creator', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'me', status: 'open', suggestion: null, members: [], pendingRequests: [] } }
    render(<GroupPage />)
    fireEvent.click(await screen.findByTestId('group-delete'))
    expect(calls.some(c => c.init?.method === 'DELETE')).toBe(false)
    confirm.mockRestore()
  })
  const cards = [
    { id: '1', name: 'Lau Be Man', address: '1 Le Loi, Quan 1', rating: 4.6, why: 'Co lau', maps_link: 'https://www.google.com/maps?q=1' },
    { id: '2', name: 'Bun Bo 3 Thang', address: '2 Nguyen Hue', rating: 4.2, why: 'Hop ngan sach' },
  ]
  const withVotes = (over: Record<string, unknown> = {}, votes: Record<string, unknown> = {}, state = 'member') => ({
    state, id: 'g-1', name: 'Bua toi thu 6', creator_id: state === 'creator' ? 'me' : 'boss', status: 'open', suggestion: 'text', members: [member('m1', 'Linh')], suggestion_options: cards, chosen_option: null,
    votes: { counts: { '1': 1, '2': 0 }, mine: null, voted: 1, participants: 3, majority: null, allVoted: false, ...votes }, ...over,
  })
  it('the suggestion is three cards: place, rating, address, why, map link, and the votes each has; a member votes and the page reloads', async () => {
    groupReply = { status: 200, body: withVotes() }
    render(<GroupPage />)
    const list = await screen.findAllByTestId('group-card')
    expect(list).toHaveLength(2)
    expect(list[0].textContent).toContain('Lau Be Man')
    expect(list[0].textContent).toContain('4.6')
    expect(list[0].textContent).toContain('Co lau')
    expect(list[0].querySelector('a')!.getAttribute('href')).toBe('https://www.google.com/maps?q=1')
    expect(screen.getAllByTestId('group-card-votes').map(e => e.textContent)).toEqual(['1 phiếu', '0 phiếu'])
    expect(screen.getByTestId('group-progress').textContent).toContain('1/3 người đã bình chọn')
    fireEvent.click(screen.getAllByRole('button', { name: 'Bình chọn quán này' })[1])
    await waitFor(() => expect(JSON.parse(String(calls.find(c => c.url === '/api/group/g-1/vote')!.init?.body))).toEqual({ optionId: '2' }))
  })
  it('your own vote is marked; after the decision the chosen place is announced and nobody can vote any more', async () => {
    groupReply = { status: 200, body: withVotes({}, { mine: '1', counts: { '1': 1, '2': 0 } }) }
    const a = render(<GroupPage />)
    expect((await screen.findByRole('button', { name: 'Bạn đã chọn quán này' }))).toBeTruthy()
    a.unmount()
    groupReply = { status: 200, body: withVotes({ chosen_option: '2' }, { majority: '2', counts: { '1': 1, '2': 2 }, voted: 3 }) }
    render(<GroupPage />)
    expect((await screen.findByTestId('group-chosen')).textContent).toContain('Bun Bo 3 Thang')
    expect(screen.queryByRole('button', { name: 'Bình chọn quán này' })).toBeNull()
    expect(screen.queryByTestId('group-progress')).toBeNull()
  })
  it('everyone voted and nobody has more than half: the leader gets "Chốt quán này", the others are told to wait', async () => {
    const tie = { allVoted: true, majority: null, voted: 3, counts: { '1': 1, '2': 1 } }
    groupReply = { status: 200, body: withVotes({ creator_id: 'me', pendingRequests: [] }, tie, 'creator') }
    const a = render(<GroupPage />)
    expect((await screen.findByTestId('group-tie')).textContent).toContain('Trưởng nhóm chọn quán')
    fireEvent.click(screen.getAllByRole('button', { name: 'Chốt quán này' })[0])
    await waitFor(() => expect(JSON.parse(String(calls.find(c => c.url === '/api/group/g-1/choose')!.init?.body))).toEqual({ optionId: '1' }))
    a.unmount()
    groupReply = { status: 200, body: withVotes({}, tie) }
    render(<GroupPage />)
    expect((await screen.findByTestId('group-tie')).textContent).toContain('Chờ trưởng nhóm')
    expect(screen.queryByRole('button', { name: 'Chốt quán này' })).toBeNull()
  })
  it('the leader can suggest again (after a confirmation); a suggestion with no cards is shown as text', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    groupReply = { status: 200, body: withVotes({ creator_id: 'me', pendingRequests: [] }, {}, 'creator') }
    const a = render(<GroupPage />)
    fireEvent.click(await screen.findByTestId('group-resuggest'))
    await waitFor(() => expect(calls.some(c => c.url === '/api/group/g-1/suggest')).toBe(true))
    expect(confirm).toHaveBeenCalledTimes(1)
    a.unmount()
    groupReply = { status: 200, body: withVotes({ suggestion_options: null, suggestion: 'Goi y bang van ban' }) }
    render(<GroupPage />)
    await waitFor(() => expect(document.body.textContent).toContain('Goi y bang van ban'))
    expect(screen.queryByTestId('group-cards')).toBeNull()
    confirm.mockRestore()
  })
  it('an accepted member sees the members count and no request list, and no request form', async () => {
    groupReply = { status: 200, body: { state: 'member', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'boss', status: 'open', suggestion: null, members: [member('m1', 'Linh'), member('m3', 'Cuong')] } }
    render(<GroupPage />)
    await waitFor(() => expect(document.body.textContent).toContain('2 thành viên'))
    expect(screen.queryByTestId('group-requests')).toBeNull()
    expect(screen.queryByTestId('group-request-form')).toBeNull()
    expect(screen.queryByTestId('group-private-note')).toBeNull()
  })
})
