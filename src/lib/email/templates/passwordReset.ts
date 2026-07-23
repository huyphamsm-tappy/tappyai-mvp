import { escapeHtml, wrapTemplate, type BuiltEmail } from './shared'

/** `resetLink` must be a pre-built, server-signed URL. */
export function buildPasswordResetEmail(resetLink: string): BuiltEmail {
  const safeLink = escapeHtml(resetLink)
  const html = wrapTemplate(`
    <p style="font-size:15px;">Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản TappyAI này.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${safeLink}" style="display:inline-block;background:#FF6B35;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;">Đặt lại mật khẩu</a>
    </p>
    <p style="font-size:13px;color:#888;">Nếu bạn không yêu cầu điều này, hãy bỏ qua email — mật khẩu của bạn sẽ không thay đổi.</p>
  `)
  return {
    subject: 'Đặt lại mật khẩu TappyAI',
    html,
    text: `Đặt lại mật khẩu TappyAI của bạn: ${resetLink}\n\nNếu bạn không yêu cầu điều này, hãy bỏ qua email.`,
  }
}
