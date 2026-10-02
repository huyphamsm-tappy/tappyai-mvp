// F-099 / F-100 end-to-end proof (owner-approved 2026-09-26) on a temporary NON-public bucket,
// gs://tappyai-media-audit, with synthetic files only.
//
// Layers exercised — the app's own code:
//   clips  : uploadMedia() [client neutraliser] → createUploadSessionResponse() → PUT →
//            completeUploadResponse() [server metadata check] → GCS
//   photos : stripImageMetadata() → provider.put() — exactly POST /api/reviews/upload's body
// Also: the server check refusing a clip that skipped the neutraliser (old client / direct API);
// the `video` kind refusing an image; ranged reads (what <video> seeking uses) on the stored clip,
// and the Cache-Control it was stored with.
//   GCS_PROOF_BUCKET=tappyai-media-audit GCS_PROOF_TOKEN="$(gcloud auth print-access-token)" \
//     npx tsx docs/uat/evidence/clip-neutralize-2026-09-26/prove.mts
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { uploadMedia, type UploadTransport } from '../../../../src/lib/media/client'
import { createUploadSessionResponse } from '../../../../src/lib/media/uploadRoute'
import { completeUploadResponse } from '../../../../src/lib/media/uploadCompletion'
import { createGcsProvider } from '../../../../src/lib/media/providers/gcs'
import { stripImageMetadata } from '../../../../src/lib/media/stripImageMetadata'
import { sniffImageType } from '../../../../src/lib/security/imageType'
import { randomMediaSuffix } from '../../../../src/lib/media/key'
import type { MediaUploadKind } from '../../../../src/lib/media/uploadPolicy'
import { syntheticAndroidMp4, syntheticIphoneMov, syntheticGpsJpeg, mp4Metadata, jpegMetadata } from '../clip-gps-2026-09-26/gps.mjs'

const bucket = process.env.GCS_PROOF_BUCKET ?? ''
const token = process.env.GCS_PROOF_TOKEN ?? ''
if (bucket !== 'tappyai-media-audit') throw new Error('REFUSING: runs only against gs://tappyai-media-audit')
if (!token) throw new Error('GCS_PROOF_TOKEN required')

const provider = createGcsProvider({ bucket, getAccessToken: async () => token })
const ctx = { ownerId: randomUUID(), allowedKinds: ['video', 'videoThumbnail'] as MediaUploadKind[] }
const API = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/`
const auth = { Authorization: `Bearer ${token}` }
const route = async (body: unknown) => {
  const b = body as { type?: string }
  const out = b.type === 'media.complete-upload' ? await completeUploadResponse(body, ctx, provider) : await createUploadSessionResponse(body, ctx, provider)
  return { status: out.status, json: out.body }
}
const put = async (url: string, file: Blob, contentType: string) => {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: Buffer.from(await file.arrayBuffer()) })
  return { readable: true, status: res.status }
}
const appTransport: UploadTransport = { postJson: (_u, b) => route(b), putBytes: (u, f, ct) => put(u, f, ct) }
const download = async (key: string) => Buffer.from(await (await fetch(`${API}${encodeURIComponent(key)}?alt=media`, { headers: auth })).arrayBuffer())
const objectMeta = async (key: string) => (await fetch(`${API}${encodeURIComponent(key)}?fields=cacheControl,contentType,size`, { headers: auth })).json()
const keyOf = (url: string) => url.replace(`https://storage.googleapis.com/${bucket}/`, '')
const IDENTIFYING = ['+10.7725', '106.6980', 'SYN-PHONE-A1', 'SyntheticMaker', 'iPhone SYN', 'com.apple.quicktime.location', 'SYN0000SERIAL', 'Synthetic Author']
const leftovers = (b: Buffer) => IDENTIFYING.filter(s => b.includes(Buffer.from(s, 'latin1')))
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 16)

