import sharp from 'sharp'
import type { SniffedImage } from '@/lib/security/imageType'

// ── R-2 (2026-09-24): uploaded photos must not carry the place they were taken ───────────────
//
// 🚨 WHAT WAS SHIPPING. Every server upload path — review photos, avatars, profile covers —
// passed the caller's bytes to `putMedia` untouched, and the object store serves them back
// publicly. A phone's camera roll JPEG carries an EXIF block, and that block routinely carries
// GPSLatitude/GPSLongitude to a few metres, plus the capture timestamp, the device serial on
// some makes, and any XMP the editing app left behind. Posting a photo of your lunch published
// your home address if you had ever cropped it at home. Magic-byte sniffing already ran here and
// is untouched — it answers "is this really a JPEG", which is a different question from "what
// does this JPEG say about you".
//
// 🔑 RE-ENCODE, DO NOT EDIT. sharp drops every metadata block unless `withMetadata()` asks for
// it back, so the safe path is to decode and re-encode and never call that method. Editing the
// EXIF in place would mean enumerating the tags that matter, and the next format or the next
// camera adds one we did not list.
//
// 🚨 `.rotate()` WITH NO ARGUMENT IS THE WHOLE REASON THE PICTURE STAYS UPRIGHT. Orientation
// lives in EXIF (`Orientation`, values 1-8): the pixels of a portrait phone photo are stored
// landscape and the viewer turns them. Strip EXIF without applying it and every such photo
// appears rotated 90°. Called with no argument, `rotate()` bakes the EXIF orientation into the
// pixels and then the tag is gone with the rest — the image looks identical and says nothing.
//
// 🚨 GIF IS PASSED THROUGH, AND THAT IS NOT AN OVERSIGHT. The GIF89a spec has no EXIF block and
// therefore no GPS: there is nothing of this kind to strip. Re-encoding one would only risk
// breaking an animation for no privacy gain. JPEG, PNG and WebP can all carry EXIF/XMP and are
// all re-encoded.
//
// Animated WebP survives: `animated: true` decodes every frame and the WebP encoder writes them
// all back. A still image is unaffected by the flag.

/** Formats that can carry EXIF/XMP, and therefore GPS. GIF cannot. */
const REENCODED: readonly SniffedImage[] = ['jpeg', 'png', 'webp']

/** The APP1 payload marker sharp returns ahead of the TIFF header. */
const EXIF_MARKER = 'Exif\u0000\u0000'

export interface StripResult {
  bytes: Buffer
  /** False when the format carries no metadata container and the bytes are the caller's own. */
  reencoded: boolean
}

/**
 * Returns the image with every metadata block removed and its visible orientation preserved.
 *
 * `kind` is the MAGIC-BYTE result, never the client's declared type, and it also decides the
 * output format — so the stored object is still the type the sniffer approved and the
 * content-type the route sets stays true.
 *
 * Throws when the bytes cannot be decoded. Callers treat that as a rejected upload: a payload
 * that passed the signature check but cannot be decoded is not an image we should be storing,
 * and silently falling back to the original bytes would reopen exactly the hole this closes.
 */
export async function stripImageMetadata(input: Buffer | Uint8Array, kind: SniffedImage): Promise<StripResult> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (!REENCODED.includes(kind)) return { bytes, reencoded: false }

  // `animated` keeps multi-frame WebP whole; for JPEG and PNG it changes nothing.
  const pipeline = sharp(bytes, { animated: kind === 'webp' }).rotate()

  const out =
    kind === 'jpeg' ? await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    : kind === 'png' ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline.webp({ quality: 90 }).toBuffer()

  return { bytes: out, reencoded: true }
}

/**
 * True when the bytes still carry an EXIF, XMP or IPTC block.
 *
 * Used by the tests and by the audit script over already-stored objects. It reads only the
 * container, never the pixels, so it is cheap enough to run over a whole bucket listing.
 */
export async function hasImageMetadata(input: Buffer | Uint8Array): Promise<boolean> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const meta = await sharp(bytes).metadata()
  return Boolean(meta.exif || meta.xmp || meta.iptc)
}

/**
 * Whether the image carries a GPS IFD — the tag group holding latitude and longitude.
 *
 * Deliberately a tiny hand-rolled reader rather than a new dependency: the audit only has to
 * answer "is there a GPS IFD", and the EXIF layout for that is a fixed walk. It reports the
 * PRESENCE, never the coordinates — the point of the audit is to count exposed photos, and
 * writing the coordinates into a report would copy the leak into a second place.
 */
export async function hasGpsMetadata(input: Buffer | Uint8Array): Promise<boolean> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  let raw: Buffer | undefined
  try {
    raw = (await sharp(bytes).metadata()).exif
  } catch {
    return false
  }
  if (!raw || raw.length < 8) return false

  // 🚨 sharp hands back the APP1 PAYLOAD, which begins with the Exif marker, not with the TIFF
  // header. Measured on a real block: `45 78 69 66 00 00` and only then `49 49 2a 00`. Reading
  // from byte 0 finds no byte-order mark, returns false, and every image looks GPS-free — which
  // is the one way this audit could be wrong in the reassuring direction.
  const exif = raw.subarray(0, 6).toString('latin1') === EXIF_MARKER ? raw.subarray(6) : raw
  if (exif.length < 8) return false

  // TIFF header: "II" (little-endian) or "MM" (big-endian), 42, then the offset of IFD0.
  const le = exif[0] === 0x49 && exif[1] === 0x49
  const be = exif[0] === 0x4d && exif[1] === 0x4d
  if (!le && !be) return false
  const u16 = (o: number) => (le ? exif.readUInt16LE(o) : exif.readUInt16BE(o))
  const u32 = (o: number) => (le ? exif.readUInt32LE(o) : exif.readUInt32BE(o))

  try {
    const ifd0 = u32(4)
    if (ifd0 + 2 > exif.length) return false
    const count = u16(ifd0)
    for (let i = 0; i < count; i++) {
      const entry = ifd0 + 2 + i * 12
      if (entry + 12 > exif.length) break
      // 0x8825 = GPSInfoIFDPointer. Its presence is the location marker.
      if (u16(entry) === 0x8825) return true
    }
  } catch {
    return false
  }
  return false
}
