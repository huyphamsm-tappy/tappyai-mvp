import { escapeHtml, wrapTemplate, type BuiltEmail } from './shared'

/** `verifyLink` must be a pre-built, server-signed URL. */
export function buildVerificationEmail(verifyLink: string): BuiltEmail {
  const safeLink = escapeHtml(verifyLink)
  const html = wrapTemplate(`
    <p style="font-size:15px;">Xác thực địa chỉ email để hoàn tất thiết lập tài khoản TappyAI.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${safeLink}" style="display:inline-block;background:#FF6B35;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;">Xác thực email</a>
    </p>
    <p style="font-size:13px;color:#888;">Nếu bạn không tạo tài khoản này, hãy bỏ qua email.</p>
  `)
  return {
    subject: 'Xác thực email TappyAI của bạn',
    html,
    text: `Xác thực email TappyAI của bạn: ${verifyLink}\n\nNếu bạn không tạo tài khoản này, hãy bỏ qua email.`,
  }
}
