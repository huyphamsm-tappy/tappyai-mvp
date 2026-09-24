// @vitest-environment jsdom
//
// /profile/edit — the one edit form, now with the cover.
//
// The cover section is offered ONLY when GET /api/profile carries a `cover_url` key (the
// column exists); it uploads through the same shared path the Explore profile uses
// (`@/lib/profile/cover` → POST /api/profile `cover`), replaces, removes (PATCH
// `cover_url: null`), rejects an invalid file on the device, and invalidates the router
// cache so the hub re-reads the row — exactly as the avatar path does.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile/edit',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/Header', () => ({ default: () => null }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))

const COVER = 'https://storage.googleapis.com/b/covers/u1-old.jpg'
const calls: { method: string; body?: any }[] = []
const stub = (profile: Record<string, unknown>, post = { status: 200, body: { cover_url: 'https://storage.googleapis.com/b/covers/u1-new.jpg' } as Record<string, unknown> }) => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ method, body: init?.body })
    if (method === 'GET') return { ok: true, json: async () => profile } as Response
    if (method === 'PATCH') return { ok: true, json: async () => ({ ok: true }) } as Response
    if (method === 'POST') return { ok: post.status < 400, status: post.status, json: async () => post.body } as Response
    return { ok: false, json: async () => ({}) } as Response
  }))
}

beforeEach(() => { refresh.mockClear(); push.mockClear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const load = async () => {
  const { default: EditProfilePage } = await import('./page')
  render(<EditProfilePage />)
  await screen.findByDisplayValue('Huy Pham')
}
const section = () => document.querySelector('[data-edit-cover]')
const input = () => document.querySelector('[data-edit-cover-input]') as HTMLInputElement

describe('cover on the edit form', () => {
  it('is not offered before the column exists (no cover_url key) — nothing could store it', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '' })
    await load()
    expect(section()).toBeNull()
  })

  it('shows the current cover with change + remove; none → change only', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '', cover_url: COVER })
    await load()
    expect((document.querySelector('[data-edit-cover-img]') as HTMLImageElement).getAttribute('src')).toBe(COVER)
    expect(document.querySelector('[data-edit-cover-change]')).toBeTruthy()
    expect(document.querySelector('[data-edit-cover-remove]')).toBeTruthy()
    cleanup()
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '', cover_url: null })
    await load()
    expect(document.querySelector('[data-edit-cover-img]')).toBeNull()
    expect(document.querySelector('[data-edit-cover-change]')).toBeTruthy()
    expect(document.querySelector('[data-edit-cover-remove]')).toBeNull()
  })

  it('uploads as `cover` through POST /api/profile, replaces the image and refreshes the router cache', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '', cover_url: COVER })
    await load()
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'c.jpg', { type: 'image/jpeg' })
    fireEvent.change(input(), { target: { files: [file] } })
    await waitFor(() => expect((document.querySelector('[data-edit-cover-img]') as HTMLImageElement).getAttribute('src')).toContain('u1-new.jpg'))
    const post = calls.find(c => c.method === 'POST')!
    expect((post.body as FormData).get('cover')).toBe(file)
    expect((post.body as FormData).get('avatar')).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it('removes through PATCH {cover_url: null} and refreshes', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '', cover_url: COVER })
    await load()
    fireEvent.click(document.querySelector('[data-edit-cover-remove]')!)
    await waitFor(() => expect(document.querySelector('[data-edit-cover-img]')).toBeNull())
    expect(JSON.parse(calls.find(c => c.method === 'PATCH')!.body)).toEqual({ cover_url: null })
    expect(refresh).toHaveBeenCalled()
  })

  it('rejects a non-image or an oversized file on the device — no request leaves', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '', cover_url: null })
    await load()
    fireEvent.change(input(), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    await screen.findByText(/Chỉ chấp nhận file ảnh|Only image files/)
    fireEvent.change(input(), { target: { files: [new File([new Uint8Array(6 * 1024 * 1024)], 'b.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText(/Ảnh bìa tối đa 5MB|Cover photos are limited to 5MB/)
    expect(calls.some(c => c.method === 'POST')).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows the server\'s rejection and keeps the previous state', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: '', cover_url: COVER }, { status: 400, body: { error: 'bad_image_type', message: 'Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF' } })
    await load()
    fireEvent.change(input(), { target: { files: [new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText(/JPG, PNG, WebP/)
    expect((document.querySelector('[data-edit-cover-img]') as HTMLImageElement).getAttribute('src')).toBe(COVER)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('the name/bio save is untouched — PATCH still carries full_name and bio', async () => {
    stub({ full_name: 'Huy Pham', avatar_url: '', email: 'a@b', bio: 'x', cover_url: null })
    await load()
    fireEvent.click(screen.getByRole('button', { name: /Lưu|Save/i }))
    await waitFor(() => expect(calls.some(c => c.method === 'PATCH')).toBe(true))
    expect(JSON.parse(calls.find(c => c.method === 'PATCH')!.body)).toEqual({ full_name: 'Huy Pham', bio: 'x' })
  })
})
