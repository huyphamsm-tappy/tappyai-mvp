// Clip metadata through the app's REAL upload path (owner P1, 2026-09-26).
//
// LAYER TESTED — exactly the code a clip goes through after the user picks a file:
//   uploadMedia()                 src/lib/media/client.ts       ← what the web composer calls with the
//                                                                 picked File, untouched (page.tsx:398-478)
//   createUploadSessionResponse() src/lib/media/uploadRoute.ts   ← what POST /api/upload/video runs
//   (bytes PUT to the session)                                   ← what the browser transport does
//   completeUploadResponse()      src/lib/media/uploadCompletion.ts
//   createGcsProvider()           src/lib/media/providers/gcs.ts
// NOT tested here: the Next.js route wrapper around those two handlers (auth, 18+ gate, rate limit —
// none of them touches bytes), the Workload Identity token (replaced by the owner's gcloud token),
// and the phone's file picker (OS/browser behaviour — see the report).
//
// Owner constraints: bucket gs://tappyai-media-audit only (non-public), synthetic files only.
//   GCS_PROOF_BUCKET=tappyai-media-audit GCS_PROOF_TOKEN="$(gcloud auth print-access-token)" \
//     npx tsx docs/uat/evidence/clip-gps-2026-09-26/real-upload-path.mts
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { uploadMedia, type UploadTransport } from '../../../../src/lib/media/client'
import { createUploadSessionResponse } from '../../../../src/lib/media/uploadRoute'
import { completeUploadResponse } from '../../../../src/lib/media/uploadCompletion'
import { createGcsProvider } from '../../../../src/lib/media/providers/gcs'
import type { MediaUploadKind } from '../../../../src/lib/media/uploadPolicy'
import { syntheticAndroidMp4, syntheticIphoneMov, syntheticGpsJpeg, mp4Metadata, jpegMetadata } from './gps.mjs'

const bucket = process.env.GCS_PROOF_BUCKET ?? ''
const token = process.env.GCS_PROOF_TOKEN ?? ''
if (bucket !== 'tappyai-media-audit') throw new Error('REFUSING: runs only against gs://tappyai-media-audit')
if (!token) throw new Error('GCS_PROOF_TOKEN required')

const provider = createGcsProvider({ bucket, getAccessToken: async () => token })
const ctx = { ownerId: randomUUID(), allowedKinds: ['video', 'videoThumbnail'] as MediaUploadKind[] } // /api/upload/video's scope

// The transport the browser uses, with the two POSTs landing on the route's own handlers.
const transport: UploadTransport = {
  async postJson(_url, body) {
    const b = body as { type?: string }
    const out = b.type === 'media.complete-upload'
      ? await completeUploadResponse(body, ctx, provider)
      : await createUploadSessionResponse(body, ctx, provider)
    return { status: out.status, json: out.body }
  },
  async putBytes(url, file, contentType) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: Buffer.from(await file.arrayBuffer()) })
    return { readable: true, status: res.status }
  },
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const api = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/`
const cases: Array<{ name: string; type: string; bytes: Buffer; read: (b: Buffer) => Promise<unknown> | unknown; note: string }> = [
  { name: 'android.mp4', type: 'video/mp4', bytes: syntheticAndroidMp4(), read: mp4Metadata, note: 'composer video input (accept=video/mp4)' },
  { name: 'iphone.mov', type: 'video/quicktime', bytes: syntheticIphoneMov(), read: mp4Metadata, note: 'composer video input (accept=video/quicktime)' },
  { name: 'photo.jpg', type: 'image/jpeg', bytes: await syntheticGpsJpeg(), read: jpegMetadata, note: "kind 'video' also accepts images at the API (not offered by the web composer's video input)" },
]

const results: unknown[] = []
for (const c of cases) {
  const file = new File([c.bytes], c.name, { type: c.type })
  const { url } = await uploadMedia({ endpoint: '/api/upload/video', kind: 'video', file }, transport)
  const key = url.replace(`https://storage.googleapis.com/${bucket}/`, '')
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  const stored = Buffer.from(await (await fetch(`${api}${encodeURIComponent(key)}?alt=media`, auth)).arrayBuffer())
  const meta = await (await fetch(`${api}${encodeURIComponent(key)}?fields=cacheControl,contentType,size`, auth)).json()
  results.push({
    file: c.name, path: c.note, key,
    byteIdentical: sha(stored) === sha(c.bytes),
    metadataBefore: await c.read(c.bytes),
    metadataAfterUploadAndDownload: await c.read(stored),
    storedObject: meta,
  })
  await provider.deleteObject!(key) // synthetic; leave the bucket empty for its own deletion
}
const out = { at: new Date().toISOString(), bucket, layer: 'uploadMedia → createUploadSessionResponse → PUT → completeUploadResponse → GCS', ownerId: ctx.ownerId, results }
console.log(JSON.stringify(out, null, 1))
writeFileSync('docs/uat/evidence/clip-gps-2026-09-26/real-upload-path.json', JSON.stringify(out, null, 1))
