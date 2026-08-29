// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import { SendNotificationForm } from './SendNotificationForm'

// The Controller send form.
//
// ⚠️ NO REAL NETWORK. `fetch` is replaced for every test, so neither the send
// route nor any push provider can be reached from here. No notification is
// created by this file.

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.localStorage.setItem('tappy_lang', 'en')
  vi.stubGlobal('fetch', fetchMock)
  // Default: the user search returns two people.
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { users: [{ id: UUID_A, full_name: 'Alice' }, { id: UUID_B, full_name: 'Bob' }] } }),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const searchAndPick = async (name: string) => {
  // >= 2 characters: `search()` returns early below that, so a 1-char query
  // silently did nothing and every dependent test timed out waiting.
  fireEvent.change(screen.getByLabelText(/search by name/i), { target: { value: 'ali' } })
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
  await waitFor(() => screen.getByText(name))
  fireEvent.click(screen.getByText(name))
}

const compose = (title = 'Hello', body = 'World') => {
  fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: title } })
  fireEvent.change(screen.getByLabelText(/^body$/i), { target: { value: body } })
}

const sendButton = () => screen.getByTestId('notification-send') as HTMLButtonElement

describe('the send button is disabled until the form is genuinely valid', () => {
  it('starts disabled with nothing filled in', () => {
    render(<SendNotificationForm />)
    expect(sendButton().disabled).toBe(true)
  })

  it('stays disabled with recipients but no message', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    expect(sendButton().disabled).toBe(true)
  })

  it('stays disabled with a message but no recipient', () => {
    render(<SendNotificationForm />)
    compose()
    expect(sendButton().disabled).toBe(true)
  })

  it('enables once there is a recipient and a message', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    compose()
    expect(sendButton().disabled).toBe(false)
  })
})

describe('link validation happens before anything is sent', () => {
  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)'])(
    '🔑 refuses %s — a notification is a channel into a device, not an open redirect',
    async (bad) => {
      render(<SendNotificationForm />)
      await searchAndPick('Alice')
      compose()
      fireEvent.change(screen.getByLabelText(/link/i), { target: { value: bad } })
      expect(sendButton().disabled).toBe(true)
      expect(screen.getByText(enStrings['admin.notifications.linkInvalid'])).toBeTruthy()
    }
  )

  it('accepts a relative internal path', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    compose()
    fireEvent.change(screen.getByLabelText(/link/i), { target: { value: '/explore' } })
    expect(sendButton().disabled).toBe(false)
  })
})

describe('preview', () => {
  it('shows the composed fields and does NOT claim to be device-identical', () => {
    render(<SendNotificationForm />)
    compose('My title', 'My body')
    // Scoped to the preview: the textarea holds the same text, so an unscoped
    // getByText matches twice and throws.
    const preview = document.querySelector('[aria-labelledby="notif-preview"]')!
    expect(preview.textContent).toContain('My title')
    expect(preview.textContent).toContain('My body')
    expect(screen.getByText(enStrings['admin.notifications.previewNote'])).toBeTruthy()
  })
})

describe('recipients', () => {
  it('🔑 selecting the same person twice adds them once', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    // Click the RESULT row again, not `getByText('Alice')` — after the first
    // pick the name appears in both the results list and the selected chip, so
    // an unscoped query matches two elements and throws.
    const again = screen.getAllByRole('button', { name: /Alice/ })[0]
    fireEvent.click(again)
    expect(screen.getByTestId('selected-recipients').querySelectorAll('li')).toHaveLength(1)
  })

  it('🔑 the picker renders no email, avatar or follower count', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    const html = document.body.innerHTML
    expect(html).not.toMatch(/@/)
    expect(html).not.toContain('follower')
    expect(html).not.toContain('avatar')
  })

  it('reads the ADMIN user surface, never the consumer search route', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/admin/users')
    expect(url).not.toContain('/api/users/search')
  })
})

describe('the in-flight guard', () => {
  it('🔑 a second click while a send is in flight does not send twice', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    compose()
    fetchMock.mockClear()

    // A send that never settles, so the button stays in-flight.
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const btn = sendButton()
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)

    // The ref — not the `busy` state — is what makes this true: three clicks
    // dispatched before React re-renders would all read the same stale `busy`.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('the result is reported honestly', () => {
  const outcome = {
    recipients: 4, accepted: 1, failed: 1, gone: 1, unreachable: 1, errored: 0,
  }

  const send = async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    compose()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: outcome }) })
    fireEvent.click(sendButton())
    await waitFor(() => screen.getByTestId('send-outcome'))
  }

  it('shows all four distinct outcomes separately', async () => {
    await send()
    const panel = screen.getByTestId('send-outcome')
    for (const label of [
      'admin.notifications.result.accepted',
      'admin.notifications.result.failed',
      'admin.notifications.result.gone',
      'admin.notifications.result.unreachable',
    ]) {
      expect(panel.textContent).toContain(enStrings[label])
    }
  })

  it('🔑 never uses the word "delivered"', async () => {
    await send()
    expect(document.body.textContent?.toLowerCase()).not.toContain('delivered')
  })

  it('says plainly that acceptance is not display', async () => {
    await send()
    expect(screen.getByText(enStrings['admin.notifications.result.note'])).toBeTruthy()
  })

  it('surfaces a server refusal instead of a fake success', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    compose()
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'DUPLICATE_REQUEST', message: 'Just sent that' } }),
    })
    fireEvent.click(sendButton())
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByRole('alert').textContent).toContain('Just sent that')
    expect(screen.queryByTestId('send-outcome')).toBeNull()
  })
})

describe('i18n', () => {
  it('every key the form uses exists in BOTH locales', () => {
    const keys = [
      'admin.notifications.recipients', 'admin.notifications.searchPlaceholder', 'admin.notifications.search',
      'admin.notifications.add', 'admin.notifications.remove', 'admin.notifications.unnamedUser',
      'admin.notifications.message', 'admin.notifications.titleLabel', 'admin.notifications.bodyLabel',
      'admin.notifications.linkLabel', 'admin.notifications.linkInvalid', 'admin.notifications.preview',
      'admin.notifications.previewNote', 'admin.notifications.send', 'admin.notifications.sending',
      'admin.notifications.result', 'admin.notifications.result.recipients', 'admin.notifications.result.accepted',
      'admin.notifications.result.failed', 'admin.notifications.result.gone',
      'admin.notifications.result.unreachable', 'admin.notifications.result.errored',
      'admin.notifications.result.note', 'admin.notifications.error.generic',
      'admin.notifications.noSendPermission',
    ]
    for (const k of keys) {
      expect(viStrings[k], `missing vi: ${k}`).toBeTruthy()
      expect(enStrings[k], `missing en: ${k}`).toBeTruthy()
      expect(viStrings[k], `vi is a copy of en: ${k}`).not.toBe(enStrings[k])
    }
  })

  it('renders no raw i18n key', async () => {
    render(<SendNotificationForm />)
    await searchAndPick('Alice')
    compose()
    expect(document.body.textContent).not.toMatch(/\badmin\.notifications\./)
  })
})
