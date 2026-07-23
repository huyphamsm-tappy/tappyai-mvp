import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailProvider } from '../provider'
import type { OutgoingEmail } from '../types'

// ── Brevo SMTP adapter ────────────────────────────────────────────────────────
// THE ONLY file in the codebase allowed to import nodemailer or read
// SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS. Everything Brevo/SMTP-specific —
// connection options, TLS mode selection — is contained here. Mirrors
// providers/claude.ts in the AI Platform: one adapter, one vendor, nothing
// else in the codebase needs to know it exists.
//
// Configuration (all required):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

const CONNECTION_TIMEOUT_MS = 10_000
const GREETING_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 20_000

export class BrevoSMTPProvider implements EmailProvider {
  readonly id = 'brevo-smtp'

  private transporter: Transporter | null = null

  isConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS)
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter

    const host = process.env.SMTP_HOST
    const port = process.env.SMTP_PORT
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    if (!host || !port || !user || !pass) {
      // Names only — never values — even in a config error.
      throw new Error('[email] Missing SMTP configuration: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS are all required.')
    }
    const portNum = Number(port)
    if (!Number.isFinite(portNum)) {
      throw new Error('[email] SMTP_PORT must be a valid number.')
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: portNum,
      // Brevo: 465 = implicit TLS, 587/2525 = STARTTLS (secure:false, negotiated after connect).
      secure: portNum === 465,
      auth: { user, pass },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    })
    return this.transporter
  }

  async send(message: OutgoingEmail): Promise<{ messageId: string }> {
    const transport = this.getTransporter()
    const info = await transport.sendMail(message)
    return { messageId: info.messageId }
  }
}
