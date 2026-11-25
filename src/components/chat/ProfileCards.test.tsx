// @vitest-environment jsdom
// 15/11 (owner's layout): one card per subject - picture, name, subtitle, points with a bold label, sources, a profile button that opens the panel beside the chat.
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ProfileCards from './ProfileCards'
import PresentationBlocks from './PresentationBlocks'
import { __clearEntityProfileCache } from '@/lib/chat/entityProfiles'

const items = [
  { name: 'Elon Musk', subtitle: '1971 · 55 tuổi', points: [{ lead: 'Tesla', text: 'xe điện.' }, { text: 'Ý không nhãn.' }], sources: ['TechCrunch', 'Reuters'] },
  { name: 'Sam Altman', points: [{ lead: 'OpenAI', text: 'CEO.' }] },
]
const label = { open: 'Xem hồ sơ Tappy', sources: 'Nguồn' }
const fetchMock = vi.fn()
const profile = { name: 'Elon Musk', title: 'Elon Musk', description: 'Doanh nhân', extract: 'Doanh nhân.', image: 'https://upload.wikimedia.org/x/elon.jpg', href: 'https://en.wikipedia.org/wiki/Elon_Musk', lang: 'en', source: 'Wikipedia' }

beforeEach(() => { __clearEntityProfileCache(); fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ profiles: [profile] }) }); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ProfileCards', () => {
  it('a card per subject: name, subtitle, bold label + fact, the sources named', () => {
    const { container, getAllByTestId } = render(<ProfileCards title="So sánh" items={items} label={label} />)
    expect(container.querySelectorAll('[data-profile-card]')).toHaveLength(2)
    const text = container.textContent ?? ''
    expect(text).toContain('So sánh')
    expect(text).toContain('1971 · 55 tuổi')
    expect(container.querySelector('li strong')?.textContent).toBe('Tesla: ')
    expect(text).toContain('Ý không nhãn.')
    expect(text).toContain('Nguồn: TechCrunch, Reuters')
    expect(() => getAllByTestId('profile-open')).toThrow() // no side panel in this layout: no profile button
  })
  it('the picture and the profile are Wikipedia\'s for the same name; a subject it does not know keeps an initial and no button', async () => {
    const opened = vi.fn()
    const { container, findAllByTestId } = render(<ProfileCards items={items} label={label} onOpenProfile={opened} />)
    const buttons = await findAllByTestId('profile-open')
    expect(buttons).toHaveLength(1) // only Elon resolved
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://upload.wikimedia.org/x/elon.jpg')
    expect(container.querySelectorAll('[data-profile-card]')[1].textContent).toContain('SA') // initials of Sam Altman
    fireEvent.click(buttons[0])
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ name: 'Elon Musk' }))
    fireEvent.click(container.querySelector('[data-testid="profile-name"]')!)
    expect(opened).toHaveBeenCalledTimes(2)
  })
  it('a failed lookup leaves the cards as they are (initials, no button), never an error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { container, queryAllByTestId } = render(<ProfileCards items={items} label={label} onOpenProfile={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.querySelectorAll('[data-profile-card]')).toHaveLength(2)
    expect(queryAllByTestId('profile-open')).toHaveLength(0)
  })
})

