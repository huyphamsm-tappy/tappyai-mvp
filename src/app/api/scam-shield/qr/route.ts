import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { dailyRateLimit, clientIp, rateLimit } from '@/lib/security/rateLimit'
import { SCAM_SHIELD_DAILY_LIMIT_AUTH, SCAM_SHIELD_DAILY_LIMIT_ANON } from '@/lib/config/product'
import { checkQr } from '@/lib/scam-shield'
import { CHECK_RATE_LIMIT_WINDOW_MS, CHECK_RATE_LIMIT_MAX, QR_MAX_SIZE_BYTES } from '@/lib/scam-shield/config'

export const maxDuration = 15

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`ss:${ip}`, CHECK_RATE_LIMIT_MAX, CHECK_RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Too many checks. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { user } = await getRequestUser(req)
  const dailyLimit = user ? SCAM_SHIELD_DAILY_LIMIT_AUTH : SCAM_SHIELD_DAILY_LIMIT_ANON
  const dailyKey = user ? `ss:daily:${user.id}` : `ss:daily:anon:${ip}`

  if (!dailyRateLimit(dailyKey, dailyLimit).ok) {
    return NextResponse.json(
      { error: 'daily_limit', message: 'Daily check limit reached.' },
      { status: 429 },
    )
  }

  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > QR_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'Image exceeds 5 MB size limit' },
      { status: 413 },
    )
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data') && !contentType.startsWith('application/octet-stream')) {
    return NextResponse.json(
      { error: 'invalid_content_type', message: 'Expected multipart/form-data or binary image' },
      { status: 400 },
    )
  }

  try {
    let imageBuffer: Uint8Array

    if (contentType.startsWith('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('image')
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: 'no_image', message: 'No image file provided' },
          { status: 400 },
        )
      }
      if (file.size > QR_MAX_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'too_large', message: 'Image exceeds 5 MB size limit' },
          { status: 413 },
        )
      }
      imageBuffer = new Uint8Array(await file.arrayBuffer())
    } else {
      const arrayBuffer = await req.arrayBuffer()
      if (arrayBuffer.byteLength > QR_MAX_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'too_large', message: 'Image exceeds 5 MB size limit' },
          { status: 413 },
        )
      }
      imageBuffer = new Uint8Array(arrayBuffer)
    }

    const result = await checkQr(imageBuffer)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'QR check failed'
    const rawQrText = (err as { qrText?: string })?.qrText
    const qrText = rawQrText ? rawQrText.slice(0, 100) : undefined

    if (message.includes('does not contain a URL')) {
      return NextResponse.json(
        { error: 'qr_no_url', message: 'QR code does not contain a link', qrText },
        { status: 400 },
      )
    }
    if (message.includes('decode') || message.includes('QR')) {
      return NextResponse.json(
        { error: 'qr_decode_failed', message: 'Could not read QR code' },
        { status: 400 },
      )
    }
    console.error('[scam-shield] qr error:', message)
    return NextResponse.json(
      { error: 'check_failed', message: 'Could not check QR code' },
      { status: 500 },
    )
  }
}
