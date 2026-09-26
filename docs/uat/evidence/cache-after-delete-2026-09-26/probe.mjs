// Cache-after-deletion probe (owner-approved 2026-09-26), against gs://tappyai-media-cachetest ONLY:
// a temporary bucket, allUsers = legacyObjectReader (object GET only, no list), two synthetic 8-byte
// objects: s300 (Cache-Control public, max-age=300) and s86400 (public, max-age=86400).
//
//   node probe.mjs warm      fetch each public URL repeatedly (no client cache: Node fetch keeps
//                            none), record status + Age/Cache-Control, test a conditional GET (304?)
//   node probe.mjs poll N    after the objects are DELETED: fetch every 30 s for N minutes, plus a
//                            cache-busting variant (?cb=<ts>) that bypasses any cached copy
// Any 200 after deletion therefore comes from a shared cache between this host and GCS — Google's
// edge — not from a client that already had the file.
import { appendFileSync } from 'node:fs'

const BUCKET = 'tappyai-media-cachetest'
const OBJECTS = ['s300', 's86400']
const LOG = new URL('./probe.log', import.meta.url)
const url = (o, cb) => `https://storage.googleapis.com/${BUCKET}/${o}${cb ? `?cb=${cb}` : ''}`
const log = (x) => { const line = JSON.stringify({ t: new Date().toISOString(), ...x }); appendFileSync(LOG, line + '\n'); console.log(line) }
const probe = async (o, cb, headers = {}) => {
  const r = await fetch(url(o, cb), { headers: { 'Cache-Control': 'no-cache-please-ignored', ...headers } })
  return { status: r.status, age: r.headers.get('age'), cacheControl: r.headers.get('cache-control'), etag: r.headers.get('etag'), gen: r.headers.get('x-goog-generation') }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const [mode, arg] = process.argv.slice(2)
if (mode === 'warm') {
  for (let i = 0; i < 8; i++) {
    for (const o of OBJECTS) log({ phase: 'warm', i, object: o, ...(await probe(o)) })
    await sleep(3000)
  }
  for (const o of OBJECTS) {
    const first = await probe(o)
    const cond = await probe(o, null, { 'If-None-Match': first.etag ?? '' })
    log({ phase: 'conditional-get', object: o, etag: first.etag, status: cond.status })
  }
} else if (mode === 'poll') {
  const minutes = Number(arg ?? 35)
  const end = Date.now() + minutes * 60_000
  while (Date.now() < end) {
    for (const o of OBJECTS) {
      const plain = await probe(o)
      const busted = await probe(o, Date.now())
      log({ phase: 'after-delete', object: o, plain: plain.status, age: plain.age, cacheControl: plain.cacheControl, cacheBusted: busted.status })
    }
    await sleep(30_000)
  }
} else throw new Error('usage: warm | poll <minutes>')
