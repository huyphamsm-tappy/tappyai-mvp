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
    auth: { getUser, signInWithOtp, verifyOtp, signInWithOAuth: vi.fn(), signInAnonymously: vi.fn() },
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
    verifyOtp.mockResolvedValue({ error: null })
  })
  afterEach(cleanup)

  it('sends a code, redeems it, and navigates to the destination the guard asked for', async () => {
    // 🔑 THE GAP MUTATION S01 FOUND. The card's own suite proves it calls
    // `onAuthenticated`; nothing proved the PAGE then went anywhere. Deleting
    // the `router.replace` left every test green — a sign-in that succeeds and
    // strands the visitor on the login screen.
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fireEvent.change(getByLabelText(/e-?mail/i), { target: { value: 'ops@tappyai.com' } })
    fireEvent.click(getByTestId('controller-login-submit'))
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(getByLabelText(/mã|code/i)).toBeTruthy())
    fireEvent.change(getByLabelText(/mã|code/i), { target: { value: '123456' } })
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'))
  })

  it('uses the EXISTING Supabase calls — no new mechanism', async () => {
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fireEvent.change(getByLabelText(/e-?mail/i), { target: { value: 'ops@tappyai.com' } })
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'ops@tappyai.com',
      options: { shouldCreateUser: false },
    }))
  })

  it('🔑 NEVER creates an account — the Controller is provisioned, not self-served', async () => {
    // OWNER DECISION 2026-08-21. Controller V2 is a corporate back-office: an
    // account must ALREADY EXIST before anyone can sign in, and the
    // highest-authority Controller administrator is the one who creates it and
    // assigns its roles. `shouldCreateUser: true` would make typing an address
    // into this form a self-registration — a stranger who guesses a plausible
    // `@tappyai.com` local part would mint a real Supabase user.
    //
    // (It would still hold NO permissions — RBAC is separate and server-side —
    // but an account that exists is an account that can be granted one later,
    // and it is not the administrator who created it.)
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fireEvent.change(getByLabelText(/e-?mail/i), { target: { value: 'newperson@tappyai.com' } })
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1))
    const options = signInWithOtp.mock.calls[0][0].options
    expect(options.shouldCreateUser).toBe(false)
  })

  it('an address with no account gets an error, no session and no navigation', async () => {
    // With `shouldCreateUser: false` the backend refuses an unknown address.
    // The visitor must simply be told, and must stay exactly where they are.
    signInWithOtp.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } })
    const { getByLabelText, getByTestId } = await visit('?returnTo=%2Fadmin')
    await waitFor(() => expect(getByTestId('controller-login-submit')).toBeTruthy())

    fireEvent.change(getByLabelText(/e-?mail/i), { target: { value: 'newperson@tappyai.com' } })
    fireEvent.click(getByTestId('controller-login-submit'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    // Never advanced to the code step: there is no code to wait for.
    expect(screen.queryByLabelText(/mã|code/i)).toBeNull()
  })
})

describe('🔑 the consumer flow did NOT inherit the Controller policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    window.localStorage.clear()
    getUser.mockResolvedValue({ data: { user: null } })
    signInWithOtp.mockResolvedValue({ error: null })
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
