// ── Shared template helpers ──────────────────────────────────────────────────
// Email HTML needs inline styles regardless of what generates it (email
// clients ignore/strip <style> blocks and classes) — no template engine here,
// just small composable string builders.

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escaped text with newlines turned into <br/> — for user-submitted
 * multi-line content (contact/investor form messages). */
export function escapeHtmlMultiline(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br/>')
}

export function wrapTemplate(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <div style="font-size:20px;font-weight:800;color:#FF6B35;margin-bottom:16px;">TappyAI</div>
    ${bodyHtml}
    <p style="font-size:12px;color:#999;margin-top:32px;">Email này được gửi tự động từ TappyAI. Vui lòng không trả lời email này.</p>
  </div>`
}

/** Same wrapper, but for internal team-notification emails (contact/investor/
 * Google-for-Startups) where a reply IS expected (replyTo is set to the
 * submitter) — the "don't reply" footer would be actively wrong there. */
export function wrapInternalNotificationTemplate(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <div style="font-size:20px;font-weight:800;color:#FF6B35;margin-bottom:16px;">TappyAI — Thông báo nội bộ</div>
    ${bodyHtml}
  </div>`
}
