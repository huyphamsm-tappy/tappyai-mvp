// PHIÊN LUNA — Serper cache study (owner 30/09). Input: replay out dirs that carry serper.jsonl (every Serper request
// the route made, in order, tagged with the conversation — scripts/consult/replay/lib/serperReplay.ts).
//   node scripts/consult/luna/cacheSim.mjs <outDir> [...]
// Reports:
//   1. current state — Serper requests per turn by area, and Serper's share of the turn cost (route meter);
//   2. sharing inside the corpus — a request whose key another CONVERSATION already produced (= another user's cache
//      entry) under v1 keys vs v2 keys; the same conversation re-asking is counted apart (the L1 memory cache
//      already catches most of those);
//   3. staleness — which v2 TTL class every request lands in, and whether any cached maps record carries a
//      time-of-day field (open-now etc.) that a 3-day TTL would freeze;
//   4. projection for 100 / 1,000 users a month (assumptions printed with it).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { normalizeQueryV2, areaKeyV2, serperTtlV2 } from '../../../src/lib/ai/tools/serperCacheV2.ts'

const v1Part = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
const llOf = b => { const m = /^@(-?[\d.]+),(-?[\d.]+),(\d+)z$/.exec(String(b.ll ?? '')); return m ? { lat: +m[1], lng: +m[2], zoom: +m[3] } : null }
const v1Area = b => { const ll = llOf(b); return ll ? `ll=${ll.lat.toFixed(2)},${ll.lng.toFixed(2)},${ll.zoom}` : (v1Part(b.location) ? `loc=${v1Part(b.location)}` : 'none') }
const v1Key = (ep, b) => `${ep}|${v1Part(b.q)}|${v1Area(b)}|${b.num ?? ''}`
const v2Key = (ep, b) => `${ep}|${normalizeQueryV2(b.q)}|${areaKeyV2(llOf(b) ?? b.location ?? null)}|${b.num ?? ''}`
const CACHED = new Set(['search', 'shopping', 'maps']) // images are never shared (serperCache.ts header)

const calls = [], turns = []
for (const dir of process.argv.slice(2)) {
  const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
  for (const r of res.rows ?? res) turns.push({ run: dir, area: r.area ?? 'none', usd: r.usd ?? 0, serper: r.serperCalls ?? 0 })
  const f = join(dir, 'serper.jsonl')
  if (!existsSync(f)) { console.error(`(no serper.jsonl in ${dir} — turns counted, requests not)`); continue }
  for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const j = JSON.parse(line); let b = {}; try { b = JSON.parse(j.body) } catch { /* */ }
    calls.push({ run: dir, conv: `${j.conv}`, ep: j.url.split('/').pop(), b })
  }
}

