// CLI for scripts/ops/cleanExistingClips.ts — WRITTEN, NOT RUN (owner decides after launch).
//
// Dry run (default — reads only: lists videos/, range-reads each file's metadata boxes, writes nothing):
//   GCS_BUCKET=tappyai-media-prod GCS_TOKEN="$(gcloud auth print-access-token)" \
//     npx tsx scripts/ops/clean-existing-clips.mts
// Clean (downloads, neutralises and re-uploads ONLY files that carry identifying metadata, same keys):
//   … npx tsx scripts/ops/clean-existing-clips.mts --apply
// Also set every remaining clip's Cache-Control to the current private one-day policy:
//   … npx tsx scripts/ops/clean-existing-clips.mts --apply --fix-cache-control
// Output: a line per object (name, size, reason codes) + a summary, to stdout and clip-cleanup-<ts>.jsonl.
import { appendFileSync } from 'node:fs'
import sharp from 'sharp'
import { cleanExistingClips, CLIP_PREFIX, type ClipBucket, type StoredClip } from './cleanExistingClips'

const bucketName = process.env.GCS_BUCKET ?? ''
const token = process.env.GCS_TOKEN ?? ''
const apply = process.argv.includes('--apply')
const fixCacheControl = process.argv.includes('--fix-cache-control')
if (!bucketName) throw new Error('GCS_BUCKET is required — name the bucket explicitly')
if (!token) throw new Error('GCS_TOKEN is required (gcloud auth print-access-token)')
if (fixCacheControl && !apply) throw new Error('--fix-cache-control writes; it needs --apply')

const API = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o`
const UPLOAD = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o`
const auth = { Authorization: `Bearer ${token}` }
const ok = async (res: Response, what: string) => { if (!res.ok && res.status !== 206) throw new Error(`${what} failed (HTTP ${res.status})`); return res }

const bucket: ClipBucket = {
  async *list(prefix: string) {
    let pageToken: string | undefined
    do {
      const url = `${API}?prefix=${encodeURIComponent(prefix)}&maxResults=1000&fields=${encodeURIComponent('items(name,size,contentType,cacheControl),nextPageToken')}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      const body = await (await ok(await fetch(url, { headers: auth }), 'list')).json() as { items?: Array<{ name: string; size: string; contentType?: string; cacheControl?: string }>; nextPageToken?: string }
      for (const it of body.items ?? []) yield { name: it.name, size: Number(it.size), contentType: it.contentType ?? '', cacheControl: it.cacheControl } as StoredClip
      pageToken = body.nextPageToken
    } while (pageToken)
  },
  async readRange(name, offset, length) {
    const res = await ok(await fetch(`${API}/${encodeURIComponent(name)}?alt=media`, { headers: { ...auth, Range: `bytes=${offset}-${offset + length - 1}` } }), 'range read')
    return new Uint8Array(await res.arrayBuffer())
  },
  async download(name) {
    return new Uint8Array(await (await ok(await fetch(`${API}/${encodeURIComponent(name)}?alt=media`, { headers: auth }), 'download')).arrayBuffer())
  },
  async upload(name, bytes, contentType, cacheControl) {
    const boundary = `clip${Date.now()}`
    const meta = JSON.stringify({ name, contentType, cacheControl })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`),
    ])
    await ok(await fetch(`${UPLOAD}?uploadType=multipart`, { method: 'POST', headers: { ...auth, 'Content-Type': `multipart/related; boundary=${boundary}` }, body }), 'upload')
  },
  async patchCacheControl(name, cacheControl) {
    await ok(await fetch(`${API}/${encodeURIComponent(name)}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ cacheControl }) }), 'patch')
  },
}

const LOG = `clip-cleanup-${Date.now()}.jsonl`
console.log(`bucket=${bucketName} prefix=${CLIP_PREFIX} mode=${apply ? 'APPLY' : 'DRY RUN'}${fixCacheControl ? ' +cache-control' : ''}`)
const report = await cleanExistingClips(bucket, {
  apply,
  fixCacheControl,
  stripImage: async (bytes) => new Uint8Array(await sharp(Buffer.from(bytes)).rotate().toBuffer()),
  onItem: (line) => { const s = JSON.stringify(line); appendFileSync(LOG, s + '\n'); console.log(s) },
})
console.log(JSON.stringify({ summary: report }))
appendFileSync(LOG, JSON.stringify({ summary: report }) + '\n')
