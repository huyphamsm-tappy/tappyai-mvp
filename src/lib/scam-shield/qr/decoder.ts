import { sniffImageType } from '@/lib/security/imageType'
import { QR_MAX_SIZE_BYTES } from '../config'

export interface QrDecodeResult {
  success: boolean
  text?: string
  url?: URL
  error?: string
}

export async function decodeQrImage(buffer: Uint8Array): Promise<QrDecodeResult> {
  if (buffer.byteLength > QR_MAX_SIZE_BYTES) {
    return { success: false, error: 'Image exceeds 5 MB size limit' }
  }

  const imageType = sniffImageType(buffer)
  if (!imageType) {
    return { success: false, error: 'Invalid image format (accepted: JPEG, PNG, WebP, GIF)' }
  }

  try {
    const sharpModule = await import('sharp')
    const sharpFn = sharpModule.default
    const { data, info } = await sharpFn(Buffer.from(buffer))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { decodeQR } = await import('qr/decode.js')
    const decoded = decodeQR({
      height: info.height,
      width: info.width,
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    })

    if (!decoded) {
      return { success: false, error: 'No QR code found in image' }
    }

    const text = typeof decoded === 'string' ? decoded : String(decoded)

    try {
      const url = new URL(text)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { success: true, text, url }
      }
    } catch {
      // Not a URL
    }

    return { success: true, text }
  } catch {
    return { success: false, error: 'Failed to decode QR code' }
  }
}
