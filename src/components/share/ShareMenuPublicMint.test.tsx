// @vitest-environment jsdom
//
// Owner/coordinator rule 2026-10-02: opening the share menu must NOT publish anything. The public
// /r/<slug> page is created only when the user picks a channel / copy (the click is the consent),
// exactly once per turn, and a failure or guest falls back to the brand link.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { PlacesLiveView } from '@/lib/recommendation/liveView'
import fixture from '@/lib/share/__fixtures__/placesLiveView.food.json'
import { buildPlacesArtifact } from '@/lib/share/shareArtifact'
import ShareMenu from './ShareMenu'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const view = fixture as unknown as PlacesLiveView
const artifact = buildPlacesArtifact(view, 'Quán bún bò', 'vi', env)
const SLUG_URL = 'https://www.tappyai.com/r/abcDEF1234'

let open: ReturnType<typeof vi.fn>
let writeText: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>
let n = 0
const source = () => ({ conversationId: `conv-${++n}`, messageIndex: 3 })

beforeEach(() => {
  open = vi.fn(() => ({}) as Window)
  writeText = vi.fn(async () => undefined)
  fetchMock = vi.fn()
  vi.stubGlobal('open', open)
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const published = () => ({ ok: true, status: 201, json: async () => ({ url: SLUG_URL, title: 'Quán bún bò', description: 'Ba quán đáng thử.' }) })
const sharedResultCalls = () => fetchMock.mock.calls.filter(c => String(c[0]) === '/api/shared-results')

describe('public page is created on the click, not on open', () => {
  it('opening the menu makes NO call to /api/shared-results', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} publicSource={source()} />)
    await new Promise(r => setTimeout(r, 50))
    expect(sharedResultCalls()).toHaveLength(0)
  })

  it('a channel click creates exactly one page and sends the short link; a second click reuses it', async () => {
    fetchMock.mockResolvedValue(published())
    render(<ShareMenu artifact={artifact} open onClose={() => {}} publicSource={source()} />)
    fireEvent.click(screen.getByTestId('share-target-whatsapp'))
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    expect(sharedResultCalls()).toHaveLength(1)
    const sent = decodeURIComponent(String(open.mock.calls[0][0]))
    expect(sent.endsWith(SLUG_URL)).toBe(true)
    expect(sent.split(String.fromCharCode(10)).length).toBeLessThanOrEqual(3)
    fireEvent.click(screen.getByTestId('share-target-line'))
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    expect(sharedResultCalls()).toHaveLength(1)
    expect(decodeURIComponent(String(open.mock.calls[1][0]))).toContain(SLUG_URL)
  })

  it('copy sends the three-line message with the short link', async () => {
    fetchMock.mockResolvedValue(published())
    render(<ShareMenu artifact={artifact} open onClose={() => {}} publicSource={source()} />)
    fireEvent.click(screen.getByTestId('share-target-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(String(writeText.mock.calls[0][0]).endsWith(SLUG_URL)).toBe(true)
    expect(sharedResultCalls()).toHaveLength(1)
  })

  it('a guest / failure falls back to the brand link, no tracking links, still exactly one attempt', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} publicSource={source()} />)
    fireEvent.click(screen.getByTestId('share-target-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const text = String(writeText.mock.calls[0][0])
    expect(text.endsWith('https://www.tappyai.com')).toBe(true)
    expect(text).not.toMatch(/go\/at|isclix|maps\.google/)
    expect(sharedResultCalls()).toHaveLength(1)
  })

  it('the Tappy Inbox and Save never publish anything', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} publicSource={source()} />)
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    await new Promise(r => setTimeout(r, 50))
    expect(sharedResultCalls()).toHaveLength(0)
  })
})
