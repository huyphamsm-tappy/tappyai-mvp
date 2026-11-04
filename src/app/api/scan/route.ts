import { AI } from '@/lib/ai/llm'
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseWithoutAiConsent } from '@/lib/ai/consent/aiConsentGuard'
import { clientIpKey } from '@/lib/security/rateLimit'
import { publicDailyRateLimit } from '@/lib/security/publicRateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// Daily cap via the shared limiter (lib/security/rateLimit) — one implementation
// for every daily-capped route instead of per-route Maps.
const DAILY_SCAN_LIMIT = 20
// A 10M-character base64 image plus the JSON around it.
const MAX_BODY_BYTES = 10_500_000
/** Vision calls a day across ALL callers (SCAN_GLOBAL_DAILY overrides); past it the endpoint answers 429 until tomorrow. */
const globalDailyScans = (): number => (Number(process.env.SCAN_GLOBAL_DAILY) > 0 ? Number(process.env.SCAN_GLOBAL_DAILY) : 3000)

export async function POST(req: NextRequest) {
  // Security audit 04/11 (W-03): an oversized body is refused before it is read; the per-caller cap keys an IPv6 caller by its /64 (not by
  // address); and a global daily ceiling bounds the vision spend whoever the callers are.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge6', requestLocale(req)) }, { status: 413 })
  }
  // P1-5: shared across instances when a store is configured (production is), in-process
  // otherwise. Unauthenticated VISION calls are the most expensive per-request path in the app.
  if (!(await publicDailyRateLimit(`scan:${clientIpKey(req)}`, DAILY_SCAN_LIMIT)).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.scanLimit', requestLocale(req), { n: DAILY_SCAN_LIMIT }) }, { status: 429 })
  }
  if (!(await publicDailyRateLimit('scan:global', globalDailyScans())).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.retryTomorrow', requestLocale(req)) }, { status: 429 })
  }

  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  let imageBase64: string, mimeType: string
  try {
    const body = await req.json()
    imageBase64 = body.imageBase64
    // Constrain the client-supplied mimeType to an image allowlist before it
    // reaches the vision model; anything else falls back to JPEG.
    mimeType = ALLOWED_MIME.includes(body.mimeType) ? body.mimeType : 'image/jpeg'
    if (!imageBase64) throw new Error('missing image')
    // Strip data URL prefix if present
    if (imageBase64.includes(',')) imageBase64 = imageBase64.split(',')[1]
    // 8MB base64 limit (~6MB binary)
    if (imageBase64.length > 10_000_000) {
      return NextResponse.json({ error: 'image_too_large', message: serverMessage('media.imageTooLarge6', requestLocale(req)) }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  // App Review 5.1.2(i): a signed-in iOS-used account sends its image only with a current agreement. Signed-out
  // callers have no account to check (see aiConsentGuard notes).
  const { user } = await getRequestUser(req).catch(() => ({ user: null }))
  if (user) {
    const aiConsentRefusal = await refuseWithoutAiConsent(user.id, requestLocale(req))
    if (aiConsentRefusal) return aiConsentRefusal
  }

  try {
    const { text } = await AI.vision({
      image: imageBase64,
      mimeType,
      prompt: 'Hãy trích xuất toàn bộ văn bản (text) trong ảnh này một cách chính xác và đầy đủ nhất có thể. Giữ nguyên định dạng đoạn văn, xuống dòng, và thứ tự đọc tự nhiên (từ trái sang phải, từ trên xuống dưới). Chỉ trả về nội dung văn bản trích xuất được — không thêm giải thích, không thêm nhận xét. Nếu ảnh không chứa văn bản, trả lời: "Không tìm thấy văn bản trong ảnh."',
      maxTokens: 2048,
    })
    return NextResponse.json({ text: text.trim() })
  } catch {
    return NextResponse.json({ error: 'scan_failed', message: serverMessage('scan.readFailed', requestLocale(req)) }, { status: 500 })
  }
}
