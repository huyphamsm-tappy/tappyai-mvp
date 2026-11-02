// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { formatMessage, onMessageLinkClick } from './ChatInterface'
import { buildRecheckUrl, parseRecheckHref, runRecheck, type RecheckPayload } from '@/lib/providers/realtime/recheckLink'

// ── "Kiểm tra giá & tình trạng" in the web chat: the link renders as a chip, a tap runs the recheck in place, the booking CTA stays ──────────

const payload: RecheckPayload = { v: 1, provider: 'agoda', providerItemId: '4942635', title: 'The Luxe Hotel Đà Lạt', previousPrice: 1_800_000, currency: 'VND', stay: { destination: 'Đà Lạt', checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2, rooms: 1 } }
const RECHECK = buildRecheckUrl('https://www.tappyai.com', payload)
const BOOKING = 'https://www.agoda.com/partners/partnersearch.aspx?cid=1&hid=4942635&checkin=2026-10-20'
const message = `Giá phòng:\n\n🔗 Liên kết chính thức: [Kiểm tra giá & tình trạng: The Luxe Hotel Đà Lạt · Agoda](${RECHECK}) · [The Luxe Hotel Đà Lạt — 1.800.000đ, kiểm tra lúc 10:00 · Agoda](${BOOKING})`

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('recheck link payload', () => {
  it('round-trips (unicode included) and rejects anything that is not exactly a well-formed payload', () => {
    expect(parseRecheckHref(RECHECK)).toEqual({ ...payload })
    expect(parseRecheckHref('https://www.tappyai.com/booking/recheck')).toBeNull()
    expect(parseRecheckHref('https://www.tappyai.com/other#abc')).toBeNull()
    expect(parseRecheckHref(`${RECHECK}AAAA`)).toBeNull() // tampered
    const bad = (over: Record<string, unknown>) => parseRecheckHref(buildRecheckUrl('https://x.test', { ...payload, ...over } as RecheckPayload))
    expect(bad({ provider: 'evil' })).toBeNull()
    expect(bad({ providerItemId: '1;DROP' })).toBeNull()
    expect(bad({ stay: { ...payload.stay, checkOut: '2026-10-19' } })).toBeNull()
    expect(bad({ stay: { ...payload.stay, adults: 0 } })).toBeNull()
  })

  it('runRecheck never throws: a failing request is "unchecked" with the honest page sentence; the server booking URL must be https', async () => {
    const boom = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await runRecheck(RECHECK, boom)).toMatchObject({ status: 'unchecked', sentence: expect.stringMatching(/kiểm tra trên trang/) })
    const http = (json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status: 200 })) as unknown as typeof fetch
    expect((await runRecheck(RECHECK, http({ status: 'ok', sentence: 'x', bookingUrl: 'http://evil.example' })))?.bookingUrl).toBeUndefined()
    expect((await runRecheck(RECHECK, http({ status: 'ok', sentence: 'x', bookingUrl: BOOKING })))?.bookingUrl).toBe(BOOKING)
    expect(await runRecheck('https://www.agoda.com/x', http({}))).toBeNull() // not a recheck link: nothing is sent
  })
})

describe('in the chat message', () => {
  const mount = () => render(<div data-testid="msg" onClick={onMessageLinkClick} dangerouslySetInnerHTML={{ __html: formatMessage(message) }} />)

  it('the recheck link renders as a chip beside the booking link (recheck first, then the CTA)', () => {
    mount()
    const links = screen.getByTestId('msg').querySelectorAll('a')
    expect(links).toHaveLength(2)
    expect(links[0].textContent).toMatch(/^Kiểm tra giá & tình trạng/)
    expect(links[1].getAttribute('href')).toContain('agoda.com')
  })

  it('a tap runs the recheck in place: price changed → the new price beside the link, the server booking link offered, the page is NOT navigated', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'price_changed', sentence: 'Giá đã đổi còn 2.000.000đ khi kiểm tra lại — kiểm tra lần cuối trên trang Agoda.', bookingUrl: BOOKING }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mount()
    const first = screen.getByTestId('msg').querySelectorAll('a')[0] as HTMLAnchorElement
    const notPrevented = fireEvent.click(first)
    expect(notPrevented).toBe(false) // preventDefault: the recheck link never navigates
    await waitFor(() => expect(screen.getByTestId('msg').querySelector('[data-recheck-note]')).not.toBeNull())
    const note = screen.getByTestId('msg').querySelector('[data-recheck-note]') as HTMLElement
    expect(note.dataset.recheckNote).toBe('price_changed')
    expect(note.textContent).toMatch(/Giá đã đổi còn 2\.000\.000đ/)
    expect(note.querySelector('a')?.getAttribute('href')).toBe(BOOKING)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(sent).toMatchObject({ provider: 'agoda', providerItemId: '4942635', previousPrice: 1_800_000, stay: { checkIn: '2026-10-20', adults: 2 } })
    expect(first.textContent).toMatch(/^Kiểm tra giá & tình trạng/) // the label is restored after the check
  })

  it('unavailable: the sentence is shown and NO booking link is offered; a second tap replaces the note instead of stacking it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'unavailable', sentence: 'Agoda báo hết chỗ cho lựa chọn này — hãy chọn phương án khác.', bookingUrl: BOOKING }), { status: 200 })))
    mount()
    const first = screen.getByTestId('msg').querySelectorAll('a')[0] as HTMLAnchorElement
    fireEvent.click(first)
    await waitFor(() => expect(screen.getByTestId('msg').querySelectorAll('[data-recheck-note]')).toHaveLength(1))
    expect(screen.getByTestId('msg').querySelector('[data-recheck-note] a')).toBeNull()
    fireEvent.click(first)
    await waitFor(() => expect(first.dataset.rechecking).toBeUndefined())
    expect(screen.getByTestId('msg').querySelectorAll('[data-recheck-note]')).toHaveLength(1)
  })

  it('the booking link is untouched by the handler (normal navigation)', () => {
    mount()
    const booking = screen.getByTestId('msg').querySelectorAll('a')[1] as HTMLAnchorElement
    expect(fireEvent.click(booking)).toBe(true) // not prevented
  })
})
