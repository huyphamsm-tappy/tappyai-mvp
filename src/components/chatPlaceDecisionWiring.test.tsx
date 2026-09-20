// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLACES_ANNOTATION_KIND, type PlacesLiveView } from '@/lib/recommendation/liveView'

// ─────────────────────────────────────────────────────────────────────────────
// The place decision reaches the chat through ANNOTATIONS, not through text.
//
// That choice is what makes it shippable at all: `[TAPPY_PLACES]` is gated off
// because a marker in the message text has to be stripped by Android and iOS
// (which have never been told about it) and because a marker is permanent
// storage, which Google Places terms forbid for Places content.
//
// So these tests pin the two properties that keep it safe — the payload never
// enters the message body, and the card renders once, after the reply is
// complete — plus the hierarchy the redesign is for.
// ─────────────────────────────────────────────────────────────────────────────

// jsdom has neither of these and ChatInterface uses both on mount.
Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; annotations?: unknown[] }> = []
let loading = false

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('ai/react', () => ({
  useChat: () => ({
    messages,
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: loading,
    setInput: vi.fn(),
    append: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    error: undefined,
    setMessages: vi.fn(),
  }),
}))

import ChatInterface from './ChatInterface'

const view: PlacesLiveView = {
  kind: PLACES_ANNOTATION_KIND,
  v: 1,
  domain: 'food',
  items: [
    {
      id: 'place:google:1',
      domain: 'food',
      kind: 'place',
      name: 'Cà Phê AnAn',
      rating: 4.8,
      ratingCount: 320,
      address: '12 Lý Quốc Sư',
      openingHours: '08:00–22:30',
      rank: 0,
      recommended: true,
      actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://maps.google.com/?q=AnAn', labelKey: 'v3.action.maps' }],
    },
    {
      id: 'p2',
      domain: 'food',
      kind: 'place',
      name: 'Cosa Nostra',
      rating: 4.6,
      rank: 1,
      shortlistPosition: 2,
      actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://maps.google.com/?q=Cosa', labelKey: 'v3.action.maps' }],
    },
  ],
}

function seed(content: string, annotations?: unknown[], isLoading = false) {
  messages.length = 0
  messages.push({ id: 'u1', role: 'user', content: 'cafe with a view' })
  messages.push({ id: 'a1', role: 'assistant', content, annotations })
  loading = isLoading
}

afterEach(cleanup)

describe('ChatInterface — the place decision card', () => {
  it('renders one card from the message annotation', () => {
    seed('Mình nghiêng về **Cà Phê AnAn** vì không gian hợp để ngồi lâu.', [view])
    render(<ChatInterface />)
    expect(screen.getAllByTestId('place-decision')).toHaveLength(1)
    expect(screen.getAllByTestId('place-card')).toHaveLength(2)
    expect(screen.getAllByTestId('place-card')[1].textContent).toContain('Cosa Nostra')
  })

  it('A1(a): while the reply is still streaming, a frame the SERVER sent for this turn renders — the preliminary set, marked as such, then the decision', () => {
    // The stream carries the engine's set the moment the rows land (`preliminary`) and the
    // decision after the prose; the reader takes the last, so nothing flashes or shows twice.
    seed('', [{ ...view, ranked: false, picked: undefined, preliminary: true }], true)
    render(<ChatInterface />)
    expect(screen.getByTestId('place-decision').getAttribute('data-preliminary')).toBe('true')
    cleanup()
    seed('I lean towards **Ca Phe AnAn**.', [{ ...view, ranked: false, picked: undefined, preliminary: true }, view], true)
    render(<ChatInterface />)
    expect(screen.getAllByTestId('place-decision')).toHaveLength(1)
    expect(screen.getByTestId('place-decision').getAttribute('data-preliminary')).toBeNull()
  })

  it('🚨 nothing from the recall cache renders mid-stream: a streaming message with no frame has no card', () => {
    seed('I lean towards **Ca Phe AnAn**.', [view], false)
    render(<ChatInterface />) // remembers the decision under this content
    cleanup()
    seed('I lean towards **Ca Phe AnAn**.', undefined, true)
    render(<ChatInterface />)
    expect(screen.queryByTestId('place-decision')).toBeNull()
  })

  it('renders no card when the turn produced no decision', () => {
    seed('Mình chưa tìm được quán nào khớp yêu cầu này.', undefined)
    render(<ChatInterface />)
    expect(screen.queryByTestId('place-decision')).toBeNull()
  })

  it('🚨 keeps the payload out of the message body — nothing leaks as text', () => {
    seed('Mình nghiêng về **Cà Phê AnAn**.', [view])
    const { container } = render(<ChatInterface />)
    const body = container.querySelector('.message-content')!.textContent ?? ''
    expect(body).not.toContain(PLACES_ANNOTATION_KIND)
    expect(body).not.toContain('TAPPY_PLACES')
    expect(body).not.toContain('{')
  })
})

