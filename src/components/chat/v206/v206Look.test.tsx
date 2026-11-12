// @vitest-environment jsdom
// The mockup look in the browser: the place card (the two Happy hour cards, real fields only, hidden controls, profile drawer, save), the rail, the product header, the history rows
// (preview, group collapse) and the conversation header. A flag-off render of the place decision keeps the old photo card.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import PlaceDecision from '@/components/chat/PlaceDecision'
import V206PlaceCard from './V206PlaceCard'
import V206DrawerHost from './V206Drawers'
import NavRail from '@/components/chat/workspace/NavRail'
import ProductHeader from '@/components/chat/workspace/ProductHeader'
import HistorySidebar from '@/components/chat/workspace/HistorySidebar'
import { ConversationStoreProvider } from '@/components/chat/workspace/ChatWorkspaceContext'
import type { ConversationStore } from '@/components/chat/workspace/useConversationList'
import { v206Store } from '@/lib/chat/v206Store'
import { OPEN_SAVED_EVENT } from '@/lib/chat/v206Look'
import type { LivePlace, PlacesLiveView } from '@/lib/recommendation/liveView'

let pathname = '/chat/c1'
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }))

const offDry = {
  id: 'p-offdry', domain: 'food', kind: 'place', name: 'Off-dry Cocktail & Wine Bar', address: '35 Nguyễn Văn Tráng, Bến Thành, Hồ Chí Minh', rating: 5, ratingCount: 753,
  phone: '+84 702 290 191', openingHours: '17:00-00:00', openNow: false, categories: ['Quán bar cocktail'], image: 'https://lh3.googleusercontent.com/off', rank: 1,
  actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://www.google.com/maps/place/offdry', labelKey: 'v3.action.maps' }, { kind: 'website', urlKind: 'direct', url: 'https://offdry.example/', labelKey: 'x' }, { kind: 'call', urlKind: 'direct', url: 'tel:+84702290191', labelKey: 'x' }],
} as unknown as LivePlace
const lost = {
  id: 'p-lost', domain: 'food', kind: 'place', name: 'Lost - Drink & Chill', address: '71/5 Mạc Thị Bưởi, Sài Gòn, Hồ Chí Minh, Việt Nam', rating: 4.6, ratingCount: 537,
  phone: '+84 787 655 688', openingHours: '12:00-03:00', openNow: true, categories: ['Quán bar cocktail'], rank: 2,
  actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://www.google.com/maps/place/lost', labelKey: 'v3.action.maps' }],
} as unknown as LivePlace
const bare = { id: '', domain: 'food', kind: 'place', name: 'Quán Trống', rank: 3, actions: [] } as unknown as LivePlace

const view = (items: LivePlace[]): PlacesLiveView => ({ kind: 'places', v: 1, domain: 'food', items } as unknown as PlacesLiveView)

beforeEach(() => { setLocale('vi'); v206Store.reset(); pathname = '/chat/c1' })
afterEach(() => { cleanup(); v206Store.reset(); vi.unstubAllGlobals() })

