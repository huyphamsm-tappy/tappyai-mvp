// ── Email Platform — shared types ────────────────────────────────────────────
// Business code (routes, forms) imports ONLY from '@/lib/email/EmailService'.
// Nothing here (or anywhere outside providers/*) may reference a concrete
// vendor SDK — mirrors the AI Platform's own provider-neutral contract
// (src/lib/ai/llm/types.ts).

/** Every category of email this app sends. Purely a classification label for
 * logging (see EmailService's logEmailError) — it never changes HOW an email
 * is sent, only how it's labeled when something goes wrong. */
export type EmailType =
  | 'plain'
  | 'otp'
  | 'password_reset'
  | 'verification'
  | 'contact'
  | 'investor'
  | 'google_startup'

/** Caller-facing options for EmailService.sendEmail(). No `from` field — the
 * sender identity is a config concern (EMAIL_FROM/EMAIL_FROM_NAME), resolved
 * by EmailService itself, never chosen by the caller. */
export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  type?: EmailType
}

export interface EmailResult {
  success: boolean
  messageId?: string
  /** Generic, caller-safe message — never a raw SMTP/server error string. */
  error?: string
}

/** The fully-resolved message a provider actually transmits. `from` is added
 * by EmailService (read from EMAIL_FROM/EMAIL_FROM_NAME) — the one field an
 * EmailProvider receives that a SendEmailOptions caller never supplies. */
export interface OutgoingEmail {
  from: string
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}
