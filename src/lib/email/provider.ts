import type { OutgoingEmail } from './types'

// ── Email Provider adapter contract ──────────────────────────────────────────
// One adapter per vendor, living in providers/<Name>Provider.ts. An adapter is
// the ONLY code allowed to import a vendor SDK (e.g. nodemailer), know
// transport-level config (SMTP host/port/credentials), or apply vendor-
// specific connection options. EmailService drives all sends through this
// neutral interface, so adding a provider is just: implement `send` +
// `isConfigured`, register it in EmailService — no caller changes.
//
// Deliberately thin: `send` either resolves with a messageId or throws. Retry
// classification, timeouts-as-policy, and safe error logging are orchestration
// concerns that live in EmailService, not here — mirrors how the AI
// Platform's AIProvider never retries or logs, only resolves a model
// (src/lib/ai/llm/provider.ts).
export interface EmailProvider {
  readonly id: string

  /** True when this provider's credentials are present in the environment. */
  isConfigured(): boolean

  /** Send one fully-resolved message. Resolves with the provider's message id,
   * or throws (network/timeout/SMTP rejection) — EmailService is responsible
   * for retrying and translating a throw into a safe EmailResult. */
  send(message: OutgoingEmail): Promise<{ messageId: string }>
}