describe('V206PlaceCard', () => {
  it('draws the real fields of the open card: badge, rating chip, address, hours, open state, buttons', () => {
    render(<V206PlaceCard p={lost} position={1} ranked={false} />)
    expect(screen.getByTestId('v206-pc-badge').textContent).toBe('Quán bar cocktail')
    expect(screen.getByTestId('v206-pc-rating').textContent).toBe('★ 4.6 (537)')
    expect(screen.getByTestId('v206-pc-address').textContent).toContain('71/5 Mạc Thị Bưởi')
    expect(screen.getByTestId('v206-pc-meta').textContent).toContain('12:00-03:00')
    expect(screen.getByTestId('v206-pc-meta').textContent).toContain('Đang mở')
    expect(screen.getByTestId('v206-pc-profile').textContent).toContain('Xem hồ sơ')
    expect(screen.getByTestId('v206-pc-map').getAttribute('href')).toBe('https://www.google.com/maps/place/lost')
    expect(screen.getByTestId('v206-pc-hotline').getAttribute('href')).toBe('tel:+84787655688')
    expect(screen.getByTestId('v206-pc-save')).toBeTruthy()
  })

  it('the closed card says closed, and shows the 5 star rating with its 753 reviews', () => {
    render(<V206PlaceCard p={offDry} position={0} ranked={false} />)
    expect(screen.getByTestId('v206-pc-rating').textContent).toBe('★ 5.0 (753)')
    expect(screen.getByTestId('v206-pc-meta').textContent).toContain('17:00-00:00')
    expect(screen.getByTestId('v206-pc-meta').textContent).toContain('Đang đóng')
    expect(screen.getByTestId('v206-pc-website').getAttribute('href')).toBe('https://offdry.example/')
  })

  it('a control with no data behind it is not drawn, and nothing is made up', () => {
    const { container } = render(<V206PlaceCard p={bare} position={2} ranked={false} />)
    for (const id of ['v206-pc-badge', 'v206-pc-rating', 'v206-pc-address', 'v206-pc-meta', 'v206-pc-profile', 'v206-pc-map', 'v206-pc-website', 'v206-pc-hotline', 'v206-pc-save', 'v206-pc-price']) expect(screen.queryByTestId(id)).toBeNull()
    expect(container.textContent).toBe('Quán Trống')
    expect(container.textContent).not.toMatch(/Menu|verified|Evidence|đối tác|giảm/i)
  })

  it('"Xem hồ sơ" opens the profile drawer with this card\'s own facts and no verification claim', () => {
    render(<><V206PlaceCard p={lost} position={1} ranked={false} /><V206DrawerHost /></>)
    fireEvent.click(screen.getByTestId('v206-pc-profile'))
    const drawer = screen.getByTestId('v206-entity-drawer')
    expect(drawer.textContent).toContain('Lost - Drink & Chill')
    expect(drawer.textContent).toContain('537')
    expect(drawer.textContent).not.toMatch(/verified|Evidence|đối tác/i)
  })

  it('the name arrow opens the same profile', () => {
    render(<><V206PlaceCard p={lost} position={1} ranked={false} /><V206DrawerHost /></>)
    fireEvent.click(screen.getByRole('button', { name: /Mở hồ sơ Lost/ }))
    expect(screen.getByTestId('v206-entity-drawer')).toBeTruthy()
  })

  it('"Lưu" saves through POST /api/favorites with the card\'s own id, and a second press removes it', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<V206PlaceCard p={lost} position={1} ranked={false} />)
    fireEvent.click(screen.getByTestId('v206-pc-save'))
    await waitFor(() => expect(screen.getByTestId('v206-pc-save').getAttribute('data-state')).toBe('saved'))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(url).toBe('/api/favorites')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ placeId: 'p-lost', placeName: 'Lost - Drink & Chill', placeAddress: '71/5 Mạc Thị Bưởi, Sài Gòn, Hồ Chí Minh, Việt Nam', placeType: 'Quán bar cocktail' })
    fireEvent.click(screen.getByTestId('v206-pc-save'))
    await waitFor(() => expect(screen.getByTestId('v206-pc-save').getAttribute('data-state')).toBe('idle'))
    expect((fetchMock.mock.calls[1] as unknown as [string, { method: string }])[1].method).toBe('DELETE')
  })

  it('a failed save says so and does not pretend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
    render(<V206PlaceCard p={lost} position={1} ranked={false} />)
    fireEvent.click(screen.getByTestId('v206-pc-save'))
    await waitFor(() => expect(screen.getByTestId('v206-pc-save').getAttribute('data-state')).toBe('failed'))
    expect(screen.getByTestId('v206-pc-save').textContent).toContain('Không lưu được')
  })
})

