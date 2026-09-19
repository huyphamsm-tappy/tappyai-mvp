// lh3.googleusercontent.com burst probe: how many parallel thumbnail requests from one IP get
// 429. usage: node lh3burst.mjs <urls.txt> [restMs=40000]. Reports per burst: status counts.
import { readFileSync } from 'node:fs'
const urls = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean)
const rest = Number(process.argv[3] ?? 40000)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const burst = async (label, list) => {
  const t0 = Date.now()
  const res = await Promise.all(list.map(u => fetch(u, { cache: 'no-store' }).then(r => { r.body?.cancel(); return r.status }).catch(() => 'ERR')))
  const counts = {}
  for (const s of res) counts[s] = (counts[s] ?? 0) + 1
  console.log(label, JSON.stringify(counts), `${Date.now() - t0}ms`)
}
console.log(`rest ${rest}ms …`); await sleep(rest)
await burst('burst A: 8 distinct (one chat turn)      ', urls.slice(0, 8))
await burst('burst B: 8 again immediately             ', urls.slice(0, 8))
await burst('burst C: 8 again immediately             ', urls.slice(0, 8))
await burst('burst D: 16 (two turns at once)          ', [...urls.slice(0, 8), ...urls.slice(0, 8)])
console.log(`rest ${rest}ms …`); await sleep(rest)
await burst('burst E: 8 after rest                    ', urls.slice(0, 8))
for (let i = 0; i < 8; i++) { const s = await fetch(urls[i], { cache: 'no-store' }).then(r => { r.body?.cancel(); return r.status }); process.stdout.write(s + ' ') }
console.log('← 8 sequential right after E')
