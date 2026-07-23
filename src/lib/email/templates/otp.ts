import { escapeHtml, wrapTemplate, type BuiltEmail } from './shared'

/** `otp` is displayed verbatim — caller controls format/length. */
export function buildOTPEmail(otp: string): BuiltEmail {
  const safeOtp = escapeHtml(otp)
  const html = wrapTemplate(`
    <p style="font-size:15px;">Mã xác thực (OTP) của bạn là:</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f5f5f5;padding:16px 24px;border-radius:12px;text-align:center;margin:16px 0;">${safeOtp}</div>
    <p style="font-size:13px;color:#888;">Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.</p>
  `)
  return {
    subject: `${otp} là mã xác thực TappyAI của bạn`,
    html,
    text: `Mã xác thực TappyAI của bạn: ${otp} (hết hạn sau 10 phút). Không chia sẻ mã này với bất kỳ ai.`,
  }
}