describe('PlaceDecision picks the card by the flag', () => {
  it('flag off (default): the old photo card, no v206 card', () => {
    const { container } = render(<PlaceDecision view={view([offDry, lost])} />)
    expect(container.querySelector('[data-v206-card]')).toBeNull()
    expect(container.querySelectorAll('[data-testid="place-card"]')).toHaveLength(2)
    expect(container.querySelector('img')).toBeTruthy() // the old card keeps its photo
  })
  it('flag on: the mockup card for every place', () => {
    const { container } = render(<PlaceDecision view={view([offDry, lost])} forceV206 />)
    expect(container.querySelectorAll('[data-v206-card="true"]')).toHaveLength(2)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('NavRail (the mockup rail)', () => {
  it('has the blue "Tạo mới" button on top and the real saved count on "Đã lưu"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ favorites: [{ id: 1 }, { id: 2 }, { id: 3 }] }) })))
    render(<NavRail />)
    expect(screen.getByTestId('rail-create').getAttribute('href')).toBe('/chat')
    expect(screen.getByTestId('rail-create').textContent).toContain('Tạo mới')
    await waitFor(() => expect(screen.getByTestId('rail-saved-count').textContent).toBe('3'))
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('aria-current')).toBe('page')
  })
  it('no badge when nothing is saved or the list cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
    render(<NavRail />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByTestId('rail-saved-count')).toBeNull()
  })
  it('"Đã lưu" asks the header to open the saved places', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
    const seen = vi.fn()
    window.addEventListener(OPEN_SAVED_EVENT, seen)
    render(<NavRail />)
    fireEvent.click(screen.getByTestId('rail-saved'))
    window.removeEventListener(OPEN_SAVED_EVENT, seen)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('ProductHeader', () => {
  it('shows the real plan badge, the name and the tagline, and no verification or partner element', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ subscription: { state: 'ACTIVE', plan: { id: 'pro', name: 'Pro' } } }) })))
    const { container } = render(<ProductHeader />)
    await waitFor(() => expect(screen.getByTestId('v206-plan-badge').textContent).toBe('PRO'))
    expect(container.textContent).toContain('TappyAI')
    expect(container.textContent).toContain('Trợ lý Trí tuệ Toàn diện')
    expect(container.textContent).not.toMatch(/Evidence|ĐỐI TÁC|đối tác|Gate/i)
  })
  it('no plan, no badge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ subscription: { state: 'NONE', plan: null } }) })))
    render(<ProductHeader />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByTestId('v206-plan-badge')).toBeNull()
  })
  it('subscriptions off (404) is no badge either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    render(<ProductHeader />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByTestId('v206-plan-badge')).toBeNull()
  })
})

describe('HistorySidebar rows', () => {
  const now = new Date().toISOString()
  const conv = (id: string, title: string, category: string, last: string) => ({ id, title, category, updated_at: now, messages: [{ role: 'user', content: 'hỏi' }, { role: 'assistant', content: last }] })
  const store = (): ConversationStore => ({
    items: [conv('c1', 'Happy hour thứ 6', 'food', '**Lost** là quán hay.\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]'), conv('c2', 'Lịch trình Đà Lạt', 'travel', '## Ngày 1\n- Hồ Tuyền Lâm')],
    setItems: vi.fn(), status: 'ready', setStatus: vi.fn(), hasMore: true, loadingMore: false, reload: vi.fn(async () => {}), loadMore: vi.fn(async () => {}),
    projects: [], setProjects: vi.fn(), reloadProjects: vi.fn(async () => {}),
  })
  it('each row has an icon, the title and a one-line preview of its real last message (no markup, no card block)', () => {
    render(<ConversationStoreProvider value={store()}><HistorySidebar /></ConversationStoreProvider>)
    const previews = screen.getAllByTestId('history-preview').map(p => p.textContent)
    expect(previews).toContain('Lost là quán hay.')
    expect(previews).toContain('Ngày 1 Hồ Tuyền Lâm')
    expect(previews.join(' ')).not.toMatch(/\[|\*|#|CTA/)
  })
  it('a group collapses and opens again, and keeps its count', () => {
    const { container } = render(<ConversationStoreProvider value={store()}><HistorySidebar /></ConversationStoreProvider>)
    const head = container.querySelector('[data-group="today"] h3 button') as HTMLButtonElement
    expect(head.textContent).toContain('(2)')
    expect(container.querySelectorAll('[data-conv-id]')).toHaveLength(2)
    fireEvent.click(head)
    expect(container.querySelectorAll('[data-conv-id]')).toHaveLength(0)
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(head.textContent).toContain('(2)')
    fireEvent.click(head)
    expect(container.querySelectorAll('[data-conv-id]')).toHaveLength(2)
  })
  it('the load-more button sits in a footer and calls the store (the page after the loaded ones)', () => {
    const s = store()
    render(<ConversationStoreProvider value={s}><HistorySidebar /></ConversationStoreProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm lịch sử/ }))
    expect(s.loadMore).toHaveBeenCalledTimes(1)
  })
})
