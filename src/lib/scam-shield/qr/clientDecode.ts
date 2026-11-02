// QR decoding in the BROWSER (owner 02/10, privacy rule shared by web, Android and iOS): the picture never leaves the device. The decoded
// text — and only a decoded http(s) link, via the existing /api/scam-shield/check — is all that goes further. Same decoder package
// (`qr`, pure JS) as the server route, which stays for older clients but is no longer called by the web UI.

export interface RgbaImage { width: number; height: number; data: Uint8Array | Uint8ClampedArray }
export type QrDecodeOutcome = { ok: true; text: string } | { ok: false; reason: 'no_qr' | 'unreadable' }

/** Decode from raw RGBA pixels. Exported for tests (no canvas needed). */
export async function decodeQrFromPixels(img: RgbaImage): Promise<string | null> {
  const { decodeQR } = await import('qr/decode.js')
  try {
    const out = decodeQR({ width: img.width, height: img.height, data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength) })
    return out ? String(out) : null
  } catch {
    return null
  }
}

const SIZES = [1600, 1000, 640] // a phone photo is big; QR finders work better after a downscale, so try a few

export async function decodeQrFromFile(file: File): Promise<QrDecodeOutcome> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  try {
    for (const max of SIZES) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return { ok: false, reason: 'unreadable' }
      ctx.drawImage(bitmap, 0, 0, w, h)
      const text = await decodeQrFromPixels(ctx.getImageData(0, 0, w, h))
      if (text) return { ok: true, text }
    }
    return { ok: false, reason: 'no_qr' }
  } finally {
    bitmap.close?.()
  }
}
