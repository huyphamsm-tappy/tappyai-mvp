// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

// WHICH card `/login` actually renders — asserted against the real page, not a
// fixture, because this is the invariant the whole approach rests on.
//
// 🔑 ONE PAGE, TWO PRODUCTS. Sixteen call sites reach `/login`. The consumer
// app's real users sign in with Google and Zalo; the Controller is email-only
// and corporate-only. If the Controller's requirement were satisfied by DELETING
// the consumer providers, every real user would lose their way in. So the page
// keeps both cards and picks by destination — and these tests fail the moment
// either half stops being true.

type OtpArgs = { email: string; options: { shouldCreateUser: boolean } }
type AuthResult = { error: { message: string } | null }

const replace = vi.fn()
const getUser = vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } }))
// Typed so the assertions below can read `.options.shouldCreateUser` and so a
// refusal can be simulated — an untyped `vi.fn()` infers `error: null` and
// `calls[0]` as an empty tuple, which type-checks the tests into uselessness.
const signInWithOtp = vi.fn(async (_args: OtpArgs): Promise<AuthResult> => ({ error: null }))
const signInWithPassword = vi.fn(
  async (_args: { email: string; password: string }): Promise<AuthResult> => ({ error: null })
)
const verifyOtp = vi.fn(
  async (_args: { email: string; token: string; type: string }): Promise<AuthResult> => ({ error: null })
)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser, signInWithOtp, verifyOtp, signInWithPassword, signInWithOAuth: vi.fn(), signInAnonymously: vi.fn() },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

vi.mock('@/lib/analytics/authEvents', () => ({
  markAuthPending: vi.fn(),
  emitAuthLoginFailed: vi.fn(),
  getPendingMethod: () => null,
}))

const visit = async (search: string) => {
  window.history.replaceState({}, '', `/login${search}`)
  const { default: LoginPage } = await import('./page')
  return render(<LoginPage />)
}

describe('a visitor sent to /login BY THE CONTROLLER', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it.each(['?returnTo=%2Fadmin', '?returnTo=%2Fadmin%2Fusers', '?returnTo=%2Fcontroller'])(
    '%s gets the Controller card',
    async (search) => {
      await visit(search)
      await waitFor(() => expect(screen.getByTestId('controller-login-submit')).toBeTruthy())
    }
  )

  it('is offered NO Google sign-in', async () => {
    await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(screen.getByTestId('controller-login-submit')).toBeTruthy())
    expect(screen.queryByText(/google/i)).toBeNull()
  })

  it('is offered NO Zalo sign-in', async () => {
    await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(screen.getByTestId('controller-login-submit')).toBeTruthy())
    expect(screen.queryByText(/zalo/i)).toBeNull()
  })

  it('is offered an email field', async () => {
    await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(screen.getByLabelText(/e-?mail/i)).toBeTruthy())
  })
})

describe('every other visitor keeps the consumer card — nothing was taken away', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it.each([
    ['no destination', ''],
    ['the consumer home', '?returnTo=%2F'],
    ['a consumer screen', '?returnTo=%2Fexplore'],
    ['an /admin look-alike', '?returnTo=%2Fadministrators'],
  ])('%s still sees Google', async (_label, search) => {
    await visit(search)
    await waitFor(() => expect(screen.getAllByText(/google/i).length).toBeGreaterThan(0))
  })

  it('still sees Zalo', async () => {
    await visit('')
    await waitFor(() => expect(screen.getAllByText(/zalo/i).length).toBeGreaterThan(0))
  })

  it('does NOT get the Controller card', async () => {
    await visit('')
    await waitFor(() => expect(screen.getAllByText(/google/i).length).toBeGreaterThan(0))
    expect(screen.queryByTestId('controller-login-submit')).toBeNull()
  })
})