describe('ProfileCards: web pictures and the mono heading (owner approved 16/11)', () => {
  const web = new Map([['sam altman', 'https://img.example.com/sam.jpg'], ['elon musk', 'https://img.example.com/not-used.jpg']])
  it('a subject Wikipedia has no picture for takes the server\'s web picture; Wikipedia\'s picture always wins', async () => {
    const { container, findAllByTestId } = render(<ProfileCards items={items} label={label} onOpenProfile={() => {}} fallbackImages={web} />)
    await findAllByTestId('profile-open')
    const srcs = [...container.querySelectorAll('[data-profile-card] img')].map(i => i.getAttribute('src'))
    expect(srcs).toEqual(['https://upload.wikimedia.org/x/elon.jpg', 'https://img.example.com/sam.jpg'])
  })
  it('an unsafe web address is never drawn: the card keeps its initial', () => {
    const { container } = render(<ProfileCards items={[items[1]]} label={label} fallbackImages={new Map([['sam altman', 'http://insecure.example.com/s.jpg']])} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('SA')
  })
  it('the title is a mono eyebrow with its number in the v206 look, a plain heading otherwise', () => {
    const look = render(<ProfileCards title="Hai lựa chọn" items={items} label={label} look eyebrow="1." />)
    const h = look.getByTestId('block-eyebrow')
    expect(h.className).toContain('v206-h')
    expect(h.querySelector('.v206-hnum')?.textContent).toBe('1.')
    cleanup()
    const plain = render(<ProfileCards title="Hai lựa chọn" items={items} label={label} />)
    expect(plain.queryByTestId('block-eyebrow')).toBeNull()
  })
  it('a line under the heading says what the cards rest on, only when asked', () => {
    const withNote = render(<ProfileCards title="Hai quán" items={items} label={label} note="Thông tin tham khảo, chưa có dữ liệu địa điểm" />)
    expect(withNote.getByTestId('profiles-note').textContent).toContain('chưa có dữ liệu địa điểm')
    cleanup()
    expect(render(<ProfileCards title="Hai quán" items={items} label={label} />).queryByTestId('profiles-note')).toBeNull()
  })
  it('a compare table\'s title moves above its box as the numbered eyebrow in the v206 look', () => {
    const frame = { presentation: { v: 1 as const, blocks: [{ id: 'c', type: 'compare' as const, title: 'So sánh nhanh', columns: ['A', 'B'], rows: [{ label: 'Giá', cells: ['1', '2'] }] }] }, links: {} }
    const look = render(<PresentationBlocks frame={frame} onSend={() => {}} look eyebrow="2." />)
    expect(look.getByTestId('block-eyebrow').textContent).toBe('2.So sánh nhanh')
    expect(look.container.querySelector('[data-block="compare"] h3')).toBeNull()
    cleanup()
    const plain = render(<PresentationBlocks frame={frame} onSend={() => {}} />)
    expect(plain.container.querySelector('[data-block="compare"] h3')?.textContent).toBe('So sánh nhanh')
  })
})

describe('ProfileCards: subjects that each carry one line are a table (UAT 60, question 5)', () => {
  const banks = ['Agribank', 'BIDV', 'Vietcombank'].map(name => ({ name, subtitle: 'Mức niêm yết tại quầy', points: [{ lead: '12 tháng', text: '5,4%/năm' }], sources: ['CafeF'] }))
  it('three or more subjects with one point each: one table, no cards, no profile buttons; the label, the figure and the source stay', () => {
    const { container, getByTestId, queryAllByTestId } = render(<ProfileCards title="Lãi suất" items={banks} label={label} onOpenProfile={() => {}} />)
    expect(container.querySelectorAll('[data-profile-card]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-profile-row]')).toHaveLength(3)
    expect(getByTestId('profiles-table').textContent).toContain('Agribank')
    expect(getByTestId('profiles-table').textContent).toContain('12 tháng: 5,4%/năm')
    expect(getByTestId('profiles-table').textContent).toContain('Nguồn: CafeF')
    expect(queryAllByTestId('profile-open')).toHaveLength(0)
  })
  it('two subjects, or subjects with more than one point, stay cards', () => {
    expect(render(<ProfileCards items={banks.slice(0, 2)} label={label} />).container.querySelectorAll('[data-profile-card]')).toHaveLength(2)
    cleanup()
    const rich = banks.map(b => ({ ...b, points: [{ text: 'a' }, { text: 'b' }] }))
    expect(render(<ProfileCards items={rich} label={label} />).container.querySelectorAll('[data-profile-card]')).toHaveLength(3)
  })
})

describe('PresentationBlocks draws a declared profiles block', () => {
  it('as the cards, with the language\'s own words', () => {
    const frame = { presentation: { v: 1 as const, blocks: [{ id: 'p', type: 'profiles' as const, items }] }, links: {} }
    const vi_ = render(<PresentationBlocks frame={frame} lang="vi" onSend={() => {}} onOpenProfile={() => {}} />)
    expect(vi_.container.querySelector('[data-block="profiles"]')).toBeTruthy()
    expect(vi_.container.textContent).toContain('Nguồn: TechCrunch')
    cleanup()
    const en = render(<PresentationBlocks frame={frame} lang="en" onSend={() => {}} />)
    expect(en.container.textContent).toContain('Sources: TechCrunch')
  })
})
