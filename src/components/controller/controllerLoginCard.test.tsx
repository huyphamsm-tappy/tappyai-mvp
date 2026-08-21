// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { ControllerLoginCard } from './ControllerLoginCard'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'

// The Controller's sign-in card.
//
// It owns PRESENTATION AND VALIDATION only. The two async handlers are injected
// by `/login`, which keeps using the Supabase calls it already had —
// `signInWithOtp` / `verifyOtp`. No new authentication mechanism, no new
// provider, and no second session path.
//
// 🔑 THE DOMAIN CHECK HERE IS A COURTESY, NOT A BOUNDARY. It stops a one-time
// code being mailed to a personal address and tells the visitor why immediately,
// instead of letting them finish a sign-in and meet `/access-denied` afterwards.
// Anyone can type `ceo@tappyai.com`; what makes the boundary real is
// `checkCorporateIdentity` on a CONFIRMED session, server-side, which this
// cannot reach or weaken. `noClientSideBypass` at the bottom pins that.

const sendCode = vi.fn()
const verifyCode = vi.fn()
const onAuthenticated = vi.fn()

const setup = (locale: 'vi' | 'en' = 'vi') => {
  setLocale(locale)
  return render(
    <ControllerLoginCard sendCode={sendCode} verifyCode={verifyCode} onAuthenticated={onAuthenticated} />
  )
}

const emailField = () => screen.getByLabelText(/e-?mail/i)
const submit = () => screen.getByTestId('controller-login-submit')
const type = (value: string) => fireEvent.change(emailField(), { target: { value } })

describe('the Controller sign-in card — what it offers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendCode.mockResolvedValue({ ok: true })
    verifyCode.mockResolvedValue({ ok: true })
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it.each(['vi', 'en'] as const)('[%s] shows an email field and one primary action', (locale) => {
    setup(locale)
    expect(emailField()).toBeTruthy()
    expect(submit()).toBeTruthy()
  })

  it('offers NO Google sign-in', () => {
    setup()
    expect(screen.queryByText(/google/i)).toBeNull()
  })

  it('offers NO Zalo sign-in', () => {
    setup()
    expect(screen.queryByText(/zalo/i)).toBeNull()
  })

  it('offers no OAuth provider of any kind, and no guest entry', () => {
    setup()
    expect(screen.queryByText(/facebook|apple|khách|guest/i)).toBeNull()
    // Exactly one submit control — nothing else that starts an auth flow.
    expect(screen.getAllByRole('button').filter((b) => (b as HTMLButtonElement).type === 'submit')).toHaveLength(1)
  })

  it.each(['vi', 'en'] as const)('[%s] renders no raw translation keys', (locale) => {
    setup(locale)
    expect(document.body.textContent).not.toMatch(/admin\.login\./)
  })

  it.each(['vi', 'en'] as const)('[%s] every visible string comes FROM the catalogue', (locale) => {
    // "No raw keys" is not enough: a hardcoded Vietnamese string renders
    // perfectly in Vietnamese and leaves the English page half-translated.
    // Mutation I03 survived on exactly that. Comparing against the catalogue
    // value for the ACTIVE locale is what catches it.
    setup(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    for (const key of [
      'admin.login.title',
      'admin.login.subtitle',
      'admin.login.emailLabel',
      'admin.login.sendCode',
    ]) {
      expect(screen.getByText(strings[key]), key).toBeTruthy()
    }
  })
})

describe('the Controller sign-in card — the address must be corporate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendCode.mockResolvedValue({ ok: true })
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('an empty address is refused before anything is sent', async () => {
    setup()
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(sendCode).not.toHaveBeenCalled()
  })

  it('a malformed address is refused before anything is sent', async () => {
    setup()
    type('not-an-address')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(sendCode).not.toHaveBeenCalled()
  })

  it.each([
    'someone@gmail.com',
    'evil@nottappyai.com',
    'evil@mail.tappyai.com',
    'evil@tappyai.com.attacker.io',
  ])('%s is refused before a code is mailed to it', async (email) => {
    setup()
    type(email)
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(sendCode).not.toHaveBeenCalled()
  })

  it('the refusal names the corporate domain, so the visitor knows what to use', async () => {
    setup()
    type('someone@gmail.com')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/tappyai\.com/))
  })

  it('a corporate address IS accepted and sent exactly once', async () => {
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())
    await waitFor(() => expect(sendCode).toHaveBeenCalledTimes(1))
    expect(sendCode).toHaveBeenCalledWith('ops@tappyai.com')
  })

  it('a plus-alias and a capitalised domain are accepted', async () => {
    setup()
    type('ops+oncall@TappyAI.com')
    fireEvent.click(submit())
    await waitFor(() => expect(sendCode).toHaveBeenCalledTimes(1))
  })
})

