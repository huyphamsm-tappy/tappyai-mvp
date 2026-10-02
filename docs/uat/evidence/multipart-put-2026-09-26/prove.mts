// Owner-approved 2026-09-26: prove on REAL Cloud Storage, before deploy, that
//   (A) the new multipart `put()` (2d6e241) — the path every review photo, avatar and cover takes —
//       stores the exact bytes, with the right content type and `private, max-age=86400, immutable`;
//   (B) the byte-based format check (F-102) and the deal-image check (F-103) behave on real objects.
// Temporary NON-public bucket gs://tappyai-media-audit, synthetic files only, deleted afterwards.
//   GCS_PROOF_BUCKET=tappyai-media-audit GCS_PROOF_TOKEN="$(gcloud auth print-access-token)" \
//     npx tsx docs/uat/evidence/multipart-put-2026-09-26/prove.mts
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { createGcsProvider } from '../../../../src/lib/media/providers/gcs'
import { stripImageMetadata } from '../../../../src/lib/media/stripImageMetadata'
import { sniffImageType } from '../../../../src/lib/security/imageType'
import { randomMediaSuffix } from '../../../../src/lib/media/key'
import { uploadMedia, type UploadTransport } from '../../../../src/lib/media/client'
import { createUploadSessionResponse } from '../../../../src/lib/media/uploadRoute'
import { completeUploadResponse } from '../../../../src/lib/media/uploadCompletion'
import type { MediaUploadKind } from '../../../../src/lib/media/uploadPolicy'
import { syntheticGpsJpeg, jpegMetadata } from '../clip-gps-2026-09-26/gps.mjs'

const bucket = process.env.GCS_PROOF_BUCKET ?? ''
const token = process.env.GCS_PROOF_TOKEN ?? ''
if (bucket !== 'tappyai-media-audit') throw new Error('REFUSING: runs only against gs://tappyai-media-audit')
if (!token) throw new Error('GCS_PROOF_TOKEN required')

