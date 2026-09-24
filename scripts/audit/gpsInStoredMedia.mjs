#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// R-2 AUDIT — how many already-public photos still carry GPS?
//
// 🚨 NOT RUN YET. Written for the owner to run, deliberately, once. It is READ
// ONLY: it lists objects and fetches bytes, and it never writes, deletes or
// re-uploads anything. There is no code path here that mutates the bucket.
//
// The strip (`src/lib/media/stripImageMetadata.ts`) protects everything uploaded
// from now on. It does nothing for what is already stored — this counts that
// backlog so the owner can decide whether it needs a re-encode pass, and how
// urgent it is.
//
// 🚨 IT REPORTS COUNTS AND KEYS, NEVER COORDINATES. Writing the latitude and
// longitude into a report file would copy the leak into a second place, and that
// file would then need the same care as the bucket. "Which objects" is enough to
// act on; "where was this person" is not needed and is not collected.
//
// USAGE
//   GCS_MEDIA_BUCKET=tappyai-media-prod node scripts/audit/gpsInStoredMedia.mjs
//
//   --prefix=reviews/      only this key prefix (default: all three image prefixes)
//   --limit=500            stop after N objects (default: 2000; 0 = no limit)
//   --out=path.json        write the report (default: docs/uat/evidence/gps-audit-<date>.json)
//
// ACCESS. The bucket answers anonymous reads for objects (that is the point —
// they are public), so this needs no credential for a public bucket. If listing
// is closed, export a bearer token as GCS_TOKEN and it will be sent on the list
// calls. If neither works, the script says so and stops rather than reporting a
// reassuring zero.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import sharp from 'sharp'

const BUCKET = process.env.GCS_MEDIA_BUCKET || 'tappyai-media-prod'
const TOKEN = process.env.GCS_TOKEN || ''

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

// The three prefixes a user's own photos land under. `videos/` is excluded: a
// QuickTime location atom is a different container and a different reader, and
// claiming to have checked it would be worse than saying it was not.
const PREFIXES = arg('prefix', '') ? [arg('prefix', '')] : ['reviews/', 'avatars/', 'covers/']
const LIMIT = Number(arg('limit', '2000'))
const OUT = arg('out', `docs/uat/evidence/gps-audit-${new Date().toISOString().slice(0, 10)}.json`)

const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}

async function* listObjects(prefix) {
  let pageToken = ''
  for (;;) {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`)
    url.searchParams.set('prefix', prefix)
    url.searchParams.set('maxResults', '500')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers })
    if (!res.ok) {
      throw new Error(`list ${prefix} failed: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
    }
    const body = await res.json()
    for (const item of body.items || []) yield item
    if (!body.nextPageToken) return
    pageToken = body.nextPageToken
  }
}

/** Presence of a GPS IFD. Mirrors `hasGpsMetadata`, inlined so the script has no build step. */
async function carriesGps(bytes) {
  let raw
  try {
    raw = (await sharp(bytes).metadata()).exif
  } catch {
    return { gps: false, unreadable: true }
  }
  if (!raw || raw.length < 8) return { gps: false, unreadable: false }
  // sharp returns the APP1 payload: the "Exif\0\0" marker precedes the TIFF header.
  const exif = raw.subarray(0, 6).toString('latin1') === 'Exif\u0000\u0000' ? raw.subarray(6) : raw
  if (exif.length < 8) return { gps: false, unreadable: false }
  const le = exif[0] === 0x49 && exif[1] === 0x49
  const be = exif[0] === 0x4d && exif[1] === 0x4d
  if (!le && !be) return { gps: false, unreadable: false }
  const u16 = (o) => (le ? exif.readUInt16LE(o) : exif.readUInt16BE(o))
  const u32 = (o) => (le ? exif.readUInt32LE(o) : exif.readUInt32BE(o))
  try {
    const ifd0 = u32(4)
    if (ifd0 + 2 > exif.length) return { gps: false, unreadable: false }
    const count = u16(ifd0)
    for (let i = 0; i < count; i++) {
      const entry = ifd0 + 2 + i * 12
      if (entry + 12 > exif.length) break
      if (u16(entry) === 0x8825) return { gps: true, unreadable: false } // GPSInfoIFDPointer
    }
  } catch {
    return { gps: false, unreadable: true }
  }
  return { gps: false, unreadable: false }
}

const IMAGE = /\.(jpe?g|png|webp|gif)$/i

async function main() {
  const report = {
    bucket: BUCKET,
    startedAt: new Date().toISOString(),
    prefixes: PREFIXES,
    limit: LIMIT || null,
    scanned: 0,
    skippedNonImage: 0,
    withExif: 0,
    withGps: 0,
    unreadable: 0,
    fetchFailed: 0,
    // Keys only. No coordinates, ever.
    gpsKeys: [],
    byPrefix: {},
  }

  for (const prefix of PREFIXES) {
    const bucketStats = { scanned: 0, withExif: 0, withGps: 0 }
    report.byPrefix[prefix] = bucketStats
    for await (const item of listObjects(prefix)) {
      if (LIMIT && report.scanned >= LIMIT) break
      if (!IMAGE.test(item.name)) { report.skippedNonImage++; continue }

      const res = await fetch(`https://storage.googleapis.com/${BUCKET}/${encodeURI(item.name)}`, { headers })
      if (!res.ok) { report.fetchFailed++; continue }
      const bytes = Buffer.from(await res.arrayBuffer())

      report.scanned++
      bucketStats.scanned++

      let meta
      try {
        meta = await sharp(bytes).metadata()
      } catch {
        report.unreadable++
        continue
      }
      if (meta.exif || meta.xmp || meta.iptc) { report.withExif++; bucketStats.withExif++ }

      const { gps, unreadable } = await carriesGps(bytes)
      if (unreadable) report.unreadable++
      if (gps) {
        report.withGps++
        bucketStats.withGps++
        report.gpsKeys.push(item.name)
      }
    }
    if (LIMIT && report.scanned >= LIMIT) break
  }

  report.finishedAt = new Date().toISOString()
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n')

  console.log(`bucket          ${report.bucket}`)
  console.log(`scanned         ${report.scanned} image objects (${report.skippedNonImage} non-image skipped)`)
  console.log(`carry metadata  ${report.withExif}`)
  console.log(`CARRY GPS       ${report.withGps}`)
  console.log(`unreadable      ${report.unreadable}   fetch failed ${report.fetchFailed}`)
  console.log(`report          ${OUT}  (keys only — no coordinates)`)
}

main().catch((e) => {
  // A listing or network failure must not read as "nothing to worry about".
  console.error('AUDIT DID NOT COMPLETE — do not read this as a clean result:', e.message)
  process.exit(1)
})
