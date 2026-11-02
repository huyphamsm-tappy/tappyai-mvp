// PAYMENTS — "payment received" e-mail through Brevo's transactional API.
//
// The app had no mail sender (Brevo SMTP is only Supabase Auth's SMTP). This is the smallest one:
// one HTTPS call, no new dependency. `BREVO_API_KEY` + `PAYMENTS_MAIL_FROM` unset ⇒ no mail, no
// error. It NEVER throws and gives up after 5 s: a mail problem must not fail the webhook.

import { PLAN_CONFIG, type PaidPlanId } from '@/lib/plans/planConfig'

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 5_000

export function formatVnd(n: number): string {
  return `${n.toLocaleString('vi-VN')}đ`
}

export function formatDateVi(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export interface PaymentMail {
  to: string
  plan: PaidPlanId
  amountVnd: number
  code: string
  expiresAt: string | null
}

export function paymentMailContent(m: PaymentMail): { subject: string; text: string; html: string } {
  const name = PLAN_CONFIG[m.plan].label
  const until = m.expiresAt ? formatDateVi(m.expiresAt) : null
  const subject = `Tappy: bạn đã là thành viên ${name}`
  const lines = [
    `Cảm ơn bạn! Tappy đã nhận ${formatVnd(m.amountVnd)} cho gói ${name} (mã đơn ${m.code}).`,
    until ? `Gói của bạn có hiệu lực đến hết ngày ${until}.` : '',
    `Bạn có ${PLAN_CONFIG[m.plan].aiQuota.limit} câu hỏi AI mỗi ngày.`,
    'Nếu bạn không thực hiện giao dịch này, hãy trả lời thư này để được hỗ trợ.',
  ].filter(Boolean)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return { subject, text: lines.join('\n\n'), html: lines.map((l) => `<p>${esc(l)}</p>`).join('') }
}

export async function sendPaymentMail(
  m: PaymentMail,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<'sent' | 'skipped' | 'failed'> {
  const apiKey = env.BREVO_API_KEY?.trim()
  const from = env.PAYMENTS_MAIL_FROM?.trim()
  if (!apiKey || !from || !m.to) return 'skipped'
  try {
    const { subject, text, html } = paymentMailContent(m)
    const res = await fetchImpl(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: from, name: 'Tappy AI' }, to: [{ email: m.to }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
