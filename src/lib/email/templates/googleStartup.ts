import { escapeHtml, escapeHtmlMultiline, wrapInternalNotificationTemplate, type BuiltEmail } from './shared'

export interface GoogleStartupEmailInput {
  name: string
  email: string
  message: string
}

// Owner note: content/audience for "Google for Startups"-related mail is not
// yet specified — this is a reasonable placeholder shape (same "inquiry ->
// team inbox" pattern as contact/investor). Confirm actual copy, recipient
// (TEAM_EMAIL), and whether this should instead target Google's own program
// contact before using it for a real submission.
export function buildGoogleStartupEmail(input: GoogleStartupEmailInput): BuiltEmail {
  const name = escapeHtml(input.name)
  const email = escapeHtml(input.email)
  const message = escapeHtmlMultiline(input.message)
  const html = wrapInternalNotificationTemplate(`
    <p style="font-size:15px;">Yêu cầu liên quan đến chương trình Google for Startups:</p>
    <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:4px 8px 4px 0;color:#888;">Tên</td><td style="padding:4px 0;">${name}</td></tr>
      <tr><td style="padding:4px 8px 4px 0;color:#888;">Email</td><td style="padding:4px 0;">${email}</td></tr>
    </table>
    <div style="font-size:14px;background:#f5f5f5;padding:16px;border-radius:10px;">${message}</div>
  `)
  return {
    subject: `[Google for Startups] Yêu cầu từ ${input.name}`,
    html,
    text: `Yêu cầu Google for Startups từ ${input.name} (${input.email}):\n\n${input.message}`,
  }
}
