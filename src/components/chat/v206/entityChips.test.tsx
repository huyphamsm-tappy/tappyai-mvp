// @vitest-environment jsdom
// Entity chips in the browser: a bold name Wikipedia resolved is a chip with its icon; a name it could not resolve stays plain bold; a click or Enter opens the right-hand
// drawer with the REAL profile (photo, description, extract, "Nguồn: Wikipedia" with the link) and nothing else (no verification badge); nothing is asked while the answer streams.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import { formatMessage } from '@/components/ChatInterface'
import { ArticleAnswer } from '@/components/chat/ArticleAnswer'
import EntityChipsScope, { chipClick, chipKeyDown } from './EntityChipsScope'
import V206DrawerHost from './V206Drawers'
import { v206Store } from '@/lib/chat/v206Store'
import { __clearEntityProfileCache } from '@/lib/chat/entityProfiles'

const musk = { name: 'Elon Musk', title: 'Elon Musk', description: 'Doanh nhân', extract: 'Elon Reeve Musk là một doanh nhân và nhà đầu tư.', image: 'https://upload.wikimedia.org/p.jpg', href: 'https://vi.wikipedia.org/wiki/Elon_Musk', lang: 'vi', source: 'Wikipedia' }
const TEXT = 'Tui thấy **Elon Musk** và **Sam Altman** khác nhau, còn **Quán Bar Một** thì là thẻ quán.'

let fetchMock: ReturnType<typeof vi.fn>
/** 18/11: the sense check's verdict for the profiles of a request (true = the profile is about what the answer talks about) */
let sense: (n: number) => boolean[]
beforeEach(() => {
  setLocale('vi'); v206Store.reset(); __clearEntityProfileCache()
  sense = n => Array.from({ length: n }, () => true)
  fetchMock = vi.fn(async (url: string, init?: { body?: string }) => String(url).includes('/sense')
    ? new Response(JSON.stringify({ same: sense((JSON.parse(init?.body ?? '{}').cards ?? []).length) }), { status: 200 })
    : new Response(JSON.stringify({ profiles: [musk] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); v206Store.reset(); vi.unstubAllGlobals() })

function Harness({ enabled = true, text = TEXT }: { enabled?: boolean; text?: string }) {
  return (
    <>
      <EntityChipsScope text={text} enabled={enabled} exclude={['Quán Bar Một']}>
        {chips => <ArticleAnswer text={text} images={[]} format={formatMessage} onClick={chipClick(chips, () => {})} onKeyDown={chipKeyDown(chips)}
          presentation={{ variant: 'editorial', decorate: chips.decorate }} />}
      </EntityChipsScope>
      <V206DrawerHost />
    </>
  )
}

describe('entity chips', () => {
  it('a resolved name becomes a chip with an icon; an unresolved one and a place-card name stay plain bold', async () => {
    const { container } = render(<Harness />)
    await waitFor(() => expect(container.querySelectorAll('.v206-ent')).toHaveLength(1))
    const chip = container.querySelector('.v206-ent')!
    expect(chip.textContent).toBe('👤Elon Musk')
    expect(chip.getAttribute('role')).toBe('button')
    const plain = Array.from(container.querySelectorAll('strong:not(.v206-ent)')).map(s => s.textContent)
    expect(plain).toEqual(['Sam Altman', 'Quán Bar Một'])
    // ONE batched request, for the candidates only (the place card's name is not asked)
    // the lookup, then the sense check of what it found
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/sense')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('t=Elon%20Musk')
    expect(url).toContain('t=Sam%20Altman')
    expect(url).not.toContain('Qu%C3%A1n')
  })

  it('18/11: a profile found by name that is NOT about what the answer talks about (a company, not the commune of that name) is no chip; a failed check is no chip either', async () => {
    sense = n => Array.from({ length: n }, () => false)
    const a = render(<Harness />)
    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/sense'))).toBe(true))
    await new Promise(r => setTimeout(r, 30))
    expect(a.container.querySelectorAll('.v206-ent')).toHaveLength(0)
    cleanup(); __clearEntityProfileCache()
    fetchMock.mockImplementation(async (url: string) => String(url).includes('/sense') ? new Response('x', { status: 500 }) : new Response(JSON.stringify({ profiles: [musk] }), { status: 200 }))
    const b = render(<Harness />)
    await new Promise(r => setTimeout(r, 30))
    expect(b.container.querySelectorAll('.v206-ent')).toHaveLength(0)
  })

  it('asks nothing while the answer is still arriving (enabled false) and draws no chip', async () => {
    const { container } = render(<Harness enabled={false} />)
    await new Promise(r => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.v206-ent')).toHaveLength(0)
  })

  it('a server failure leaves every name as plain bold', async () => {
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }))
    const { container } = render(<Harness />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(container.querySelectorAll('.v206-ent')).toHaveLength(0)
    expect(container.querySelectorAll('strong')).toHaveLength(3)
  })

  it('a click opens the right-hand drawer with the real profile and the source; no verification claim', async () => {
    const { container } = render(<Harness />)
    await waitFor(() => expect(container.querySelector('.v206-ent')).toBeTruthy())
    fireEvent.click(container.querySelector('.v206-ent')!)
    const drawer = await screen.findByTestId('v206-wiki-drawer')
    expect(drawer.textContent).toContain('Elon Musk')
    expect(drawer.textContent).toContain('Doanh nhân')
    expect(screen.getByTestId('v206-wiki-extract').textContent).toBe(musk.extract)
    expect(screen.getByTestId('v206-wiki-link').getAttribute('href')).toBe(musk.href)
    expect(screen.getByTestId('v206-wiki-link').getAttribute('rel')).toContain('noopener')
    expect(drawer.textContent).toContain('Nguồn: Wikipedia')
    expect(drawer.textContent).not.toMatch(/verified|Evidence|đối soát|Gate|xác minh/i)
    expect(drawer.querySelector('img')?.getAttribute('src')).toBe(musk.image)
    // Esc closes it
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('v206-wiki-drawer')).toBeNull())
  })

  it('Enter on a focused chip opens the same drawer', async () => {
    const { container } = render(<Harness />)
    await waitFor(() => expect(container.querySelector('.v206-ent')).toBeTruthy())
    fireEvent.keyDown(container.querySelector('.v206-ent')!, { key: 'Enter' })
    expect(await screen.findByTestId('v206-wiki-drawer')).toBeTruthy()
  })

  it('a click anywhere else is the usual click (no drawer)', async () => {
    const { container } = render(<Harness />)
    await waitFor(() => expect(container.querySelector('.v206-ent')).toBeTruthy())
    fireEvent.click(container.querySelectorAll('strong:not(.v206-ent)')[0])
    expect(screen.queryByTestId('v206-wiki-drawer')).toBeNull()
  })
})