describe('the delivery channel stays the safe one', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('🚨 the durable marker stays OFF — its two blockers are unchanged', () => {
    // Enabling it needs Android + iOS shipping a stripper in the same change,
    // and a provider whose terms permit storing the content. Neither happened
    // here, so this task used a channel that needs neither.
    expect(read('src/lib/config/product.ts')).toMatch(/export const EMIT_TAPPY_PLACES = false/)
  })

  it('the card is fed by annotations, never by the persisted text', () => {
    const chat = read('src/components/ChatInterface.tsx')
    expect(chat).toMatch(/readPlacesLiveView\(msg\.annotations/)
    const stream = read('src/lib/ai/streamEnrichment.ts')
    // `8:` is the AI-SDK message-annotation frame; Android reads only `0:` and
    // iOS maps any other prefix to `.unknown`, so neither can be broken by it.
    expect(stream).toMatch(/'8:' \+ JSON\.stringify\(\[placesView\]\)/)
  })

  it('🚨 the card OWNS the photo and the links — the text does not repeat them', () => {
    // The duplication bug: the reply carried an injected photo, a row of order
    // links and the TikTok line, and then the card rendered the same three
    // things again. On a request that renders the card the injection is skipped;
    // a client with no card still gets it, because there it is the only channel.
    const stream = read('src/lib/ai/streamEnrichment.ts')
    expect(stream).toMatch(/const decisionCardRenders = !!placesView \|\| !!collector\?\.shoppingMarker/)
    expect(stream).toMatch(/const cardOwnsEnrichment = decisionCardRenders && collector\?\.rendersDecisionCard === true/)
    // G3: the injector takes a placement option (MEDIA_PLACEMENT_V2); the card-owns gate is unchanged.
    expect(stream).toMatch(/cardOwnsEnrichment \? mainText : injectPlaceEnrichment\(places, mainText, lang, \{ placement: mediaPlacementV2Enabled\(\) \? 'v2' : 'v1' \}\)/)
    // The batch TikTok line obeys the same rule.
    expect(stream).toMatch(/const batchTikTok = cardOwnsEnrichment \? undefined :/)
  })

  it('only the card-capable surfaces are told to stop repeating the card facts', () => {
    // The prompt is shared with clients that have no card; telling them the same
    // thing would delete the rating and the address from their only channel.
    // Which surfaces are card-capable is decided in ONE place (decisionSurface.ts:
    // web + android); the route reads the header through it and nowhere else.
    const route = read('src/app/api/chat/route.ts')
    expect(route).toMatch(/const rendersDecisionCard = rendersDecisionCardFor\(surfaceHeader\)/)
    expect(route).not.toMatch(/x-tappy-surface'\) === 'web'/)
    expect(route).toMatch(/rendersDecisionCard \? buildRenderedDecisionBlock\(\) : ''/)
  })
})

describe('the card survives the save-and-navigate hand-off', () => {
  it('🚨 still renders after the turn is saved and the annotation is gone', async () => {
    // What actually happens on localhost: the reply completes, `onSave` creates
    // the conversation, `router.replace('/chat/<id>')` remounts ChatInterface
    // from `savedMessages` — `{role, content}` only — and the annotation is not
    // part of a saved message. Before the in-memory hand-off the card vanished
    // about a second after appearing.
    const { rememberPlacesView, recallPlacesView, __resetPlacesViewCache } =
      await import('@/lib/recommendation/liveViewCache')
    __resetPlacesViewCache()

    const content = 'Mình nghiêng về **Cà Phê AnAn** vì không gian hợp để ngồi lâu.'
    // Turn 1: the annotation arrives and the card renders.
    seed(content, [view])
    render(<ChatInterface />)
    expect(screen.getAllByTestId('place-decision')).toHaveLength(1)
    expect(recallPlacesView(content)).not.toBeNull()
    cleanup()

    // Turn 2: the same message, restored from the database with NO annotation.
    seed(content, undefined)
    render(<ChatInterface />)
    expect(screen.getAllByTestId('place-decision')).toHaveLength(1)

    // And it is memory only — nothing was written anywhere a reload could read.
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.getItem('tappy_places_view')).toBeNull()

    // A message the session never saw still renders no card.
    cleanup()
    __resetPlacesViewCache()
    seed(content, undefined)
    render(<ChatInterface />)
    expect(screen.queryByTestId('place-decision')).toBeNull()
    rememberPlacesView(content, view) // restore for any later test in this file
  })
})

describe('one canonical Food presentation — nothing appears twice', () => {
  it('🚨 drops a model CTA the card already offers, and keeps a different one', () => {
    const mapsUrl = 'https://maps.google.com/?q=AnAn'
    const cta = `[CTA_BUTTONS]${JSON.stringify({
      buttons: [
        { label: 'Xem trên Maps', type: 'maps', url: mapsUrl, primary: true },
        { label: 'Gọi quán', type: 'call', url: 'tel:+842839307627', primary: false },
      ],
    })}[/CTA_BUTTONS]`
    seed(`Mình nghiêng về **Cà Phê AnAn**.\n\n${cta}`, [view])
    render(<ChatInterface />)
    const hrefs = [...document.querySelectorAll('a')].map(a => a.getAttribute('href'))
    // The card owns the Maps link, so the model's copy of it is not rendered again.
    expect(hrefs.filter(h => h === mapsUrl)).toHaveLength(1)
    // An action the card does NOT offer still reaches the user.
    expect(hrefs).toContain('tel:+842839307627')
  })

  it('🚨 renders the decision exactly once even when the message repeats', () => {
    seed('Mình nghiêng về **Cà Phê AnAn**.', [view])
    render(<ChatInterface />)
    expect(screen.getAllByTestId('place-decision')).toHaveLength(1)
    expect(screen.getAllByTestId('place-card')).toHaveLength(2)
  })
})
