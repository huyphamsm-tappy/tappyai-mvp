// CONSULTATIVE-40 runner — audit env only, authed as the audit user (bearer from the audit
// .env.local; never printed). usage: node eval40.mjs <ids...|all> [--out dir] [--loc]
// Each id = one /api/chat turn; follow-ups reuse their parent's thread (prior assistant text +
// decision evidence id). Writes <out>/<id>.json with prose, frames, tool rows, timing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod'
const PROD_REF = 'fwznnobrdctuskgrvuik'
const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const env = parse(W + '/.env.local')
if (env.NEXT_PUBLIC_SUPABASE_URL.includes(PROD_REF)) throw new Error('prod')
const BASE = 'http://localhost:3101'
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i === -1 ? d : args[i + 1] }
const OUT = opt('--out', 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/docs/audit/eval/runs')
const withLoc = args.includes('--loc')
mkdirSync(OUT, { recursive: true })

// id → [query, parentId?]
const Q = {
  F1: ['Tìm quán ăn tối ngon gần Quận 1 cho 2 người'],
  F2: ['tim quan bun bo ngon o q1 duoi 80k'],
  F3: ['Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?'],
  F4: ['Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận'],
  F5: ['quán này mở mấy giờ?', 'F4'],
  F6: ['quán số 2 có đông không?', 'F1'],
  F7: ['ăn gì ngon giờ'],
  F8: ['Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1'],
  S1: ['Mua tai nghe bluetooth dưới 1 triệu, pin trâu'],
  S2: ['mua laptop van phong duoi 15tr'],
  S3: ['cái rẻ nhất có tốt không?', 'S2'],
  S4: ['Robot hút bụi cho nhà có chó, tầm 5-7 triệu'],
  S5: ['quà sinh nhật cho bạn gái tầm 1tr'],
  S6: ['mua gì bây giờ'],
  S7: ['Máy lọc không khí cho phòng ngủ 20m2'],
  S8: ['Nồi chiên không dầu 5L loại nào tốt'],
  T1: ['Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu'],
  T2: ['khach san da nang gan bien duoi 1tr/dem'],
  T3: ['Cái thứ hai có bao gồm ăn sáng không?', 'T2'],
  T4: ['Cuối tuần này gia đình 4 người đi đâu gần Sài Gòn?'],
  T5: ['đi chơi ở đâu'],
  T6: ['Hội An có gì hay, đi 1 ngày'],
  T7: ['Vé máy bay Sài Gòn Hà Nội tuần sau rẻ nhất'],
  T8: ['Resort Phú Quốc cho kỷ niệm 1 năm, sang chút'],
  P1: ['Spa nào tốt rẻ ở Đà Nẵng'],
  P2: ['spa massage chan gan q1 duoi 300k'],
  P3: ['chỗ đó có đặt trước được không?', 'P2'],
  P4: ['Đi spa với mẹ cuối tuần, chỗ nào yên tĩnh sạch sẽ Quận 7'],
  P5: ['massage'],
  P6: ['Spa couple cho 2 người tối nay gần Quận 1'],
  P7: ['gội đầu dưỡng sinh gần đây'],
  P8: ['Spa nào mở khuya sau 22h ở Quận 3'],
  E1: ['Tối nay đi chơi gì với hội bạn 5 người ở Quận 1'],
  E2: ['rap phim nao gan q1'],
  E3: ['quán bar nào chill có nhạc sống Quận 1'],
  E4: ['chỗ đó có giữ xe không?', 'E3'],
  E5: ['cuối tuần làm gì'],
  E6: ['Karaoke cho 10 người tầm 100k/người Gò Vấp'],
  E7: ['Xem phim gì hay tối nay'],
  E8: ['Chỗ chơi cho trẻ em 5 tuổi cuối tuần ở Sài Gòn'],
}
const ids = args.filter(a => !a.startsWith('--') && a !== opt('--out') ).includes('all') ? Object.keys(Q) : args.filter(a => Q[a])

const HCMC = { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }

async function turn(id) {
  const [text, parent] = Q[id]
  const messages = []
  let evidenceId
  if (parent) {
    const p = JSON.parse(readFileSync(`${OUT}/${parent}.json`, 'utf8'))
    for (const m of p.thread) messages.push(m)
    evidenceId = p.evidenceId
  }
  messages.push({ role: 'user', content: text })
  const body = { messages, ...(withLoc ? { userLocation: HCMC } : {}), ...(evidenceId ? { decisionEvidenceId: evidenceId } : {}) }
  const t0 = Date.now()
  const res = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tappy-surface': 'web', 'accept-language': 'vi', 'x-audit-turn': id, Authorization: 'Bearer ' + env.AUDIT_TEST_USER_BEARER },
    body: JSON.stringify(body),
  })
  const status = res.status
  const eid = res.headers.get('x-decision-evidence-id')
  const raw = await res.text()
  const ms = Date.now() - t0
  let prose = ''
  const frames8 = []; const toolResults = []; const toolCalls = []; const other = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('0:')) { try { prose += JSON.parse(line.slice(2)) } catch { prose += '<bad0>' } }
    else if (line.startsWith('8:')) { try { frames8.push(JSON.parse(line.slice(2))) } catch { other.push(line.slice(0, 200)) } }
    else if (line.startsWith('a:')) { try { const r = JSON.parse(line.slice(2)); toolResults.push(r) } catch { other.push(line.slice(0, 200)) } }
    else if (line.startsWith('9:')) { try { toolCalls.push(JSON.parse(line.slice(2))) } catch { other.push(line.slice(0, 200)) } }
    else if (line.startsWith('3:')) other.push(line.slice(0, 300))
  }
  const rows = toolResults.flatMap(r => {
    const res = r.result ?? {}
    const list = res.results ?? res.search_results ?? res.shopping_results ?? []
    return (Array.isArray(list) ? list : []).map(x => ({ name: x.name ?? x.title, rating: x.rating_value ?? x.rating, count: x.rating_count ?? x.user_ratings_total, price: x.price_range_text ?? x.price ?? x.price_vnd, hours: x.opening_hours, distance_km: x.distance_km, address: x.address }))
  })
  const shortlist = toolResults.flatMap(r => r.result?._tappy_shortlist ?? [])
  const record = {
    id, text, parent: parent ?? null, status, ms, evidenceId: eid ?? evidenceId ?? null,
    toolCalls: toolCalls.map(c => ({ tool: c.toolName, args: c.args })),
    rows, shortlist: shortlist.map(s => ({ name: s.name, role: s.role, evidence: s.evidence })),
    hardGaps: toolResults.map(r => r.result?._tappy_hard_gaps).find(Boolean) ?? null,
    frames8: frames8.map(f => Array.isArray(f) ? f.map(x => ({ type: x?.type, n: x?.places?.length ?? x?.view?.places?.length, keys: Object.keys(x ?? {}) })) : { keys: Object.keys(f ?? {}) }),
    prose, other,
    thread: [...messages, { role: 'assistant', content: prose }],
  }
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify(record, null, 2))
  console.log(`${id} ${status} ${ms}ms tools=${toolCalls.map(c => c.toolName).join(',') || '-'} rows=${rows.length} shortlist=${shortlist.length} prose=${prose.length}ch`)
}

for (const id of ids) {
  try { await turn(id) } catch (e) { console.log(id, 'ERROR', String(e).slice(0, 200)) }
}
