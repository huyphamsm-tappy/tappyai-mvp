// PAYMENTS — "payment received" e-mail through Brevo's transactional API.
//
// The app had no mail sender (Brevo SMTP is only Supabase Auth's SMTP). This is the smallest one:
// one HTTPS call, no new dependency. `BREVO_API_KEY` + `PAYMENTS_MAIL_FROM` unset ⇒ no mail, no
// error. It NEVER throws and gives up after 5 s: a mail problem must not fail the webhook.

import { PLAN_CONFIG, type PaidPlanId } from '@/lib/plans/planConfig'
import { DEEP_RESEARCH_MONTHLY, tierOf } from '@/lib/plans/tiers'

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
  /** `partial` = money received but below the price (nothing granted yet); `extra` = a transfer on an already paid order. Default: the plan was granted. */
  kind?: 'paid' | 'partial' | 'extra'
  /** partial: what is still missing. */
  shortVnd?: number
  /** paid/extra: extra days given for money above the price (never a refund). */
  bonusDays?: number
}

/** Seconds of extra time → whole days shown to the payer (rounded down; the exact seconds are in the database). */
export function bonusDaysOf(seconds: number | null | undefined): number {
  return Math.floor(Math.max(0, seconds ?? 0) / 86_400)
}

export function paymentMailContent(m: PaymentMail): { subject: string; text: string; html: string } {
  const name = PLAN_CONFIG[m.plan].label
  const until = m.expiresAt ? formatDateVi(m.expiresAt) : null
  if (m.kind === 'partial') {
    const partialLines = [
      `Tappy đã nhận ${formatVnd(m.amountVnd)} cho gói ${name} (mã đơn ${m.code}), nhưng chưa đủ giá gói.`,
      `Bạn chỉ cần chuyển thêm ${formatVnd(m.shortVnd ?? 0)} với đúng nội dung ${m.code}. Số tiền đã chuyển được giữ lại, gói sẽ tự kích hoạt ngay khi đủ — không cần liên hệ ai và không bị mất tiền.`,
    ]
    const escP = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return { subject: `Tappy: còn thiếu ${formatVnd(m.shortVnd ?? 0)} để kích hoạt gói ${name}`, text: partialLines.join('\n\n'), html: partialLines.map((l) => `<p>${escP(l)}</p>`).join('') }
  }
  const subject = m.kind === 'extra' ? `Tappy: đã cộng thêm thời gian cho gói ${name}` : `Tappy: bạn đã là thành viên ${name}`
  const bonusLine = m.bonusDays && m.bonusDays > 0
    ? `Bạn chuyển dư so với giá gói nên Tappy cộng thêm ${m.bonusDays} ngày sử dụng (theo đúng giá gói). Không có khoản nào phải hoàn lại.`
    : ''
  const lines = [
    `Cảm ơn bạn! Tappy đã nhận ${formatVnd(m.amountVnd)} cho gói ${name} (mã đơn ${m.code}).`,
    until ? `Gói của bạn có hiệu lực đến hết ngày ${until}.` : '',
    bonusLine,
    // Owner 01/11/2026: accounts ask without a limit (the daily number in PLAN_CONFIG is only the hidden anti-abuse ceiling).
    // Owner 20/11/2026: ONE allowance of Deep Research reports a month (no kinds are named to the person).
    `Bạn hỏi AI không giới hạn, có Suy nghĩ, Tìm web và ${DEEP_RESEARCH_MONTHLY[tierOf(m.plan)]} lượt Nghiên cứu sâu mỗi tháng.`,
    'Nếu bạn không thực hiện giao dịch này, hãy trả lời thư này để được hỗ trợ.',
  ].filter(Boolean)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return { subject, text: lines.join('\n\n'), html: lines.map((l) => `<p>${esc(l)}</p>`).join('') }
}

/**
 * Keep-alive for the Brevo key (owner 25/11/2026): Brevo disables an API key that sees no call for 90 days, and payment
 * mails are only sent when someone pays. One read-only call to the account endpoint (no mail, no cost) counts as use.
 * Called by the daily subscriptions-expire cron. Never throws; key unset ⇒ 'skipped'; a non-2xx (e.g. 401 = key disabled) ⇒ 'failed'.
 */
export async function pingBrevo(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<'ok' | 'skipped' | 'failed'> {
  const apiKey = env.BREVO_API_KEY?.trim()
  if (!apiKey) return 'skipped'
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: { 'api-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
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
