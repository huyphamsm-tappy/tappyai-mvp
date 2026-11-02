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

// 2 ─ repeated runs = different users (owner: "bộ câu Phase 7 + bộ gõ đời thường chạy lặp"). Every run of a suite
// is another user asking the same things in their own words; realTyping conversations are everyday-typing variants of
// the scenario openers. Requests are replayed in time order (run start from the out-dir stamp) through one shared
// cache; a hit = the key was stored by ANOTHER user (run × conversation) and has not expired.
const runStart = dir => { const m = /(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)/.exec(dir); return m ? Date.parse(`${m[1]}:${m[2]}:${m[3]}Z`) : 0 }
const ttlV1 = () => 86_400
const ttlV2 = (ep, b) => serperTtlV2(ep, b.q ?? '', {})
function replayShared(keyOf, ttlOf) {
  const store = new Map() // key → {user, exp}
  let n = 0, hit = 0, self = 0
  const ordered = calls.map((c, i) => ({ c, i })).sort((x, y) => runStart(x.c.run) - runStart(y.c.run) || x.i - y.i)
  for (const { c } of ordered) {
    if (!CACHED.has(c.ep)) continue
    n++
    const now = runStart(c.run), user = `${c.run}|${c.conv}`, k = keyOf(c.ep, c.b), e = store.get(k)
    if (e && e.exp > now) { if (e.user === user) self++; else hit++; continue }
    store.set(k, { user, exp: now + ttlOf(c.ep, c.b) * 1000 })
  }
  return { n, hit, self, unique: store.size }
}
const r1 = replayShared(v1Key, ttlV1), r2 = replayShared(v2Key, ttlV2)
const users = new Set(calls.map(c => `${c.run}|${c.conv}`)).size
console.log(`\n## 2. Chạy lặp = nhiều người dùng (${new Set(calls.map(c => c.run)).size} lần chạy, ${users} hội thoại; một cache chung, theo thứ tự thời gian)\n`)
console.log(`| khoá / hạn | yêu cầu cache được | trúng từ NGƯỜI KHÁC | trúng lại chính mình | khoá khác nhau |\n|---|---|---|---|---|`)
console.log(`| v1 · y nguyên · 24 h | ${r1.n} | ${r1.hit} (${(100 * r1.hit / r1.n).toFixed(1)}%) | ${r1.self} | ${r1.unique} |`)
console.log(`| v2 · chuẩn hoá · theo loại | ${r2.n} | ${r2.hit} (${(100 * r2.hit / r2.n).toFixed(1)}%) | ${r2.self} | ${r2.unique} |`)
const merged = new Map()
for (const c of calls) if (CACHED.has(c.ep)) { const k = v2Key(c.ep, c.b); const set = merged.get(k) ?? new Set(); set.add(`${c.b.q}`); merged.set(k, set) }
const ex = [...merged.values()].filter(s => s.size > 1)
console.log(`\nv2 gộp ${ex.length} nhóm cách viết khác nhau thành một khoá. Ví dụ:\n` + ex.slice(0, 6).map(s => '- ' + [...s].slice(0, 3).map(q => `\`${q}\``).join(' ≡ ')).join('\n'))
// Tone-only merges (owner spec "bỏ dấu"): two source queries equal after folding but different before, beyond area aliases.
const toneOnly = ex.filter(s => { const a = [...s].map(q => normalizeQueryV2(q)); const raw = [...s].map(q => String(q).normalize('NFC').toLowerCase()); return new Set(a).size === 1 && new Set(raw.map(q => q.replace(/quận|quan/g, 'q'))).size > 1 && [...s].some(q => /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(q)) && [...s].some(q => !/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(q.replace(/quận/gi, ''))) })
console.log(`\nGộp do bỏ dấu (cần xem có khác nghĩa không): ${toneOnly.length}` + (toneOnly.length ? '\n' + toneOnly.slice(0, 5).map(s => '- ' + [...s].map(q => `\`${q}\``).join(' ≡ ')).join('\n') : ''))

