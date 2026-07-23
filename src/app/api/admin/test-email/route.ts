// POST /api/admin/test-email — admin-only utility to verify SMTP configuration
// by sending a real test email through EmailService. Handler contract: RBAC ->
// same-origin -> rate-limit -> validate -> service -> uniform {data} envelope
// (21_Coding_Standards §2, same shape as /api/admin/analytics/*). Not a public
// endpoint — sending email is a real side effect with a real cost, so this is
// gated the same way any other admin mutation is, not a bare test script.
//
// contact/investor/google_startup deliberately build their template directly
// and send to the admin-provided `to` — a template/delivery smoke test, not a
// real form submission (which would go to TEAM_EMAIL instead).

import { z } from 'zod'
import { requireAdminRole, adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { rateLimit } from '@/lib/security/rateLimit'
import { sendEmail, sendOTPEmail, sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email/EmailService'
import { buildContactEmail } from '@/lib/email/templates/contact'
import { buildInvestorEmail } from '@/lib/email/templates/investor'
import { buildGoogleStartupEmail } from '@/lib/email/templates/googleStartup'

export const dynamic = 'force-dynamic'

const TestEmailSchema = z.object({
  to: z.string().email(),
  type: z.enum(['plain', 'otp', 'password_reset', 'verification', 'contact', 'investor', 'google_startup']).default('plain'),
})

export async function POST(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'admin')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:test-email:${user.id}`, 5, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const body = await req.json().catch(() => null)
    const parsed = TestEmailSchema.safeParse(body)
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request body', 422)
    }
    const { to, type } = parsed.data
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tappyai.com'

    const testContact = { name: 'Test User', email: 'test@example.com', message: 'This is a test message sent from the admin test-email endpoint.' }

    const result = await (
      type === 'otp' ? sendOTPEmail(to, '123456') :
      type === 'password_reset' ? sendPasswordResetEmail(to, `${siteUrl}/reset-password?token=test-token`) :
      type === 'verification' ? sendVerificationEmail(to, `${siteUrl}/verify-email?token=test-token`) :
      type === 'contact' ? sendEmail({ ...buildContactEmail(testContact), to, type: 'contact' }) :
      type === 'investor' ? sendEmail({ ...buildInvestorEmail({ ...testContact, company: 'Test Co.' }), to, type: 'investor' }) :
      type === 'google_startup' ? sendEmail({ ...buildGoogleStartupEmail(testContact), to, type: 'google_startup' }) :
      sendEmail({ to, subject: 'TappyAI SMTP test', html: '<p>This is a test email from TappyAI\'s EmailService.</p>', text: 'This is a test email from TappyAI\'s EmailService.' })
    )

    if (!result.success) return adminError('EMAIL_SEND_FAILED', result.error ?? 'Failed to send email', 502)
    return Response.json({ data: { sent: true, messageId: result.messageId, type, to } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
