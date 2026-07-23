import type { EmailProvider } from './provider'
import { BrevoSMTPProvider } from './providers/BrevoSMTPProvider'
import { buildContactEmail, type ContactEmailInput } from './templates/contact'
import { buildGoogleStartupEmail, type GoogleStartupEmailInput } from './templates/googleStartup'
import { buildInvestorEmail, type InvestorEmailInput } from './templates/investor'
import { buildOTPEmail } from './templates/otp'
import { buildPasswordResetEmail } from './templates/passwordReset'
import { buildVerificationEmail } from './templates/verification'
import type { EmailResult, EmailType, OutgoingEmail, SendEmailOptions } from './types'

export type { EmailType, SendEmailOptions, EmailResult } from './types'
export type { ContactEmailInput } from './templates/contact'
export type { InvestorEmailInput } from './templates/investor'
export type { GoogleStartupEmailInput } from './templates/googleStartup'

// ── Email Platform ───────────────────────────────────────────────────────────
// The single entry point for every email the app sends (routes, forms, auth
// flows). Callers never see a vendor SDK, a transporter, or SMTP config —
// WHICH provider serves a send is resolved behind getProvider(). Mirrors the
// AI Platform's own layering (src/lib/ai/llm/ai.ts): capability layer ->
// provider adapter, nothing else knows the vendor exists.
//
// Security: sendEmail() NEVER throws — every failure (missing config,
// network, SMTP rejection) is caught and returned as { success: false, error }.
// Logging is done through logEmailError(), which allowlists exactly which
// error fields reach console.error (message/code/responseCode/command) — the
// provider/transport config (host/user/pass) is never passed to a logging
// call anywhere in this file, so a future error shape that happens to embed
// the auth object can never leak it through this service.

// ── Provider (lazy singleton — only Brevo today; swap here to change vendor) ─

let provider: EmailProvider | null = null

function getProvider(): EmailProvider {
  if (!provider) provider = new BrevoSMTPProvider()
  return provider
}

function getFromHeader(): string {
  const from = process.env.EMAIL_FROM
  const fromName = process.env.EMAIL_FROM_NAME
  if (!from) throw new Error('[email] Missing SMTP configuration: EMAIL_FROM is required.')
  return fromName ? `"${fromName}" <${from}>` : from
}

/** Recipient for internal notification emails (contact/investor/Google for
 * Startups). TEAM_EMAIL is optional — falls back to EMAIL_FROM (sending the
 * notification to the same address that sends it) so this works out of the
 * box, but a dedicated inbox should be configured before relying on it for
 * real submissions. */
function getTeamRecipient(): string {
  return process.env.TEAM_EMAIL || (process.env.EMAIL_FROM as string)
}

// ── Retry ─────────────────────────────────────────────────────────────────────
// Only network/transient-SMTP failures are retried (connection drops, DNS
// hiccups, 4xx "temporary failure" SMTP codes). A 5xx SMTP response (invalid
// recipient, auth rejected, message refused) is permanent — retrying wastes
// time and can trip the provider's own abuse/rate-limit heuristics for no
// benefit, since the same input will fail the same way every time.
const MAX_RETRIES = 2 // 3 attempts total
const RETRY_BASE_DELAY_MS = 500 // 500ms, 1000ms backoff between attempts

interface SmtpErrorShape {
  code?: string
  responseCode?: number
}

function isRetryableError(err: unknown): boolean {
  const e = err as SmtpErrorShape
  if (e?.code && ['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'EDNS', 'ENOTFOUND'].includes(e.code)) return true
  if (typeof e?.responseCode === 'number') return e.responseCode >= 400 && e.responseCode < 500
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const isLastAttempt = attempt === MAX_RETRIES
      if (isLastAttempt || !isRetryableError(err)) throw err
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
    }
  }
  // Unreachable (the loop always returns or throws), but keeps TS satisfied.
  throw lastError
}

// ── Logging ───────────────────────────────────────────────────────────────────

function logEmailError(type: EmailType, err: unknown): void {
  const e = err as { message?: string; code?: string; responseCode?: number; command?: string }
  // Allowlisted fields only — never the provider/transport object, so
  // SMTP_USER / SMTP_PASS can never reach the logs even if a future error
  // shape embeds them.
  console.error(`[email] send failed (type=${type}):`, {
    message: e?.message,
    code: e?.code,
    responseCode: e?.responseCode,
    command: e?.command,
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Send an arbitrary email. Never throws — check `.success` on the result. */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const type: EmailType = options.type ?? 'plain'
  try {
    const message: OutgoingEmail = {
      from: getFromHeader(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    }
    const info = await withRetry(() => getProvider().send(message))
    return { success: true, messageId: info.messageId }
  } catch (err) {
    logEmailError(type, err)
    return { success: false, error: 'Failed to send email' }
  }
}

/** One-time-password email. `otp` is displayed verbatim — caller controls format/length. */
export async function sendOTPEmail(email: string, otp: string): Promise<EmailResult> {
  const { subject, html, text } = buildOTPEmail(otp)
  return sendEmail({ to: email, subject, html, text, type: 'otp' })
}

/** Password-reset email. `resetLink` must be a pre-built, server-signed URL. */
export async function sendPasswordResetEmail(email: string, resetLink: string): Promise<EmailResult> {
  const { subject, html, text } = buildPasswordResetEmail(resetLink)
  return sendEmail({ to: email, subject, html, text, type: 'password_reset' })
}

/** Email-address verification email. `verifyLink` must be a pre-built, server-signed URL. */
export async function sendVerificationEmail(email: string, verifyLink: string): Promise<EmailResult> {
  const { subject, html, text } = buildVerificationEmail(verifyLink)
  return sendEmail({ to: email, subject, html, text, type: 'verification' })
}

/** Contact-form submission -> team inbox (TEAM_EMAIL, falls back to EMAIL_FROM).
 * replyTo is the submitter, so the team can reply directly. */
export async function sendContactEmail(input: ContactEmailInput): Promise<EmailResult> {
  const { subject, html, text } = buildContactEmail(input)
  return sendEmail({ to: getTeamRecipient(), subject, html, text, replyTo: input.email, type: 'contact' })
}

/** Investor inquiry -> team inbox (TEAM_EMAIL, falls back to EMAIL_FROM).
 * replyTo is the submitter, so the team can reply directly. */
export async function sendInvestorEmail(input: InvestorEmailInput): Promise<EmailResult> {
  const { subject, html, text } = buildInvestorEmail(input)
  return sendEmail({ to: getTeamRecipient(), subject, html, text, replyTo: input.email, type: 'investor' })
}

/** Google for Startups-related inquiry -> team inbox (TEAM_EMAIL, falls back
 * to EMAIL_FROM). replyTo is the submitter, so the team can reply directly. */
export async function sendGoogleStartupEmail(input: GoogleStartupEmailInput): Promise<EmailResult> {
  const { subject, html, text } = buildGoogleStartupEmail(input)
  return sendEmail({ to: getTeamRecipient(), subject, html, text, replyTo: input.email, type: 'google_startup' })
}
