// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

import HomeV3 from './HomeV3'

// ─────────────────────────────────────────────────────────────────────────────
// Home's AI suggestions are ACTIONS, not links to a page with the text in it.
//
// The whole chain — chip/card/composer → `/chat?q=…` → `initialMessage` →
// automatic submit — was reported broken during UAT and turned out to be a
// corrupted dev bundle rather than a code defect (the chat route's JS chunk was
// 404ing, so nothing hydrated and no control did anything). The behaviour was
// then verified in a browser end to end.
//
// What is pinned here is the CONTRACT that made that verification possible, and
// that a refactor could quietly break without any test noticing: the handoff
// carries the prompt, and the receiving side SENDS it rather than merely
// showing it. `ChatInterface` itself is exercised in a browser, not in jsdom —
// it streams from the model — so its half is asserted on the source.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => { cleanup(); push.mockClear() })

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('Home → Chat handoff carries the prompt', () => {
  it('a prompt chip navigates to /chat with the question as ?q=', () => {
    const { container } = render(<HomeV3 user={false} userInfo={undefined} firstName="Huy" suggestions={[]} conversations={[]} hero={{ hour: 10, isWeekend: false, dayOfMonth: 1 }} />)
    const chip = [...container.querySelectorAll('button.v3-chip')][0] as HTMLButtonElement
    expect(chip, 'Home renders prompt chips').toBeTruthy()

    fireEvent.click(chip)

    expect(push).toHaveBeenCalledTimes(1)
    const target = push.mock.calls[0][0] as string
    expect(target.startsWith('/chat?q=')).toBe(true)
    // The chip's own words are what gets asked — not a category, not a bare route.
    expect(decodeURIComponent(target.slice('/chat?q='.length))).toBe(chip.textContent?.trim())
  })

  it('the composer sends what the user typed, and refuses to send nothing', () => {
    const { container } = render(<HomeV3 user={false} userInfo={undefined} firstName="Huy" suggestions={[]} conversations={[]} hero={{ hour: 10, isWeekend: false, dayOfMonth: 1 }} />)
    const form = container.querySelector('form') as HTMLFormElement
    const input = form.querySelector('input') as HTMLInputElement

    fireEvent.submit(form)
    expect(push, 'an empty composer must not open a chat').not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'Quán cafe view đẹp ở Hà Nội' } })
    fireEvent.submit(form)
    expect(push).toHaveBeenCalledWith('/chat?q=' + encodeURIComponent('Quán cafe view đẹp ở Hà Nội'))
  })

  it('every suggestion card links into chat with its own prompt', () => {
    const suggestions = [
      { text: 'Ăn gì ngon hôm nay gần đây?', category: 'food' },
      { text: 'Cuối tuần đi đâu chơi gần thành phố?', category: 'travel' },
    ]
    const { container } = render(
      <HomeV3
        user={false}
        userInfo={undefined}
        firstName="Huy"
        suggestions={suggestions as never}
        conversations={[]}
        hero={{ hour: 10, isWeekend: false, dayOfMonth: 1 }}
      />
    )
    const cards = [...container.querySelectorAll('[data-suggested-card]')]
    expect(cards.length).toBe(suggestions.length)
    cards.forEach((card, i) => {
      const href = card.getAttribute('href') ?? ''
      expect(href.startsWith('/chat?q=')).toBe(true)
      expect(decodeURIComponent(href)).toContain(suggestions[i].text)
    })
  })
})

describe('the receiving side submits the prompt instead of parking it', () => {
  const chatPage = stripComments(read('src/app/(app)/chat/page.tsx'))
  const chatInterface = stripComments(read('src/components/ChatInterface.tsx'))

  it('the chat route reads ?q= and hands it to ChatInterface as the initial message', () => {
    expect(chatPage).toMatch(/searchParams\.get\('q'\)/)
    expect(chatPage).toMatch(/initialMessage=\{query\}/)
  })

  it('🚨 ChatInterface SUBMITS the initial message — it does not just prefill the box', () => {
    // The whole point of an AI suggestion: the user must not have to press Send.
    expect(chatInterface).toMatch(/setInput\(initialMessage\)/)
    expect(chatInterface).toMatch(/requestSubmit\(\)/)
  })

  it('does not auto-send on top of a restored transcript, which would duplicate the turn', () => {
    expect(chatInterface).toMatch(/tappy_pending_chat/)
    expect(chatInterface).toMatch(/initialMessage && messages\.length === 0/)
  })

  it('Enter sends exactly once, and Shift+Enter still writes a newline', () => {
    expect(chatInterface).toMatch(/e\.key === 'Enter' && !e\.shiftKey/)
    // Guarded against a second submit while a reply is still streaming.
    expect(chatInterface).toMatch(/\(input\.trim\(\) \|\| imageFile\) && !isLoading/)
  })

  it('a completed turn is saved and becomes its own reloadable conversation', () => {
    // send → stream → save → /chat/[id]: the persistence chain, in the route that owns it.
    // `apiFetch` since main #251: the ONE fetch wrapper that turns an age refusal into the
    // /age-check redirect. Same call, same endpoint — only the wrapper name changed.
    expect(chatPage).toMatch(/apiFetch\('\/api\/conversations'/)
    expect(chatPage).toMatch(/router\.replace\(`\/chat\/\$\{conv\.id\}`\)/)
  })
})

describe('/chat/[id] fails gracefully, never with an unexplained 500', () => {
  const page = stripComments(read('src/app/(app)/chat/[id]/page.tsx'))

  it('sends a signed-out visitor to login with a return path', () => {
    expect(page).toMatch(/if \(!user\) redirect\(`\/login\?returnTo=\/chat\/\$\{params\.id\}`\)/)
  })

  it('🚨 answers an unknown or foreign conversation id with notFound(), not an error', () => {
    // An id that is not this user's must be indistinguishable from one that does
    // not exist — the same not-found page, never a stack trace and never someone
    // else's transcript.
    expect(page).toMatch(/\.eq\('user_id', user\.id\)/)
    expect(page).toMatch(/if \(!conversation\) notFound\(\)/)
  })
})
