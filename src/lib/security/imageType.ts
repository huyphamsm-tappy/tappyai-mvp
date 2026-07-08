// Magic-byte sniffing for uploaded media. Never trust a client-supplied
// `File.type` or filename extension — an attacker can label an SVG/HTML file as
// `image/jpeg` to get stored-XSS or a wrong content-type served back. We read
// the real leading bytes and only accept a known raster/video signature.

export type SniffedImage = 'jpeg' | 'png' | 'webp' | 'gif'
export type SniffedVideo = 'mp4' | 'webm' | 'quicktime'

function bytesAt(buf: Uint8Array, offset: number, sig: number[]): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false
  }
  return true
}

// Returns the real image type from the leading bytes, or null if it isn't one
// of the safe raster formats (SVG, HTML, PDF, etc. all return null).
export function sniffImageType(buf: Uint8Array): SniffedImage | null {
  if (bytesAt(buf, 0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (bytesAt(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (bytesAt(buf, 0, [0x47, 0x49, 0x46, 0x38])) return 'gif' // "GIF8"
  // WebP: "RIFF"...."WEBP"
  if (bytesAt(buf, 0, [0x52, 0x49, 0x46, 0x46]) && bytesAt(buf, 8, [0x57, 0x45, 0x42, 0x50])) return 'webp'
  return null
}

const IMAGE_MIME: Record<SniffedImage, string> = {
  jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
}
export const imageExt = (t: SniffedImage): string => (t === 'jpeg' ? 'jpg' : t)
export const imageMime = (t: SniffedImage): string => IMAGE_MIME[t]

// Returns the real container type for common web video, or null otherwise.
export function sniffVideoType(buf: Uint8Array): SniffedVideo | null {
  // ISO-BMFF (mp4 / mov): bytes 4-7 are "ftyp"; the brand at 8-11 tells them apart.
  if (bytesAt(buf, 4, [0x66, 0x74, 0x79, 0x70])) {
    if (bytesAt(buf, 8, [0x71, 0x74, 0x20, 0x20])) return 'quicktime' // "qt  "
    return 'mp4'
  }
  // WebM / Matroska EBML header.
  if (bytesAt(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm'
  return null
}

const VIDEO_MIME: Record<SniffedVideo, string> = {
  mp4: 'video/mp4', webm: 'video/webm', quicktime: 'video/quicktime',
}
export const videoExt = (t: SniffedVideo): string => (t === 'quicktime' ? 'mov' : t)
export const videoMime = (t: SniffedVideo): string => VIDEO_MIME[t]