// 3 ─ staleness
const cls = {}
for (const c of calls) if (CACHED.has(c.ep)) { const t = serperTtlV2(c.ep, c.b.q ?? '', {}); const k = `${classOf(c)} (${t / 3600} h)`; cls[k] = (cls[k] ?? 0) + 1 }
console.log(`\n## 3. Hạn dùng v2 theo loại (số yêu cầu)\n\n${Object.entries(cls).sort().map(([k, v]) => `- ${k}: ${v}`).join('\n')}`)
const rec = join('scripts', 'consult', 'replay', 'recordings')
const timeFields = new Set()
if (existsSync(rec)) for (const f of readdirSync(rec)) {
  const j = JSON.parse(readFileSync(join(rec, f), 'utf8')); if (!String(j.url).endsWith('/maps')) continue
  for (const p of j.body?.places ?? []) for (const k of Object.keys(p)) if (/open|now|hours|busy|wait|live/i.test(k)) timeFields.add(k)
}
console.log(`- trường liên quan giờ trong kết quả maps đã ghi: ${[...timeFields].join(', ') || '(không)'} — openingHours là lịch TUẦN; "đang mở" do code tính lúc đọc (serperPlaces.ts), nên 3 ngày không đóng băng trạng thái mở/đóng.`)

// 4 ─ projection per TTL class. Zipf s=1 over K keys per class (assumed, printed); draws inside one TTL window.
const perTurn = tot.serper / tot.turns
const cachedCalls = calls.filter(c => CACHED.has(c.ep))
const cachedShare = cachedCalls.length / Math.max(1, calls.length)
function classOf(c) { const t = ttlV2(c.ep, c.b); return t <= 3_600 ? 'timely' : c.ep === 'maps' ? 'maps' : t === 6 * 3_600 ? 'price' : t === 3 * 86_400 ? 'link' : 'web' }
const CLASS = { maps: { K: 4000, v2Days: 3 }, link: { K: 20000, v2Days: 3 }, price: { K: 8000, v2Days: 0.25 }, web: { K: 20000, v2Days: 1 }, timely: { K: 2000, v2Days: 1 / 24 } }
const share = {}; for (const c of cachedCalls) { const k = classOf(c); share[k] = (share[k] ?? 0) + 1 / cachedCalls.length }
function zipfHit(draws, K) { // expected fraction of draws that repeat an earlier key in the window, Zipf s=1 over K keys
  if (draws <= 1) return 0
  let Z = 0; for (let i = 1; i <= K; i++) Z += 1 / i
  let distinct = 0; for (let i = 1; i <= K; i++) distinct += 1 - Math.pow(1 - 1 / i / Z, draws)
  return 1 - distinct / draws
}
const inflate = r1.unique / Math.max(1, r2.unique) // v1 splits one need over this many more keys (measured, section 2)
console.log(`\n## 4. Ước tính theo quy mô\n\nĐo: ${perTurn.toFixed(2)} yêu cầu Serper/lượt; ${(100 * cachedShare).toFixed(0)}% thuộc loại cache được (images thì không). Theo loại (v2): ${Object.entries(share).map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`).join(' · ')}.`)
console.log(`Giả định: 9 lượt/người/tháng (900 lượt ở 100 người); nhu cầu Zipf s=1 trên K khoá mỗi loại — ${Object.entries(CLASS).map(([k, v]) => `${k} K=${v.K}`).join(', ')}; v1 = 24 h mọi loại, số khoá ×${inflate.toFixed(2)} (cách viết khác nhau, đo ở mục 2).\n`)
console.log('| người dùng/tháng | yêu cầu Serper/tháng | không cache | v1 | v2 | v2 so với v1 |\n|---|---|---|---|---|---|')
for (const users of [100, 1000]) {
  const month = users * 9 * perTurn, cachedMonth = month * cachedShare
  let v1 = 0, v2 = 0
  for (const [k, sh] of Object.entries(share)) {
    const { K, v2Days } = CLASS[k]
    v1 += sh * zipfHit(cachedMonth * sh * 1 / 30, Math.round(K * inflate))
    v2 += sh * zipfHit(cachedMonth * sh * v2Days / 30, K)
  }
  const usd = h => (month - cachedMonth * h) * 0.001
  console.log(`| ${users} | ${Math.round(month)} | $${usd(0).toFixed(2)} | $${usd(v1).toFixed(2)} (trúng ${(100 * v1).toFixed(0)}%) | $${usd(v2).toFixed(2)} (trúng ${(100 * v2).toFixed(0)}%) | ${usd(v1) - usd(v2) >= 0 ? 'rẻ hơn' : 'đắt hơn'} $${Math.abs(usd(v1) - usd(v2)).toFixed(2)} |`)
}
