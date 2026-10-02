// F-099 · one-off clean-up of clips uploaded BEFORE the metadata neutraliser (3b70ed1).
// WRITTEN, NOT RUN — the owner decides after launch.
//
// For every object under videos/ it:
//   1. range-reads the metadata boxes (findIdentifyingMetadata — the same check upload completion
//      now enforces) and classifies the object: clean / identifying (with reason codes) / unreadable;
//   2. with --apply, for an identifying object: downloads it, neutralises it in place
//      (neutralizeClipMetadata; photos under videos/ go through stripImageMetadata instead), checks
//      the result is clean, and re-uploads it to the SAME key — the URL in the database does not change;
//   3. with --fix-cache-control, sets Cache-Control to the current policy on every object it keeps
//      (a metadata patch, no re-upload), so browsers stop holding old clips for a year.
// It never deletes, never touches another prefix, and records reason CODES, never values.
//
// What it cannot do: recall copies already cached. Old clips were served `public, max-age=31536000`;
// a copy a Google edge or a viewer's device fetched before the clean-up can remain reachable for up to
// a year, and GCS built-in caching cannot be invalidated (F-100, measured).

import { findIdentifyingMetadata, neutralizeClipMetadata, type IdentifyingReason } from '../../src/lib/media/clipMetadata'
import { IMMUTABLE_MEDIA_CACHE_CONTROL } from '../../src/lib/media/providers/gcs'

export interface StoredClip { name: string; size: number; contentType: string; cacheControl?: string }

export interface ClipBucket {
  list(prefix: string): AsyncIterable<StoredClip>
  readRange(name: string, offset: number, length: number): Promise<Uint8Array>
  download(name: string): Promise<Uint8Array>
  /** Overwrites the object at `name` (same key → same public URL). */
  upload(name: string, bytes: Uint8Array, contentType: string, cacheControl: string): Promise<void>
  patchCacheControl(name: string, cacheControl: string): Promise<void>
}

export interface CleanupOptions {
  apply: boolean
  fixCacheControl: boolean
  /** Photo path: strip EXIF by re-encoding (the server path's stripImageMetadata). */
  stripImage: (bytes: Uint8Array, contentType: string) => Promise<Uint8Array>
  onItem?: (line: Record<string, unknown>) => void
}

export interface CleanupReport {
  scanned: number
  clean: number
  identifying: number
  byReason: Partial<Record<IdentifyingReason, number>>
  rewritten: number
  cacheControlFixed: number
  failed: number
  bytesDownloaded: number
}

export const CLIP_PREFIX = 'videos/'

export async function cleanExistingClips(bucket: ClipBucket, opts: CleanupOptions): Promise<CleanupReport> {
  const r: CleanupReport = { scanned: 0, clean: 0, identifying: 0, byReason: {}, rewritten: 0, cacheControlFixed: 0, failed: 0, bytesDownloaded: 0 }
  for await (const obj of bucket.list(CLIP_PREFIX)) {
    if (!obj.name.startsWith(CLIP_PREFIX)) continue
    r.scanned++
    const ct = (obj.contentType || '').split(';')[0].trim().toLowerCase()
    try {
      const reasons = await findIdentifyingMetadata((o, n) => bucket.readRange(obj.name, o, n), obj.size, ct)
      if (reasons.length === 0) r.clean++
      else {
        r.identifying++
        for (const x of reasons) r.byReason[x] = (r.byReason[x] ?? 0) + 1
      }
      let rewritten = false
      if (opts.apply && reasons.length > 0 && !reasons.includes('unreadable')) {
        const bytes = await bucket.download(obj.name)
        r.bytesDownloaded += bytes.length
        const cleaned = ct.startsWith('image/')
          ? await opts.stripImage(bytes, ct)
          : new Uint8Array(await (await neutralizeClipMetadata(new Blob([bytes as BlobPart], { type: ct }))).arrayBuffer())
        const left = await findIdentifyingMetadata(async (o, n) => cleaned.slice(o, o + n), cleaned.length, ct)
        if (left.length > 0) throw new Error(`still identifying after clean-up: ${left.join(',')}`)
        await bucket.upload(obj.name, cleaned, ct, IMMUTABLE_MEDIA_CACHE_CONTROL)
        r.rewritten++
        rewritten = true
      }
      if (opts.apply && opts.fixCacheControl && !rewritten && obj.cacheControl !== IMMUTABLE_MEDIA_CACHE_CONTROL) {
        await bucket.patchCacheControl(obj.name, IMMUTABLE_MEDIA_CACHE_CONTROL)
        r.cacheControlFixed++
      }
      opts.onItem?.({ name: obj.name, size: obj.size, contentType: ct, reasons, rewritten })
    } catch (e) {
      r.failed++
      opts.onItem?.({ name: obj.name, error: e instanceof Error ? e.message.slice(0, 160) : 'unknown' })
    }
  }
  return r
}
