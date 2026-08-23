// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ControllerLoginCard } from './ControllerLoginCard'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'

// Owner correction, 2026-08-21: the Controller signs in with EMAIL + PASSWORD.
//
// 🔑 WHY THIS IS A REUSE, NOT A NEW AUTH ENGINE. The product already issues
// password credentials — `/register` calls `supabase.auth.signUp({ email,
// password })`. The provider (Supabase GoTrue) is the same one every other
// sign-in path uses; only the primitive on it changes, from `signInWithOtp` to
// `signInWithPassword`. No second engine, no new session mechanism.
//
// 🔑 WHAT MUST NOT MOVE. The consumer app keeps its OTP block, its Google and
// its Zalo, byte-for-byte. The `@tappyai.com` rule stays where it is — the one
// extracted `checkCorporateEmailAddress`, consulted rather than copied, with the
// server still the boundary.

const signIn = vi.fn()
const onAuthenticated = vi.fn()

const ROOT = process.cwd()

const setup = (locale: 'vi' | 'en' = 'vi') => {
  setLocale(locale)
  return render(<ControllerLoginCard signIn={signIn} onAuthenticated={onAuthenticated} />)
}

const emailField = () => screen.getByLabelText(/e-?mail/i)
const passwordField = () => screen.getByLabelText(/mật khẩu|password/i)
const submit = () => screen.getByTestId('controller-login-submit')
const fill = (email: string, password: string) => {
  fireEvent.change(emailField(), { target: { value: email } })
  fireEvent.change(passwordField(), { target: { value: password } })
}

