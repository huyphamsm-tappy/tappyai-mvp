import { escapeHtml, escapeHtmlMultiline, wrapInternalNotificationTemplate, type BuiltEmail } from './shared'

export interface InvestorEmailInput {
  name: string
  email: string
  company?: string
  message: string
}

// Owner note: copy is a reasonable default for "Investor inquiry -> team
// inbox" — confirm wording/recipient (TEAM_EMAIL) before wiring a real form.
export function buildInvestorEmail(input: InvestorEmailInput): BuiltEmail {
  const name = escapeHtml(input.name)
  const email = escapeHtml(input.email)
  const company = input.company ? escapeHtml(input.company) : null
  const message = escapeHtmlMultiline(input.message)
  const html = wrapInternalNotificationTemplate(`
    <p style="font-size:15px;">Có yêu cầu liên hệ từ nhà đầu tư tiềm năng:</p>
    <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:4px 8px 4px 0;color:#888;">Tên</td><td style="padding:4px 0;">${name}</td></tr>
      <tr><td style="padding:4px 8px 4px 0;color:#888;">Email</td><td style="padding:4px 0;">${email}</td></tr>
      ${company ? `<tr><td style="padding:4px 8px 4px 0;color:#888;">Đơn vị</td><td style="padding:4px 0;">${company}</td></tr>` : ''}
    </table>
    <div style="font-size:14px;background:#f5f5f5;padding:16px;border-radius:10px;">${message}</div>
  `)
  return {
    subject: `[Investor] Yêu cầu từ ${input.name}${input.company ? ` (${input.company})` : ''}`,
    html,
    text: `Yêu cầu nhà đầu tư từ ${input.name} (${input.email})${input.company ? `, ${input.company}` : ''}:\n\n${input.message}`,
  }
}