describe('a completed Controller sign-in lands on the Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    window.localStorage.clear()
    getUser.mockResolvedValue({ data: { user: null } })
    signInWithOtp.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ error: null })
  })
  afterEach(cleanup)

  const fill = (get: (m: RegExp) => HTMLElement, email: string, password: string) => {
    fireEvent.change(get(/e-?mail/i), { target: { value: email } })
    fireEvent.change(get(/mật khẩu|password/i), { target: { value: password } })
  }

  it('authenticates and navigates to the destination the guard asked for', async () => {
    // 🔑 THE GAP MUTATION S01 FOUND. The card's own suite proves it calls
    // `onAuthenticated`; nothing proved the PAGE then went anywhere. Deleting
    // the `router.replace` left every test green — a sign-in that succeeds and
    // strands the visitor on the login screen.
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fill(getByLabelText, 'ops@tappyai.com', 'correct horse')
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'))
  })

  it('uses the EXISTING provider — the password primitive, not a new mechanism', async () => {
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fill(getByLabelText, 'ops@tappyai.com', 'correct horse')
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'ops@tappyai.com',
        password: 'correct horse',
      })
    )
  })

  it('🔑 NEVER creates an account — the Controller is provisioned, not self-served', async () => {
    // OWNER DECISION 2026-08-21, reaffirmed by the auth correction. An account
    // must ALREADY EXIST; the highest-authority Controller administrator
    // creates it and assigns its roles.
    //
    // Under the old one-time-code flow this rested on a FLAG (`shouldCreateUser:
    // false`) that could be flipped back. `signInWithPassword` has no create
    // option at all, so self-registration is now impossible BY CONSTRUCTION —
    // and the assertion changes accordingly: the Controller path must never
    // reach an OTP call, which is the only thing on this page that can create a
    // user.
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fill(getByLabelText, 'newperson@tappyai.com', 'anything')
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1))
    expect(signInWithOtp).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('🔑 and the Controller never touches the OTP flow at all', async () => {
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())
    // No code field ever appears, whatever the outcome.
    fill(getByLabelText, 'ops@tappyai.com', 'x')
    fireEvent.click(getByTestId('controller-login-submit'))
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled())
    expect(document.querySelector('#controller-login-code')).toBeNull()
  })

  it('an address with no account gets an error, no session and no navigation', async () => {
    // GoTrue refuses an unknown address with the same error as a wrong
    // password. The visitor is simply told, and stays exactly where they are.
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fill(getByLabelText, 'newperson@tappyai.com', 'anything')
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent ?? '').not.toMatch(/Invalid login credentials/i)
  })
})

describe('🔑 the consumer flow did NOT inherit the Controller policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    window.localStorage.clear()
    getUser.mockResolvedValue({ data: { user: null } })
    signInWithOtp.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })
  })
  afterEach(cleanup)

  it('the consumer email sign-in still creates users, as it always did', async () => {
    // THE HAZARD THE OWNER NAMED. Both cards go through one `signInWithOtp`
    // call site — which is what keeps "one mechanism" true, and is also exactly
    // how the Controller's stricter policy could silently become the consumer's.
    // The consumer app is open to the public and MUST keep self-registration.
    //
    // `/login?email=1` is the existing entry point for the consumer email block.
    const { container } = await visit('?email=1')
    await waitFor(() => expect(screen.getAllByText(/google/i).length).toBeGreaterThan(0))

    // The consumer email block starts collapsed behind its own "Sign in with
    // Email" button; open it exactly the way a visitor would.
    fireEvent.click(
      [...container.querySelectorAll('button')].find((b) =>
        /Đăng nhập bằng Email|Sign in with Email/i.test(b.textContent ?? '')
      )!
    )
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    expect(emailInput, 'the consumer email block should be open at ?email=1').toBeTruthy()
    fireEvent.change(emailInput, { target: { value: 'someone@gmail.com' } })

    const sendButton = [...container.querySelectorAll('button')].find((b) =>
      /gửi|send/i.test(b.textContent ?? '')
    )!
    fireEvent.click(sendButton)

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true)
  })

  it('and a consumer address is NOT domain-restricted', async () => {
    // The corporate rule belongs to the Controller card only. If it leaked into
    // the consumer block, every public signup outside @tappyai.com would break.
    const { container } = await visit('?email=1')
    await waitFor(() => expect(screen.getAllByText(/google/i).length).toBeGreaterThan(0))

    // The consumer email block starts collapsed behind its own "Sign in with
    // Email" button; open it exactly the way a visitor would.
    fireEvent.click(
      [...container.querySelectorAll('button')].find((b) =>
        /Đăng nhập bằng Email|Sign in with Email/i.test(b.textContent ?? '')
      )!
    )
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'someone@gmail.com' } })
    const sendButton = [...container.querySelectorAll('button')].find((b) =>
      /gửi|send/i.test(b.textContent ?? '')
    )!
    fireEvent.click(sendButton)

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    expect(signInWithOtp.mock.calls[0][0].email).toBe('someone@gmail.com')
  })

  it('a non-corporate address never reaches the backend', async () => {
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fireEvent.change(getByLabelText(/e-?mail/i), { target: { value: 'someone@gmail.com' } })
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(signInWithOtp).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('the authenticated redirect is the page-level behaviour it always was', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('an already-signed-in visitor is sent to the destination, not shown a card', async () => {
    // Unchanged by this work: the same effect, the same `readReturnTo`
    // contract. Pinned here so the Controller branch cannot be mistaken for a
    // replacement of it.
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } } as never)
    await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'))
  })

  it('and the consumer destination still works the same way', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } } as never)
    await visit('?returnTo=%2Fexplore')
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/explore'))
  })
})
