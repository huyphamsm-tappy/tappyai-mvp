// @vitest-environment jsdom
// 15/11 (owner): a tap on a link of an answer reads it beside the chat. The interceptor is mounted once and decides per click; the drawer shows what /api/link-preview returned and always offers the
// original page.
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { v206Store } from '@/lib/chat/v206Store'
import ReaderLinkInterceptor from './ReaderLinkInterceptor'
import V206DrawerHost from './V206Drawers'

const fetchMock = vi.fn()
beforeEach(() => { v206Store.reset(); fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false }) }); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const page = () => (
  <div>
    <ReaderLinkInterceptor />
    <div className="message-content"><p>Tin <a href="https://vnexpress.net/gia-vang.html" target="_blank" rel="noopener noreferrer">Giá vàng giảm mạnh</a>.</p>
      <a data-testid="map" href="https://www.google.com/maps/place/X" target="_blank">Bản đồ</a>
      <a data-testid="own" href="/chat/1">Cuộc trò chuyện</a></div>
    <div data-doc-sources><a data-testid="src" href="https://baomau.vn/a" target="_blank">baomau.vn</a></div>
    <div data-testid="place-card"><a data-testid="book" href="https://www.agoda.com/x" target="_blank">Đặt phòng</a></div>
    <V206DrawerHost />
  </div>
)
const open = () => v206Store.getSnapshot().drawer

describe('the interceptor', () => {
  it('a plain click on a link in the answer text opens the reader (and not a new tab); the sources list does too', () => {
    const { container, getByTestId } = render(page())
    const link = container.querySelector('.message-content a') as HTMLAnchorElement
    const notPrevented = fireEvent.click(link)
    expect(notPrevented).toBe(false) // the default (a new tab) was prevented
    expect(open()).toEqual({ kind: 'link', url: 'https://vnexpress.net/gia-vang.html', title: 'Giá vàng giảm mạnh' })
    v206Store.closeDrawer()
    fireEvent.click(getByTestId('src'))
    expect(open()).toMatchObject({ kind: 'link', url: 'https://baomau.vn/a' })
  })
  it('a map, a link of this site, a place card\'s button and a click with Ctrl are left alone', () => {
    const { getByTestId, container } = render(page())
    expect(fireEvent.click(getByTestId('map'))).toBe(true)
    expect(fireEvent.click(getByTestId('own'))).toBe(true)
    expect(fireEvent.click(getByTestId('book'))).toBe(true)
    expect(fireEvent.click(container.querySelector('.message-content a')!, { ctrlKey: true })).toBe(true)
    expect(open()).toBeNull()
  })
})

describe('the reader drawer', () => {
  it('shows what the page says of itself and the button to the original page', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, host: 'vnexpress.net', title: 'Giá vàng giảm mạnh', siteName: 'VnExpress', description: 'Vàng giảm 4,5% trong tuần.', publishedAt: '2026-11-13T08:00:00Z', passages: ['Đoạn đầu của bài.'] }) })
    const { container, findByTestId, getByTestId } = render(page())
    act(() => { v206Store.openLink('https://vnexpress.net/gia-vang.html', 'Giá vàng') })
    await findByTestId('v206-link-article')
    expect(fetchMock).toHaveBeenCalledWith('/api/link-preview?u=' + encodeURIComponent('https://vnexpress.net/gia-vang.html'))
    expect(container.ownerDocument.body.textContent).toContain('Vàng giảm 4,5% trong tuần.')
    expect(container.ownerDocument.body.textContent).toContain('Đoạn đầu của bài.')
    const orig = getByTestId('v206-link-original') as HTMLAnchorElement
    expect(orig.href).toBe('https://vnexpress.net/gia-vang.html')
    expect(orig.target).toBe('_blank')
    expect(orig.rel).toContain('noopener')
  })
  it('a page that cannot be read still opens: a plain message and the button to the original page', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false, host: 'baomau.vn', reason: 'http_error' }) })
    const { getByTestId } = render(page())
    act(() => { v206Store.openLink('https://baomau.vn/a') })
    await waitFor(() => expect(getByTestId('v206-link-unreadable')).toBeTruthy())
    expect((getByTestId('v206-link-original') as HTMLAnchorElement).href).toBe('https://baomau.vn/a')
  })
  it('a failed request is the same as an unreadable page; the link inside the drawer is not intercepted again', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { getByTestId } = render(page())
    act(() => { v206Store.openLink('https://baomau.vn/a') })
    await waitFor(() => expect(getByTestId('v206-link-unreadable')).toBeTruthy())
    expect(fireEvent.click(getByTestId('v206-link-original'))).toBe(true)
  })
  it('opening a link replaces any other drawer; Esc closes it', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false }) })
    render(page())
    act(() => { v206Store.openLink('https://baomau.vn/a') })
    expect(open()?.kind).toBe('link')
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    await waitFor(() => expect(open()).toBeNull())
  })
})
