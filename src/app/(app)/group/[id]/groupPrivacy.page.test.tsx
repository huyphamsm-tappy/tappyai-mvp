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
  it('an accepted member sees the members count and no request list, and no request form', async () => {
    groupReply = { status: 200, body: { state: 'member', id: 'g-1', name: 'Bua toi thu 6', creator_id: 'boss', status: 'open', suggestion: null, members: [member('m1', 'Linh'), member('m3', 'Cuong')] } }
    render(<GroupPage />)
    await waitFor(() => expect(document.body.textContent).toContain('2 thành viên'))
    expect(screen.queryByTestId('group-requests')).toBeNull()
    expect(screen.queryByTestId('group-request-form')).toBeNull()
    expect(screen.queryByTestId('group-private-note')).toBeNull()
  })
})