const provider = createGcsProvider({ bucket, getAccessToken: async () => token })
const API = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/`
const auth = { Authorization: `Bearer ${token}` }
const owner = randomUUID()
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const download = async (key: string) => new Uint8Array(await (await fetch(`${API}${encodeURIComponent(key)}?alt=media`, { headers: auth })).arrayBuffer())
const meta = async (key: string) => {
  const r = await fetch(`${API}${encodeURIComponent(key)}?fields=name,size,contentType,cacheControl,md5Hash`, { headers: auth })
  return r.status === 200 ? r.json() : { status: r.status }
}
const created: string[] = []
const out: Record<string, unknown> = { at: new Date().toISOString(), bucket, owner }

// ── A. multipart put() ────────────────────────────────────────────────────────
const gpsJpeg = new Uint8Array(await syntheticGpsJpeg())
const photo = (await stripImageMetadata(gpsJpeg, sniffImageType(gpsJpeg)!)).bytes // exactly what /api/reviews/upload sends to put()
const png = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 200, b: 90 } } }).png().toBuffer())
const webp = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 20, b: 90 } } }).webp().toBuffer())
// 3 MB of random bytes: every byte value incl. CR/LF and the "--" of a boundary, many times over.
const big = new Uint8Array(randomBytes(3 * 1024 * 1024))
const puts: Array<[string, string, string, Uint8Array]> = [
  ['review photo (GPS JPEG after stripImageMetadata)', `reviews/${owner}/${Date.now()}-${randomMediaSuffix()}.jpg`, 'image/jpeg', photo],
  ['avatar PNG', `avatars/${owner}-${randomMediaSuffix()}.png`, 'image/png', png],
  ['cover WebP', `covers/${owner}-${randomMediaSuffix()}.webp`, 'image/webp', webp],
  ['3 MB random bytes as JPEG type (binary-safety of the multipart framing)', `reviews/${owner}/${Date.now()}-${randomMediaSuffix()}.jpg`, 'image/jpeg', big],
]
const putResults = []
for (const [label, key, contentType, bytes] of puts) {
  const res = await provider.put(key, bytes, { contentType })
  created.push(key)
  const stored = await download(key)
  const m = await meta(key)
  putResults.push({
    label, key, returnedUrl: res.url,
    sent: { size: bytes.length, sha256: sha(bytes) },
    stored: { size: stored.length, sha256: sha(stored), identical: sha(stored) === sha(bytes) },
    objectMetadata: { contentType: m.contentType, cacheControl: m.cacheControl, size: m.size },
    ...(label.startsWith('review photo') ? { exifBefore: await jpegMetadata(Buffer.from(gpsJpeg)), exifStored: await jpegMetadata(Buffer.from(stored)) } : {}),
  })
}
out.multipartPut = putResults

// ── B. byte-based format check + deal images, through the real session path ───
const route = (allowedKinds: MediaUploadKind[]) => async (body: unknown) => {
  const ctx = { ownerId: owner, allowedKinds }
  const r = (body as { type?: string }).type === 'media.complete-upload' ? await completeUploadResponse(body, ctx, provider) : await createUploadSessionResponse(body, ctx, provider)
  return { status: r.status, json: r.body }
}
const put = async (url: string, bytes: Uint8Array | Blob, ct: string) =>
  (await fetch(url, { method: 'PUT', headers: { 'Content-Type': ct }, body: bytes instanceof Blob ? Buffer.from(await bytes.arrayBuffer()) : Buffer.from(bytes) })).status
/** Opens a session, PUTs raw bytes (skipping any client step, as a direct API call would), completes. */
async function direct(kinds: MediaUploadKind[], kind: MediaUploadKind, contentType: string, bytes: Uint8Array) {
  const call = route(kinds)
  const s = await call({ type: 'media.create-upload-session', kind, contentType, size: bytes.length })
  if (s.status !== 200) return { session: s.status, sessionBody: s.json }
  const { uploadUrl, key } = s.json as { uploadUrl: string; key: string }
  created.push(key)
  const putStatus = await put(uploadUrl, bytes, contentType)
  const done = await call({ type: 'media.complete-upload', kind, key })
  return { session: 200, put: putStatus, completion: done.status, body: done.json, objectAfter: (await provider.statObject!(key)) ? 'present' : 'deleted', cacheControl: (await meta(key)).cacheControl ?? null }
}
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, ...randomBytes(4096)])
const cleanClip = new Uint8Array(readFileSync(new URL('../clip-neutralize-2026-09-26/playable-stored-neutralized.mp4', import.meta.url)))
out.formatChecks = {
  'WebM declared video/webm (session)': await direct(['video'], 'video', 'video/webm', WEBM),
  'WebM bytes declared video/mp4': await direct(['video'], 'video', 'video/mp4', WEBM),
  'GPS JPEG bytes declared video/quicktime': await direct(['video'], 'video', 'video/quicktime', gpsJpeg),
  'neutralised playable MP4 (regression: must pass)': await direct(['video'], 'video', 'video/mp4', cleanClip),
  'deal logo: GPS JPEG': await direct(['dealLogo', 'dealBanner'], 'dealLogo', 'image/jpeg', gpsJpeg),
  'deal banner: clean PNG (must pass)': await direct(['dealLogo', 'dealBanner'], 'dealBanner', 'image/png', png),
  'deal logo: GPS JPEG declared image/png': await direct(['dealLogo', 'dealBanner'], 'dealLogo', 'image/png', gpsJpeg),
}
// The app's own client path for a real clip, end to end (neutraliser + session + completion).
const appTransport: UploadTransport = { postJson: (_u, b) => route(['video', 'videoThumbnail'])(b), putBytes: async (u, f, ct) => ({ readable: true, status: await put(u, f, ct) }) }
const phoneLike = readFileSync(new URL('../clip-neutralize-2026-09-26/playable-phone-like.mp4', import.meta.url))
const app = await uploadMedia({ endpoint: '/api/upload/video', kind: 'video', file: new File([phoneLike], 'clip.mp4', { type: 'video/mp4' }) }, appTransport)
const appKey = app.url.replace(`https://storage.googleapis.com/${bucket}/`, '')
created.push(appKey)
out.appClientClip = { url: app.url, stored: sha(await download(appKey)), expected: 'db032156c72abfd846a557e2ae57b1fc2badb5f5b8a0d1f93d714f0a86340d44', cacheControl: (await meta(appKey)).cacheControl }

// ── cleanup: every object this run created ────────────────────────────────────
for (const key of created) { try { await provider.deleteObject!(key) } catch { /* already deleted by the check */ } }
out.cleanup = { attempted: created.length, remaining: (await (await fetch(`${API.slice(0, -1)}?fields=items(name)`, { headers: auth })).json()).items ?? [] }

console.log(JSON.stringify(out, null, 1))
writeFileSync(new URL('./proof.json', import.meta.url), JSON.stringify(out, null, 1))