describe('the Controller sign-in card — loading and duplicate submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('the action is disabled while a request is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    sendCode.mockReturnValue(new Promise((r) => { release = r }))
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())

    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(true))
    release({ ok: true })
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(false))
  })

  it('two submits in the SAME tick still send exactly one code', async () => {
    // 🔑 THE TEST THAT `fireEvent` CANNOT WRITE. `fireEvent` wraps each event in
    // `act()`, so React re-renders BETWEEN clicks and the `disabled` attribute
    // catches the second one. That hid a real hole: with the in-flight ref
    // removed, mutation L01 SURVIVED, because no test ever delivered two submits
    // before a re-render — which is exactly what a double-click does.
    //
    // Dispatching native events back-to-back keeps both in one tick, so only the
    // synchronous ref guard can stop the second.
    let release: (v: unknown) => void = () => {}
    sendCode.mockReturnValue(new Promise((r) => { release = r }))
    const { container } = setup()
    type('ops@tappyai.com')

    const form = container.querySelector('form')!
    const fire = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    fire()
    fire()

    expect(sendCode).toHaveBeenCalledTimes(1)
    release({ ok: true })
    await waitFor(() => expect(sendCode).toHaveBeenCalledTimes(1))
  })

  it('clicking three times in flight still sends exactly one code', async () => {
    let release: (v: unknown) => void = () => {}
    sendCode.mockReturnValue(new Promise((r) => { release = r }))
    setup()
    type('ops@tappyai.com')

    fireEvent.click(submit())
    fireEvent.click(submit())
    fireEvent.click(submit())

    expect(sendCode).toHaveBeenCalledTimes(1)
    release({ ok: true })
    await waitFor(() => expect(sendCode).toHaveBeenCalledTimes(1))
  })

  it('says it is working, so the wait is not silent', async () => {
    let release: (v: unknown) => void = () => {}
    sendCode.mockReturnValue(new Promise((r) => { release = r }))
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByTestId('controller-login-submit').getAttribute('aria-busy')).toBe('true'))
    release({ ok: true })
  })
})

describe('the Controller sign-in card — failure keeps the visitor here', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('a refused send shows an error and does NOT advance to the code step', async () => {
    sendCode.mockResolvedValue({ ok: false, message: 'nope' })
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByLabelText(/mã|code/i)).toBeNull()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('a thrown send is handled like a refusal — never an unhandled crash', async () => {
    sendCode.mockRejectedValue(new Error('network down'))
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('the error text never leaks the backend message', async () => {
    sendCode.mockRejectedValue(new Error('PGRST301 jwt expired at supabase.co'))
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    const shown = screen.getByRole('alert').textContent ?? ''
    expect(shown).not.toMatch(/PGRST|supabase|jwt/i)
  })

  it('a REFUSAL carrying a backend message does not print it either', async () => {
    // The leak test above only covered a THROWN error. Mutation E03 showed the
    // refusal path could print `outcome.message` verbatim and survive — a
    // refusal is where a backend string is most likely to arrive.
    sendCode.mockResolvedValue({ ok: false, message: 'PGRST301: jwt expired at db.supabase.co' })
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent ?? '').not.toMatch(/PGRST|supabase|jwt/i)
  })

  it('a refused CODE with a backend message does not print it either', async () => {
    sendCode.mockResolvedValue({ ok: true })
    verifyCode.mockResolvedValue({ ok: false, message: 'PGRST302: token reused at db.supabase.co' })
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByLabelText(/mã|code/i)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/mã|code/i), { target: { value: '123456' } })
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent ?? '').not.toMatch(/PGRST|supabase|token reused/i)
  })

  it('a rejected code shows an error and does NOT report success', async () => {
    sendCode.mockResolvedValue({ ok: true })
    verifyCode.mockResolvedValue({ ok: false, message: 'bad code' })
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByLabelText(/mã|code/i)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/mã|code/i), { target: { value: '123456' } })
    fireEvent.click(submit())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
})

describe('the Controller sign-in card — success', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendCode.mockResolvedValue({ ok: true })
    verifyCode.mockResolvedValue({ ok: true })
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('a verified code hands off to the page, which owns the destination', async () => {
    setup()
    type('ops@tappyai.com')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByLabelText(/mã|code/i)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/mã|code/i), { target: { value: '123456' } })
    fireEvent.click(submit())

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1))
    // The card never navigates and never writes a session itself.
    expect(verifyCode).toHaveBeenCalledWith('ops@tappyai.com', '123456')
  })
})

describe('noClientSideBypass — the card is not the security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendCode.mockResolvedValue({ ok: true })
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('the card never establishes a session or navigates on its own', () => {
    const { container } = setup()
    // No form action, no anchor to a protected route: the only way out of this
    // card is the injected handlers, which the page owns.
    expect(container.querySelector('form')?.getAttribute('action')).toBeFalsy()
    expect(container.querySelector('a[href^="/admin"]')).toBeNull()
  })
})
