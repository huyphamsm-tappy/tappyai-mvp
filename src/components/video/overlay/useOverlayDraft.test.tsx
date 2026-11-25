// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { useOverlayDraft } from './useOverlayDraft'
import { defaultTextLayer, emptyOverlay, type OverlayDoc } from '@/lib/media/video/overlay/schema'

afterEach(cleanup)
const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const withText = (text: string): OverlayDoc => ({ schema_version: 1, layers: [{ ...defaultTextLayer('a', 6000), text }] })

describe('useOverlayDraft', () => {
  it('loads the saved draft (version and document) from the overlay route', async () => {
    const f = vi.fn(async () => json({ version: 3, doc: withText('đã lưu') }))
    const { result } = renderHook(() => useOverlayDraft(ID, { fetchImpl: f as never }))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.version).toBe(3)
    expect(result.current.doc.layers[0].text).toBe('đã lưu')
    expect(result.current.dirty).toBe(false)
    expect((f.mock.calls[0] as unknown[])[0]).toBe(`/api/video/uploads/${ID}/overlay`)
  })

  it('a failed or malformed load is reported, never half-applied', async () => {
    const bad = vi.fn(async () => json({ error: 'x' }, 500))
    const a = renderHook(() => useOverlayDraft(ID, { fetchImpl: bad as never }))
    await waitFor(() => expect(a.result.current.status).toBe('load_failed'))
    const junk = vi.fn(async () => json({ version: 1, doc: { schema_version: 9, layers: [] } }))
    const b = renderHook(() => useOverlayDraft(ID, { fetchImpl: junk as never }))
    await waitFor(() => expect(b.result.current.status).toBe('load_failed'))
    expect(b.result.current.doc).toEqual(emptyOverlay())
  })

  it('save sends the loaded version with the document, then adopts the new version and clears dirty', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PUT' ? json({ version: 4 }) : json({ version: 3, doc: emptyOverlay() }))
    const { result } = renderHook(() => useOverlayDraft(ID, { fetchImpl: f as never, durationMs: 6000 }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setDoc(withText('mới')))
    expect(result.current.dirty).toBe(true)
    let ok = false
    await act(async () => { ok = await result.current.save() })
    expect(ok).toBe(true)
    const put = f.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PUT') as [string, RequestInit]
    expect(JSON.parse(put[1].body as string)).toEqual({ version: 3, doc: withText('mới') })
    expect(result.current.version).toBe(4)
    expect(result.current.status).toBe('saved')
    expect(result.current.dirty).toBe(false)
  })

  it('a version conflict is its own state and keeps the local edits (the user decides: reload)', async () => {
    let conflict = true
    const f = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PUT' ? (conflict ? json({ error: 'version_conflict', version: 9 }, 409) : json({ version: 10 })) : json({ version: conflict ? 3 : 9, doc: conflict ? emptyOverlay() : withText('của nơi khác') }))
    const { result } = renderHook(() => useOverlayDraft(ID, { fetchImpl: f as never }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setDoc(withText('của tôi')))
    await act(async () => { await result.current.save() })
    expect(result.current.status).toBe('conflict')
    expect(result.current.doc.layers[0].text).toBe('của tôi')
    conflict = false
    await act(async () => { await result.current.reload() })
    expect(result.current.doc.layers[0].text).toBe('của nơi khác')
    expect(result.current.version).toBe(9)
    expect(result.current.dirty).toBe(false)
  })

  it('refuses locally, with no request, a document the server would refuse (a layer ending after the clip)', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PUT' ? json({ version: 1 }) : json({ version: 0, doc: emptyOverlay() }))
    const { result } = renderHook(() => useOverlayDraft(ID, { fetchImpl: f as never, durationMs: 1000 }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setDoc({ schema_version: 1, layers: [{ ...defaultTextLayer('a'), end_ms: 5000 }] }))
    let ok = true
    await act(async () => { ok = await result.current.save() })
    expect(ok).toBe(false)
    expect(result.current.status).toBe('invalid')
    expect(f.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')).toHaveLength(0)
  })

  it('a server or network failure on save is `save_failed` and the draft stays dirty; unsupported characters are surfaced', async () => {
    let fail = true
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'PUT') return json({ version: 0, doc: emptyOverlay() })
      if (fail) throw new Error('offline')
      return json({ version: 1, warnings: { unsupported_chars: ['日'] } })
    })
    const { result } = renderHook(() => useOverlayDraft(ID, { fetchImpl: f as never }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setDoc(withText('x')))
    await act(async () => { await result.current.save() })
    expect(result.current.status).toBe('save_failed')
    expect(result.current.dirty).toBe(true)
    fail = false
    await act(async () => { await result.current.save() })
    expect(result.current.status).toBe('saved')
    expect(result.current.unsupportedChars).toEqual(['日'])
  })

  it('without an asset id it does nothing', async () => {
    const f = vi.fn()
    const { result } = renderHook(() => useOverlayDraft(null, { fetchImpl: f as never }))
    let ok = true
    await act(async () => { ok = await result.current.save() })
    expect(ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
