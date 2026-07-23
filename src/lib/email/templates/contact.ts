import { escapeHtml, escapeHtmlMultiline, wrapInternalNotificationTemplate, type BuiltEmail } from './shared'

export interface ContactEmailInput {
  name: string
  email: string
  message: string
}

// Owner note: copy is a reasonable default for "Contact Us form -> team inbox"
// — confirm wording/recipient (TEAM_EMAIL) before wiring a real public form to it.
export function buildContactEmail(input: ContactEmailInput): BuiltEmail {
  const name = escapeHtml(input.name)
  const email = escapeHtml(input.email)
  const message = escapeHtmlMultiline(input.message)
  const html = wrapInternalNotificationTemplate(`
    <p style="font-size:15px;">Có yêu cầu liên hệ mới từ website TappyAI:</p>
    <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:4px 8px 4px 0;color:#888;">Tên</td><td style="padding:4px 0;">${name}</td></tr>
      <tr><td style="padding:4px 8px 4px 0;color:#888;">Email</td><td style="padding:4px 0;">${email}</td></tr>
    </table>
    <div style="font-size:14px;background:#f5f5f5;padding:16px;border-radius:10px;">${message}</div>
  `)
  return {
    subject: `[Liên hệ] Tin nhắn mới từ ${input.name}`,
    html,
    text: `Liên hệ mới từ ${input.name} (${input.email}):\n\n${input.message}`,
  }
}