describe('the Controller signs in with email and password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signIn.mockResolvedValue({ ok: true })
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it.each(['vi', 'en'] as const)('[%s] offers an email field and a password field', (locale) => {
    setup(locale)
    expect(emailField()).toBeTruthy()
    expect(passwordField()).toBeTruthy()
    expect((passwordField() as HTMLInputElement).type).toBe('password')
  })

  it('the password field never exposes what was typed', () => {
    setup()
    const pw = passwordField() as HTMLInputElement
    expect(pw.type).toBe('password')
    expect(pw.getAttribute('autocomplete')).toBe('current-password')
  })

  // ── J: no OTP anywhere ────────────────────────────────────────────────────
  it.each(['vi', 'en'] as const)('[%s] shows NO OTP terminology at all', (locale) => {
    setup(locale)
    const text = document.body.textContent ?? ''
    for (const forbidden of [/mã xác minh/i, /verification code/i, /6 chữ số/i, /6 digits/i, /đã gửi mã/i, /sign-in code/i]) {
      expect(text, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('has no six-digit code input and no one-time-code autocomplete', () => {
    const { container } = setup()
    expect(container.querySelector('#controller-login-code')).toBeNull()
    expect(container.querySelector('[autocomplete="one-time-code"]')).toBeNull()
    expect(container.querySelector('[inputmode="numeric"]')).toBeNull()
  })

  it('🔑 the component contains no OTP call or OTP string in its CODE', () => {
    const code = readFileSync(join(ROOT, 'src/components/controller/ControllerLoginCard.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const forbidden of ['signInWithOtp', 'verifyOtp', 'sendCode', 'verifyCode', 'admin.login.codeLabel']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })

  // ── carried over from the OTP card's suite: these outlive the flow change ──
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
    expect(
      screen.getAllByRole('button').filter((b) => (b as HTMLButtonElement).type === 'submit')
    ).toHaveLength(1)
  })

  it('noClientSideBypass — the card never establishes a session or navigates', () => {
    const { container } = setup()
    expect(container.querySelector('form')?.getAttribute('action')).toBeFalsy()
    expect(container.querySelector('a[href^="/admin"]')).toBeNull()
  })

  it('offers no "forgot password" control — the product has no recovery flow', () => {
    // `resetPasswordForEmail` has zero call sites in `src/`. A control that
    // leads nowhere promises a way back in that does not exist; its absence is
    // deliberate and is an open Owner decision, not an oversight.
    setup()
    expect(screen.queryByText(/quên mật khẩu|forgot password/i)).toBeNull()
  })

  // ── A: the happy path ─────────────────────────────────────────────────────
  it('a corporate address with a password calls the password primitive once', async () => {
    setup()
    fill('ops@tappyai.com', 'correct horse')
    fireEvent.click(submit())
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
    expect(signIn).toHaveBeenCalledWith('ops@tappyai.com', 'correct horse')
  })

  it('H: a successful sign-in hands off to the page, which owns the destination', async () => {
    setup()
    fill('ops@tappyai.com', 'correct horse')
    fireEvent.click(submit())
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1))
  })

  // ── C: domain rejected BEFORE the provider is contacted ───────────────────
  it.each(['someone@gmail.com', 'evil@nottappyai.com', 'evil@mail.tappyai.com'])(
    'C: %s is refused before any authentication request',
    async (email) => {
      setup()
      fill(email, 'whatever')
      fireEvent.click(submit())
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      expect(signIn).not.toHaveBeenCalled()
    }
  )

  it('C: the refusal names the corporate domain', async () => {
    setup()
    fill('someone@gmail.com', 'whatever')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/tappyai\.com/))
  })

  // ── E: empty fields ───────────────────────────────────────────────────────
  it('E: an empty email is refused without contacting the provider', async () => {
    setup()
    fill('', 'somepassword')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(signIn).not.toHaveBeenCalled()
  })

  it('E: an empty password is refused without contacting the provider', async () => {
    setup()
    fill('ops@tappyai.com', '')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(signIn).not.toHaveBeenCalled()
  })

  // ── B + D: the provider refuses ───────────────────────────────────────────
  it('B/D: a refused sign-in shows an error, creates nothing and stays put', async () => {
    signIn.mockResolvedValue({ ok: false, message: 'Invalid login credentials' })
    setup()
    fill('newperson@tappyai.com', 'wrong')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('B: a wrong password and an unknown account are indistinguishable to the visitor', async () => {
    // Account-existence must not leak. GoTrue returns the same error for both;
    // the UI must not add a distinction the backend deliberately withholds.
    const seen: string[] = []
    for (const pw of ['wrong-password', 'anything']) {
      signIn.mockResolvedValue({ ok: false, message: 'Invalid login credentials' })
      setup()
      fill('nobody@tappyai.com', pw)
      fireEvent.click(submit())
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      seen.push(screen.getByRole('alert').textContent ?? '')
      cleanup()
    }
    expect(new Set(seen).size).toBe(1)
  })

  // ── G: no raw backend error ───────────────────────────────────────────────
  it('G: the backend message is never shown verbatim', async () => {
    signIn.mockResolvedValue({ ok: false, message: 'AuthApiError: Invalid login credentials at gotrue.supabase.co' })
    setup()
    fill('ops@tappyai.com', 'x')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent ?? '').not.toMatch(/AuthApiError|supabase|gotrue/i)
  })

  it('G: a thrown request is handled like a refusal, never an unhandled crash', async () => {
    signIn.mockRejectedValue(new Error('network down'))
    setup()
    fill('ops@tappyai.com', 'x')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  // ── F: loading and duplicate submission ───────────────────────────────────
  it('F: the action is disabled while a request is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    signIn.mockReturnValue(new Promise((r) => { release = r }))
    setup()
    fill('ops@tappyai.com', 'x')
    fireEvent.click(submit())
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(true))
    release({ ok: true })
  })

  it('F: two submits in the SAME tick authenticate exactly once', async () => {
    let release: (v: unknown) => void = () => {}
    signIn.mockReturnValue(new Promise((r) => { release = r }))
    const { container } = setup()
    fill('ops@tappyai.com', 'x')
    const form = container.querySelector('form')!
    const fire = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    fire()
    fire()
    expect(signIn).toHaveBeenCalledTimes(1)
    release({ ok: true })
  })

  it.each(['vi', 'en'] as const)('[%s] says it is signing in, not "sending"', async (locale) => {
    let release: (v: unknown) => void = () => {}
    signIn.mockReturnValue(new Promise((r) => { release = r }))
    setup(locale)
    fill('ops@tappyai.com', 'x')
    fireEvent.click(submit())
    const strings = locale === 'vi' ? viStrings : enStrings
    await waitFor(() => expect(screen.getByTestId('controller-login-submit').textContent).toContain(strings['admin.login.signingIn']))
    release({ ok: true })
  })

  // ── locale ────────────────────────────────────────────────────────────────
  it.each(['vi', 'en'] as const)('[%s] every visible string comes from the catalogue', (locale) => {
    setup(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    // Controller V2.3 — the card is now the RIGHT-HAND AUTH PANEL of a composed
    // entry page. `admin.login.welcome` and `admin.login.tagline` moved OUT to
    // the page hero (asserted in `src/app/login/controllerLoginLayout.test.tsx`),
    // and the card reclaimed `admin.login.title` as its own h2 — so this list is
    // back to the five keys the card actually renders.
    //
    // 🔑 STILL NOT A RELAXATION. The intent — "every visible string is
    // catalogue-sourced and no raw key leaks" — is unchanged, and the strings
    // that left this list are asserted at the level they now render at, not
    // dropped. The raw-key assertion below is untouched.
    for (const key of ['admin.login.title', 'admin.login.subtitle', 'admin.login.emailLabel', 'admin.login.passwordLabel', 'admin.login.signIn']) {
      expect(screen.getByText(strings[key]), key).toBeTruthy()
    }
    expect(document.body.textContent).not.toMatch(/admin\.login\./)
  })
})

describe('no OTP terminology survives anywhere in the Controller', () => {
  it('🔑 the admin catalogue carries no code/OTP strings any more', async () => {
    const { vi: v, en: e } = await import('@/lib/i18n/admin')
    for (const key of ['admin.login.sendCode', 'admin.login.sending', 'admin.login.codeSentTo', 'admin.login.codeLabel', 'admin.login.codePlaceholder', 'admin.login.verify', 'admin.login.verifying', 'admin.login.errorCodeRequired', 'admin.login.errorVerifyFailed']) {
      expect(v[key], `vi ${key}`).toBeUndefined()
      expect(e[key], `en ${key}`).toBeUndefined()
    }
  })

  it('the password strings exist in BOTH locales and differ', async () => {
    const { vi: v, en: e } = await import('@/lib/i18n/admin')
    for (const key of ['admin.login.passwordLabel', 'admin.login.signIn', 'admin.login.signingIn', 'admin.login.errorPasswordRequired', 'admin.login.errorSignInFailed']) {
      expect(v[key], `vi ${key}`).toBeTruthy()
      expect(e[key], `en ${key}`).toBeTruthy()
      expect(v[key], `${key} untranslated`).not.toBe(e[key])
    }
  })
})

describe('🔑 the CONSUMER app was not touched', () => {
  const login = readFileSync(join(ROOT, 'src/app/login/page.tsx'), 'utf8')

  it('the consumer OTP block still exists and still uses its own primitives', () => {
    expect(login).toContain('function EmailOtpBlock(')
    expect(login.match(/signInWithOtp\(/g)).toHaveLength(1)
    expect(login.match(/verifyOtp\(/g)).toHaveLength(1)
  })

  it('Google, Zalo, Facebook and Guest handlers are untouched', () => {
    for (const h of ['handleGoogleLogin', 'handleZaloLogin', 'handleFacebookLogin', 'handleGuest']) {
      expect(login, h).toContain(`const ${h} = `)
    }
  })

  it('the consumer keeps self-registration; the Controller does not have one to keep', () => {
    // `shouldCreateUser` is a property of the OTP flow the CONSUMER still uses.
    // The Controller no longer touches OTP at all, so it cannot self-register
    // by construction — there is no create flag left on its path.
    expect(login).toContain('requestOtpCode(email, true)')
    expect(login).not.toContain('requestOtpCode(email, false)')
  })

  it('🔑 exactly ONE signInWithPassword call site exists', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !name.includes('.test.')) files.push(p)
      }
    }
    walk(join(ROOT, 'src'))
    const sites = files.filter((f) =>
      /signInWithPassword\(/.test(
        readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      )
    )
    expect(sites.map((f) => f.replace(ROOT, '').replace(/\\/g, '/'))).toEqual(['/src/app/login/page.tsx'])
  })
})
