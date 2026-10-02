// PRE-RELEASE A.4(b) — curl-style matrix over real card photo URLs, 0 LLM runs.
// usage: node photoMatrix.mjs <urls.txt> [--md]   (one URL per line; prints status / content-type / bytes per variant)
// Variants: no headers · browser UA only · browser UA + Referer (our web origin) · browser UA + no Referer
// (explicit empty) · each with and without the "=w400-h300" size suffix. Serial, 300 ms apart, so a burst
// limit is not what is being measured.
import { readFileSync } from 'node:fs'
const [file, ...rest] = process.argv.slice(2)
const md = rest.includes('--md')
const urls = readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const ORIGIN = 'https://www.tappyai.com/'
const variants = [
  ['no headers', {}],
  ['UA only', { 'user-agent': UA }],
  ['UA + Referer=our origin', { 'user-agent': UA, referer: ORIGIN }],
  ['UA + no Referer (explicit)', { 'user-agent': UA, referer: '' }],
]
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function probe(url, headers) {
  try {
    const res = await fetch(url, { headers, redirect: 'manual' })
    const buf = await res.arrayBuffer()
    return { status: res.status, type: res.headers.get('content-type') ?? '-', bytes: buf.byteLength, cache: res.headers.get('cache-control') ?? '-', expires: res.headers.get('expires') ?? '-' }
  } catch (e) { return { status: 'ERR', type: String(e).slice(0, 40), bytes: 0, cache: '-', expires: '-' } }
}
const rows = []
for (const [i, url] of urls.entries()) {
  const hasSuffix = /=[ws]\d/.test(url)
  const forms = hasSuffix ? [['as-is', url]] : [['as-is', url], ['+=w400-h300', url + '=w400-h300']]
  for (const [form, u] of forms) {
    for (const [name, headers] of variants) {
      const r = await probe(u, headers)
      rows.push({ i: i + 1, form, variant: name, ...r })
      await sleep(300)
    }
  }
}
if (md) {
  console.log('| # | form | variant | status | content-type | bytes | cache-control |')
  console.log('|---|---|---|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.i} | ${r.form} | ${r.variant} | ${r.status} | ${r.type} | ${r.bytes} | ${r.cache} |`)
}
const summary = {}
for (const r of rows) { const k = `${r.form} · ${r.variant}`; (summary[k] ??= { ok: 0, n: 0, statuses: {} }); summary[k].n++; if (r.status === 200) summary[k].ok++; summary[k].statuses[r.status] = (summary[k].statuses[r.status] ?? 0) + 1 }
console.log(JSON.stringify({ urls: urls.length, form: { host: new URL(urls[0]).host, path0: new URL(urls[0]).pathname.split('/')[1], query: urls.map(u => new URL(u).search).filter(Boolean).length, sizeSuffix: urls.filter(u => /=[ws]\d/.test(u)).length, lengths: urls.map(u => u.length) }, summary }, null, 1))
