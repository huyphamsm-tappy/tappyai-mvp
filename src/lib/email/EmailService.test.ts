import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock nodemailer BEFORE importing anything that transitively imports it, so
// BrevoSMTPProvider's lazy getTransporter() picks up the fake transport
// instead of ever opening a real socket. sendMail is reconfigured per test
// via mockSendMail.mockImplementation(...).
const mockSendMail = vi.fn()
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}))

const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_FROM_NAME', 'TEAM_EMAIL'] as const

function setValidEnv() {
  process.env.SMTP_HOST = 'smtp-relay.brevo.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_USER = 'test-user@example.com'
  process.env.SMTP_PASS = 'super-secret-password-should-never-be-logged'
  process.env.EMAIL_FROM = 'noreply@tappyai.com'
  process.env.EMAIL_FROM_NAME = 'TappyAI'
  delete process.env.TEAM_EMAIL
}

describe('EmailService', () => {
  const originalEnv: Record<string, string | undefined> = {}
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k]
    vi.resetModules()
    mockSendMail.mockReset()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k]
      else process.env[k] = originalEnv[k]
    }
    consoleErrorSpy.mockRestore()
  })

  it('never throws and returns a graceful failure when SMTP config is missing', async () => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    const { sendEmail } = await import('./EmailService')
    await expect(sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' })).resolves.toEqual({
      success: false,
      error: 'Failed to send email',
    })
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('sends successfully and returns the messageId when SMTP config is present', async () => {
    setValidEnv()
    mockSendMail.mockResolvedValue({ messageId: '<abc123@brevo.com>' })
    const { sendEmail } = await import('./EmailService')
    const result = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' })
    expect(result).toEqual({ success: true, messageId: '<abc123@brevo.com>' })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"TappyAI" <noreply@tappyai.com>', to: 'a@b.com' }))
  })

  it('retries a transient (network) failure and succeeds on a later attempt', async () => {
    setValidEnv()
    const transientError = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' })
    mockSendMail
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ messageId: '<retried@brevo.com>' })
    const { sendEmail } = await import('./EmailService')
    const result = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' })
    expect(result).toEqual({ success: true, messageId: '<retried@brevo.com>' })
    expect(mockSendMail).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a permanent SMTP rejection (5xx) — fails after exactly one attempt', async () => {
    setValidEnv()
    const permanentError = Object.assign(new Error('mailbox unavailable'), { responseCode: 550 })
    mockSendMail.mockRejectedValue(permanentError)
    const { sendEmail } = await import('./EmailService')
    const result = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' })
    expect(result).toEqual({ success: false, error: 'Failed to send email' })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('gives up after exhausting retries on a persistently transient failure', async () => {
    setValidEnv()
    const transientError = Object.assign(new Error('econnreset'), { code: 'ECONNRESET' })
    mockSendMail.mockRejectedValue(transientError)
    const { sendEmail } = await import('./EmailService')
    const result = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' })
    expect(result.success).toBe(false)
    expect(mockSendMail).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('never logs the SMTP password or user, even when a send fails', async () => {
    setValidEnv()
    mockSendMail.mockRejectedValue(Object.assign(new Error('auth failed'), { responseCode: 535 }))
    const { sendEmail } = await import('./EmailService')
    await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' })

    const loggedText = consoleErrorSpy.mock.calls.map((args: unknown[]) => JSON.stringify(args)).join('\n')
    expect(loggedText).not.toContain('super-secret-password-should-never-be-logged')
    expect(loggedText).not.toContain('test-user@example.com')
  })

  it('logEmailError tags the log line with the EmailType, for categorization', async () => {
    setValidEnv()
    mockSendMail.mockRejectedValue(Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }))
    const { sendOTPEmail } = await import('./EmailService')
    await sendOTPEmail('a@b.com', '000000')
    const loggedText = consoleErrorSpy.mock.calls.map((args: unknown[]) => JSON.stringify(args)).join('\n')
    expect(loggedText).toContain('type=otp')
  })

  it('sendOTPEmail HTML-escapes its input (defense-in-depth even for server-generated values)', async () => {
    setValidEnv()
    mockSendMail.mockResolvedValue({ messageId: '<x@brevo.com>' })
    const { sendOTPEmail } = await import('./EmailService')
    await sendOTPEmail('a@b.com', '<script>alert(1)</script>')
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).not.toContain('<script>alert(1)</script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('sendPasswordResetEmail and sendVerificationEmail build distinct subjects and embed the link', async () => {
    setValidEnv()
    mockSendMail.mockResolvedValue({ messageId: '<x@brevo.com>' })
    const { sendPasswordResetEmail, sendVerificationEmail } = await import('./EmailService')

    await sendPasswordResetEmail('a@b.com', 'https://tappyai.com/reset?token=abc')
    const resetCall = mockSendMail.mock.calls[0][0]
    expect(resetCall.subject).toMatch(/mật khẩu/i)
    expect(resetCall.html).toContain('https://tappyai.com/reset?token=abc')

    await sendVerificationEmail('a@b.com', 'https://tappyai.com/verify?token=xyz')
    const verifyCall = mockSendMail.mock.calls[1][0]
    expect(verifyCall.subject).toMatch(/xác thực/i)
    expect(verifyCall.html).toContain('https://tappyai.com/verify?token=xyz')
  })

  describe('team-notification emails (contact/investor/google_startup)', () => {
    it('sendContactEmail routes to EMAIL_FROM when TEAM_EMAIL is unset, with replyTo=submitter', async () => {
      setValidEnv()
      mockSendMail.mockResolvedValue({ messageId: '<x@brevo.com>' })
      const { sendContactEmail } = await import('./EmailService')
      const result = await sendContactEmail({ name: 'Nguyen Van A', email: 'a@example.com', message: 'Hello there' })
      expect(result.success).toBe(true)
      const call = mockSendMail.mock.calls[0][0]
      expect(call.to).toBe('noreply@tappyai.com') // EMAIL_FROM fallback
      expect(call.replyTo).toBe('a@example.com')
      expect(call.subject).toContain('Nguyen Van A')
      expect(call.html).toContain('Nguyen Van A')
    })

    it('sendInvestorEmail routes to TEAM_EMAIL when set, includes company when given', async () => {
      setValidEnv()
      process.env.TEAM_EMAIL = 'team@tappyai.com'
      mockSendMail.mockResolvedValue({ messageId: '<x@brevo.com>' })
      const { sendInvestorEmail } = await import('./EmailService')
      await sendInvestorEmail({ name: 'Jane Doe', email: 'jane@fund.com', company: 'Acme Fund', message: 'Interested' })
      const call = mockSendMail.mock.calls[0][0]
      expect(call.to).toBe('team@tappyai.com')
      expect(call.replyTo).toBe('jane@fund.com')
      expect(call.subject).toContain('Acme Fund')
    })

    it('sendGoogleStartupEmail escapes user-submitted content and sets type for logging', async () => {
      setValidEnv()
      mockSendMail.mockRejectedValue(Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }))
      const { sendGoogleStartupEmail } = await import('./EmailService')
      await sendGoogleStartupEmail({ name: '<b>X</b>', email: 'x@example.com', message: 'line1\nline2' })
      const loggedText = consoleErrorSpy.mock.calls.map((args: unknown[]) => JSON.stringify(args)).join('\n')
      expect(loggedText).toContain('type=google_startup')
    })
  })
})