const out: Record<string, unknown> = { at: new Date().toISOString(), bucket, ownerId: ctx.ownerId }

// 1. Clips through the real app path (client neutraliser + server check)
const playable = readFileSync(new URL('./playable-phone-like.mp4', import.meta.url))
const clips: Array<[string, string, Buffer]> = [
  ['android.mp4 (synthetic boxes)', 'video/mp4', syntheticAndroidMp4()],
  ['iphone.mov (synthetic boxes)', 'video/quicktime', syntheticIphoneMov()],
  ['playable phone-like MP4 (browser-recorded, metadata added)', 'video/mp4', playable],
]
const clipResults = []
for (const [name, type, bytes] of clips) {
  const { url } = await uploadMedia({ endpoint: '/api/upload/video', kind: 'video', file: new File([bytes], name, { type }) }, appTransport)
  const stored = await download(keyOf(url))
  clipResults.push({
    file: name,
    beforeUpload: { fields: mp4Metadata(bytes), identifyingStrings: leftovers(bytes) },
    storedAfterDownload: { sameLength: stored.length === bytes.length, fields: mp4Metadata(stored), identifyingStrings: leftovers(stored), sha: sha(stored) },
    storedObject: await objectMeta(keyOf(url)),
  })
  if (name.startsWith('playable')) {
    writeFileSync(new URL('./playable-stored-neutralized.mp4', import.meta.url), stored)
    // 1b. ranged reads — what <video> seeking issues — on the stored clip
    const ranges = []
    for (const [a, b] of [[0, 99], [760, 1759], [60000, 60999], [stored.length - 1000, stored.length - 1]]) {
      const res = await fetch(`${API}${encodeURIComponent(keyOf(url))}?alt=media`, { headers: { ...auth, Range: `bytes=${a}-${b}` } })
      const got = Buffer.from(await res.arrayBuffer())
      ranges.push({ range: `${a}-${b}`, status: res.status, contentRange: res.headers.get('content-range'), bytesMatch: got.equals(stored.subarray(a, b + 1)), cacheControl: res.headers.get('cache-control') })
    }
    out.rangeReads = ranges
  }
  await provider.deleteObject!(keyOf(url))
}
out.clips = clipResults

// 2. The photo: now refused on the clip path, cleaned on the server path
const jpg = await syntheticGpsJpeg()
out.photoOnClipPath = await route({ type: 'media.create-upload-session', kind: 'video', contentType: 'image/jpeg', size: jpg.length })
const kind = sniffImageType(new Uint8Array(jpg))!
const clean = Buffer.from((await stripImageMetadata(new Uint8Array(jpg), kind)).bytes)
const photoKey = `reviews/${ctx.ownerId}/${Date.now()}-${randomMediaSuffix()}.jpg`
await provider.put(photoKey, clean, { contentType: 'image/jpeg' })
const storedPhoto = await download(photoKey)
out.photoOnServerPath = { key: photoKey, before: await jpegMetadata(jpg), storedAfterDownload: await jpegMetadata(storedPhoto), identifyingStrings: leftovers(storedPhoto) }
await provider.deleteObject!(photoKey)

// 3. A clip that SKIPPED the neutraliser (old client / direct API) is refused and deleted
const raw = syntheticIphoneMov()
const session = (await route({ type: 'media.create-upload-session', kind: 'video', contentType: 'video/quicktime', size: raw.length })).json as { uploadUrl: string; key: string }
const rawPut = await put(session.uploadUrl, new Blob([raw]), 'video/quicktime')
const verdict = await route({ type: 'media.complete-upload', kind: 'video', key: session.key })
out.bypass = { put: rawPut.status, completion: verdict, objectAfter: (await provider.statObject!(session.key)) === null ? 'deleted' : 'STILL THERE' }

console.log(JSON.stringify(out, null, 1))
writeFileSync(new URL('./proof.json', import.meta.url), JSON.stringify(out, null, 1))
