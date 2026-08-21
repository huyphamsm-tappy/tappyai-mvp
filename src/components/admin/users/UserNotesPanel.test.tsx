// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserNotesPanel } from './UserNotesPanel'
import { en as enStrings } from '@/lib/i18n/admin'

// Module 08 — the internal notes panel.
//
// CONTRACT — 10_User_Management.md §3.8: "Chronological internal notes from
// user_notes. Pinned notes shown at top. Add new note inline." §3.9 gives
// adding to `moderator`; `12_RBAC.md` §3 states that authority once, so both
// permissions carry the same roles.
//
// The API is the enforcement; every `can` flag here is UX.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }))
afterEach(cleanup)

const T = enStrings
const USER_ID = 'uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu'
const ALL = { read: true, write: true }
const READ_ONLY = { read: true, write: false }

const note = (over = {}) => ({
  id: 'n-1', user_id: USER_ID, author_id: 'a-1',
  note: 'called support, verified identity',
  is_pinned: false, created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z',
  ...over,
})

function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url, method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const { status = 200, body } = handler(url, init)
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  }))
  return calls
}

beforeEach(() => vi.unstubAllGlobals())

describe('the read permission gates the panel itself', () => {
  it('🔑 renders NOTHING without users.notes.read — and issues no request', async () => {
    // Mutation N30 lived here: nothing exercised the panel at all, so deleting
    // the guard that stops the fetch changed nothing any test could see. An
    // actor who may not read notes must not cause them to be read.
    const calls = stubFetch(() => ({ body: { data: [note()] } }))
    const { container } = render(
      <UserNotesPanel userId={USER_ID} can={{ read: false, write: true }} />
    )
    expect(container.innerHTML).toBe('')
    expect(calls).toHaveLength(0)
  })

  it('reads one subject at a time, addressed by id', async () => {
    const calls = stubFetch(() => ({ body: { data: [note()] } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toContain(USER_ID)
  })
})

describe('§3.8 — the server owns the order, the panel renders it', () => {
  it('renders the notes in the order received, without re-sorting', async () => {
    // Two implementations of "pinned first, then newest" is how the API and the
    // screen start disagreeing. The server already ordered these.
    stubFetch(() => ({
      body: { data: [note({ id: 'a', note: 'first as sent' }), note({ id: 'b', note: 'second as sent' })] },
    }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    const list = await screen.findByRole('list', { name: T['admin.notes.title'] })
    const items = within(list).getAllByRole('listitem')
    expect(items[0].textContent).toContain('first as sent')
    expect(items[1].textContent).toContain('second as sent')
  })

  it('a pinned note is labelled', async () => {
    stubFetch(() => ({ body: { data: [note({ is_pinned: true })] } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.notes.pinned'])).toBeDefined()
  })

  it('🔑 note text is rendered as TEXT, never as markup', async () => {
    stubFetch(() => ({ body: { data: [note({ note: '<img src=x onerror=alert(1)>' })] } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    const list = await screen.findByRole('list', { name: T['admin.notes.title'] })
    expect(within(list).getByText('<img src=x onerror=alert(1)>')).toBeDefined()
    expect(list.querySelector('img')).toBeNull()
  })
})

describe('a failed read is not an empty one', () => {
  it('an empty list says so', async () => {
    stubFetch(() => ({ body: { data: [] } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.notes.empty'])).toBeDefined()
  })

  it('🔑 a 500 renders the ERROR state, never "no notes"', async () => {
    stubFetch(() => ({ status: 500, body: { error: { message: 'Operation failed' } } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.notes.error'])).toBeDefined()
    expect(screen.queryByText(T['admin.notes.empty'])).toBeNull()
  })

  it('a network failure is the error state too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.notes.error'])).toBeDefined()
  })

  it('🔑 a 200 whose payload is not a list is an ERROR, not an empty list', async () => {
    // Found by a test that stubbed the wrong shape and crashed the panel:
    // `notes.map` on a non-array takes the whole user detail down with it.
    stubFetch(() => ({ body: { data: note() } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.notes.error'])).toBeDefined()
    expect(screen.queryByText(T['admin.notes.empty'])).toBeNull()
  })
})

describe('adding a note', () => {
  it('offers no form without users.notes.write', async () => {
    stubFetch(() => ({ body: { data: [note()] } }))
    render(<UserNotesPanel userId={USER_ID} can={READ_ONLY} />)
    await screen.findByRole('list', { name: T['admin.notes.title'] })
    expect(screen.queryByRole('button', { name: T['admin.notes.add'] })).toBeNull()
  })

  it('🔑 cannot submit an empty or whitespace-only note', async () => {
    const calls = stubFetch(() => ({ body: { data: [note()] } }))
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    const save = await screen.findByRole('button', { name: T['admin.notes.add'] })
    expect(save.hasAttribute('disabled')).toBe(true)
    await userEvent.type(screen.getByRole('textbox', { name: T['admin.notes.addLabel'] }), '   ')
    expect(save.hasAttribute('disabled')).toBe(true)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('🔑 sends only note and isPinned — never an author', async () => {
    // The server takes the author from the session. A body that carried one
    // would be rejected by `.strict()`; not sending one is the other half.
    // GET returns a LIST, POST returns one row. Answering both with the same
    // shape is what first made this test fail — and it found a real weakness:
    // the panel used to call `.map` on whatever arrived.
    const calls = stubFetch((_u, init) =>
      init?.method === 'POST' ? { body: { data: note() } } : { body: { data: [] } }
    )
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    await userEvent.type(
      await screen.findByRole('textbox', { name: T['admin.notes.addLabel'] }),
      '  verified by phone  '
    )
    await userEvent.click(screen.getByRole('button', { name: T['admin.notes.add'] }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({ note: 'verified by phone', isPinned: false })
  })

  it('a failed save says so and does not clear the draft', async () => {
    stubFetch((_u, init) =>
      init?.method === 'POST'
        ? { status: 500, body: { error: { message: 'Operation failed' } } }
        : { body: { data: [] } }
    )
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    const box = await screen.findByRole('textbox', { name: T['admin.notes.addLabel'] })
    await userEvent.type(box, 'keep me')
    await userEvent.click(screen.getByRole('button', { name: T['admin.notes.add'] }))
    expect(await screen.findByText(T['admin.notes.addError'])).toBeDefined()
    expect((box as HTMLInputElement).value).toBe('keep me')
  })

  it('a successful save re-reads the list rather than pushing locally', async () => {
    let reads = 0
    const calls = stubFetch((_u, init) => {
      if (init?.method === 'POST') return { body: { data: note() } }
      reads++
      return { body: { data: reads === 1 ? [] : [note()] } }
    })
    render(<UserNotesPanel userId={USER_ID} can={ALL} />)
    await userEvent.type(
      await screen.findByRole('textbox', { name: T['admin.notes.addLabel'] }),
      'saved'
    )
    await userEvent.click(screen.getByRole('button', { name: T['admin.notes.add'] }))
    await waitFor(() => expect(reads).toBeGreaterThan(1))
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1)
  })
})

describe('the panel and the page decide nothing about authorization', () => {
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('the panel names no role and computes no permission', () => {
    const raw = readFileSync(join(__dirname, 'UserNotesPanel.tsx'), 'utf8')
    const code = strip(raw)
    expect(code.length).toBeLessThan(raw.length)
    for (const f of ['permissionEngine', 'PERMISSIONS.', 'super_admin', 'moderator', 'isOwner']) {
      expect(code, `references ${f}`).not.toContain(f)
    }
  })

  // Mutation N22 collapsed the page's WRITE derivation into the READ
  // permission and survived every test above — the panel behaved perfectly on
  // the wrong input. Same seam the session panel had.
  const page = readFileSync(
    join(__dirname, '..', '..', '..', 'app', 'admin', 'users', 'page.tsx'),
    'utf8'
  )

  it('🔑 notesRead comes from USERS_NOTES_READ', () => {
    expect(page).toMatch(/notesRead:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.USERS_NOTES_READ\s*\)/)
  })

  it('🔑 notesWrite comes from USERS_NOTES_WRITE — not from the read permission', () => {
    expect(page).toMatch(/notesWrite:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.USERS_NOTES_WRITE\s*\)/)
  })

  it('the anchors above are real — the page contains both permission names', () => {
    expect(page).toContain('USERS_NOTES_READ')
    expect(page).toContain('USERS_NOTES_WRITE')
  })
})