describe('BrevoSMTPProvider (EmailProvider contract)', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k]
    vi.resetModules()
    mockSendMail.mockReset()
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k]
      else process.env[k] = originalEnv[k]
    }
  })

  it('isConfigured() reflects SMTP env presence', async () => {
    delete process.env.SMTP_HOST
    const { BrevoSMTPProvider } = await import('./providers/BrevoSMTPProvider')
    const provider = new BrevoSMTPProvider()
    expect(provider.isConfigured()).toBe(false)

    setValidEnv()
    expect(provider.isConfigured()).toBe(true)
  })

  it('has a stable id identifying the vendor', async () => {
    const { BrevoSMTPProvider } = await import('./providers/BrevoSMTPProvider')
    expect(new BrevoSMTPProvider().id).toBe('brevo-smtp')
  })

  it('send() resolves with a messageId on success', async () => {
    setValidEnv()
    mockSendMail.mockResolvedValue({ messageId: '<direct@brevo.com>' })
    const { BrevoSMTPProvider } = await import('./providers/BrevoSMTPProvider')
    const provider = new BrevoSMTPProvider()
    const result = await provider.send({ from: 'noreply@tappyai.com', to: 'a@b.com', subject: 'x', html: '<p>x</p>' })
    expect(result).toEqual({ messageId: '<direct@brevo.com>' })
  })

  it('send() throws (does not swallow) on failure — retry/logging is EmailService\'s job, not the provider\'s', async () => {
    setValidEnv()
    mockSendMail.mockRejectedValue(new Error('boom'))
    const { BrevoSMTPProvider } = await import('./providers/BrevoSMTPProvider')
    const provider = new BrevoSMTPProvider()
    await expect(provider.send({ from: 'noreply@tappyai.com', to: 'a@b.com', subject: 'x', html: '<p>x</p>' })).rejects.toThrow('boom')
  })
})