// 1 ─ current state
const byArea = {}
for (const t of turns) { const a = (byArea[t.area] ??= { turns: 0, serper: 0, usd: 0 }); a.turns++; a.serper += t.serper; a.usd += t.usd }
console.log('## 1. Hiện trạng (bộ đếm của route; $0.001/lần gọi Serper)\n\n| mảng | lượt | Serper/lượt | Serper chiếm % chi phí lượt |\n|---|---|---|---|')
const tot = { turns: 0, serper: 0, usd: 0 }
for (const [a, v] of Object.entries(byArea).sort()) { console.log(`| ${a} | ${v.turns} | ${(v.serper / v.turns).toFixed(2)} | ${(100 * v.serper * 0.001 / (v.usd || 1e-9)).toFixed(0)}% |`); tot.turns += v.turns; tot.serper += v.serper; tot.usd += v.usd }
console.log(`| **tất cả** | ${tot.turns} | ${(tot.serper / tot.turns).toFixed(2)} | ${(100 * tot.serper * 0.001 / tot.usd).toFixed(0)}% |`)
const eps = {}; for (const c of calls) eps[c.ep] = (eps[c.ep] ?? 0) + 1
console.log(`\nYêu cầu Serper trong log: ${calls.length} — ${Object.entries(eps).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

// 2 ─ sharing across conversations (one run = one pass; different conversations stand in for different users)
function share(keyOf) {
  let cross = 0, self = 0, n = 0; const owner = new Map(); const perRunSeen = new Map()
  for (const c of calls) {
    if (!CACHED.has(c.ep)) continue
    n++
    const k = keyOf(c.ep, c.b); const scope = `${c.run}`
    const seen = perRunSeen.get(scope) ?? new Map(); perRunSeen.set(scope, seen)
    const first = seen.get(k)
    if (first === undefined) seen.set(k, c.conv)
    else if (first === c.conv) self++
    else cross++
    owner.set(k, true)
  }
  return { n, cross, self, unique: owner.size }
}
const s1 = share(v1Key), s2 = share(v2Key)
console.log(`\n## 2. Dùng chung trong bộ replay (trong từng lần chạy; hội thoại khác = người dùng khác)\n`)
console.log(`| khoá | yêu cầu cache được | trúng từ hội thoại KHÁC | trúng lại chính hội thoại | khoá khác nhau |\n|---|---|---|---|---|`)
console.log(`| v1 (y nguyên) | ${s1.n} | ${s1.cross} (${(100 * s1.cross / s1.n).toFixed(1)}%) | ${s1.self} | ${s1.unique} |`)
console.log(`| v2 (chuẩn hoá) | ${s2.n} | ${s2.cross} (${(100 * s2.cross / s2.n).toFixed(1)}%) | ${s2.self} | ${s2.unique} |`)
const merged = new Map()
for (const c of calls) if (CACHED.has(c.ep)) { const k = v2Key(c.ep, c.b); const set = merged.get(k) ?? new Set(); set.add(`${c.b.q}`); merged.set(k, set) }
const ex = [...merged.values()].filter(s => s.size > 1).slice(0, 6)
if (ex.length) console.log('\nVí dụ v2 gộp:\n' + ex.map(s => '- ' + [...s].slice(0, 3).map(q => `\`${q}\``).join(' ≡ ')).join('\n'))

// 3 ─ staleness
const cls = {}
for (const c of calls) if (CACHED.has(c.ep)) { const t = serperTtlV2(c.ep, c.b.q ?? '', {}); const k = `${c.ep} ${t / 3600}h`; cls[k] = (cls[k] ?? 0) + 1 }
console.log(`\n## 3. Hạn dùng v2 theo loại (số yêu cầu)\n\n${Object.entries(cls).sort().map(([k, v]) => `- ${k}: ${v}`).join('\n')}`)
const rec = join('scripts', 'consult', 'replay', 'recordings')
const timeFields = new Set()
if (existsSync(rec)) for (const f of readdirSync(rec)) {
  const j = JSON.parse(readFileSync(join(rec, f), 'utf8')); if (!String(j.url).endsWith('/maps')) continue
  for (const p of j.body?.places ?? []) for (const k of Object.keys(p)) if (/open|now|hours|busy|wait|live/i.test(k)) timeFields.add(k)
}
console.log(`- trường liên quan giờ trong kết quả maps đã ghi: ${[...timeFields].join(', ') || '(không)'} — openingHours là lịch TUẦN; "đang mở" do code tính lúc đọc (serperPlaces.ts), nên 3 ngày không đóng băng trạng thái mở/đóng.`)

// 4 ─ projection
const perTurn = tot.serper / tot.turns
const cachedShare = calls.filter(c => CACHED.has(c.ep)).length / Math.max(1, calls.length)
const mapsShare = calls.filter(c => c.ep === 'maps').length / Math.max(1, calls.filter(c => CACHED.has(c.ep)).length)
function zipfHit(draws, K) { // expected fraction of draws that repeat an earlier key, Zipf s=1 over K keys
  if (draws <= 0) return 0
  let Z = 0; for (let i = 1; i <= K; i++) Z += 1 / i
  let distinct = 0; for (let i = 1; i <= K; i++) distinct += 1 - Math.pow(1 - 1 / i / Z, draws)
  return 1 - distinct / draws
}
const inflate = s1.unique / Math.max(1, s2.unique) // v1 splits one need over this many more keys
const K_MAPS = 4000, K_WEB = 20000
console.log(`\n## 4. Ước tính theo quy mô\n\nGiả định: 9 lượt/người/tháng (= 900 lượt ở 100 người); ${perTurn.toFixed(2)} yêu cầu Serper/lượt (đo), ${(100 * cachedShare).toFixed(0)}% thuộc loại được cache (search/shopping/maps; images không), trong đó maps ${(100 * mapsShare).toFixed(0)}%. Nhu cầu phân bố Zipf s=1 trên ${K_MAPS} khoá địa điểm và ${K_WEB} khoá web/giá (tên quán cụ thể nên đuôi dài). v1: một khoá thật bị tách thành ×${inflate.toFixed(2)} khoá theo cách viết (đo ở mục 2), TTL 24 h mọi loại. v2: maps 3 ngày, web 12 h, giá 6 h, việc trong ngày 1 h.\n`)
console.log('| người dùng/tháng | yêu cầu Serper/tháng | không cache | v1 (24 h) | v2 | v2 tiết kiệm thêm so với v1 |\n|---|---|---|---|---|---|')
for (const users of [100, 1000]) {
  const month = users * 9 * perTurn, cachedMonth = month * cachedShare
  const window = (share, days) => cachedMonth * share * days / 30
  const v1 = mapsShare * zipfHit(window(mapsShare, 1), Math.round(K_MAPS * inflate)) + (1 - mapsShare) * zipfHit(window(1 - mapsShare, 1), Math.round(K_WEB * inflate))
  const v2 = mapsShare * zipfHit(window(mapsShare, 3), K_MAPS) + (1 - mapsShare) * zipfHit(window(1 - mapsShare, 0.4), K_WEB)
  const usd = h => (month - cachedMonth * h) * 0.001
  console.log(`| ${users} | ${Math.round(month)} | $${usd(0).toFixed(2)} | $${usd(v1).toFixed(2)} (trúng ${(100 * v1).toFixed(0)}%) | $${usd(v2).toFixed(2)} (trúng ${(100 * v2).toFixed(0)}%) | $${(usd(v1) - usd(v2)).toFixed(2)} |`)
}
