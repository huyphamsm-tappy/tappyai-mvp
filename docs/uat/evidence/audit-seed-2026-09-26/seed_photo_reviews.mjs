// Seed synthetic PHOTO reviews on the AUDIT project so Explore has content for manual UAT
// (owner approval 2026-09-26: "create the Storage bucket you need — non-public, synthetic images only").
//
// - Refuses any Supabase ref but the audit one (PRE-FLIGHT CHECK 2).
// - Creates a NON-public bucket `uat-seed-media`; images are served through 180-day signed URLs
//   (host *.supabase.co is in next.config images.remotePatterns, so next/image renders them).
// - Images are generated here: gradients + shapes + a "UAT" label, JPEG with no metadata. No real photos.
// - Inserts one review per image under the pre-existing manual.uat.* test accounts (new rows only —
//   nothing existing is modified; manual.uat.fresh is left empty on purpose). Idempotent: a place_id
//   that already exists is skipped.
// - Never prints the service-role key or a signed-URL token.
//   node docs/uat/evidence/audit-seed-2026-09-26/seed_photo_reviews.mjs
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/audit-seed-2026-09-26`
const req = createRequire(W + '/package.json')
const pg = req('pg'); const sharp = req('sharp')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const base = e.NEXT_PUBLIC_SUPABASE_URL
const ref = (base || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') { console.error('REFUSING: not the audit project:', ref); process.exit(2) }
const key = e.SUPABASE_SERVICE_ROLE_KEY
if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2) }
const log = []; const say = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); log.push(s); console.log(s) }
say(`PRE-FLIGHT CHECK 2: target ${ref} = AUDIT (non-prod).`)

const BUCKET = 'uat-seed-media'
const auth = { Authorization: `Bearer ${key}`, apikey: key }
const EXPIRES = 180 * 24 * 3600

// 1. bucket (non-public)
{
  const r = await fetch(`${base}/storage/v1/bucket`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['image/jpeg'] }) })
  const body = await r.text()
  if (r.ok) say('bucket created', BUCKET, 'public=false')
  else if (/already exists|Duplicate/i.test(body)) say('bucket exists', BUCKET)
  else { say('bucket create FAILED', r.status, body.slice(0, 200)); process.exit(1) }
  const info = await (await fetch(`${base}/storage/v1/bucket/${BUCKET}`, { headers: auth })).json()
  say('bucket state', { id: info.id, public: info.public })
  if (info.public !== false) { say('REFUSING: bucket is public'); process.exit(1) }
}

// 2. content — fictional places, synthetic images
const SEED = [
  { slug: 'pho-bo', author: 'manual.uat.user@tappyai.com', place: 'Quán Phở Bò (UAT)', addr: 'Quận 3, TP. Hồ Chí Minh', rating: 5, colors: ['#F6D5A8', '#D9822B'], label: 'Phở bò', body: 'Nước dùng trong, thơm quế hồi, thịt bò mềm. Buổi sáng hơi đông nhưng lên món nhanh. [UAT ảnh tổng hợp]', tags: ['pho', 'anuong'] },
  { slug: 'banh-mi', author: 'manual.uat.pro@tappyai.com', place: 'Tiệm Bánh Mì Góc Phố (UAT)', addr: 'Quận 1, TP. Hồ Chí Minh', rating: 4, colors: ['#FBE7C6', '#C8742C'], label: 'Bánh mì', body: 'Vỏ giòn, pate béo, nhiều rau. Giá hợp lý cho bữa sáng nhanh. [UAT ảnh tổng hợp]', tags: ['banhmi', 'anuong'] },
  { slug: 'ca-phe-muoi', author: 'manual.uat.admin@tappyai.com', place: 'Cà Phê Sân Thượng (UAT)', addr: 'Quận Bình Thạnh, TP. Hồ Chí Minh', rating: 5, colors: ['#EADBC8', '#6F4E37'], label: 'Cà phê muối', body: 'Không gian yên tĩnh, có ổ cắm, hợp làm việc buổi chiều. Cà phê muối đậm vị. [UAT ảnh tổng hợp]', tags: ['caphe', 'lamviec'] },
  { slug: 'bun-cha', author: 'manual.uat.user@tappyai.com', place: 'Bún Chả Hàng Than (UAT)', addr: 'Quận Ba Đình, Hà Nội', rating: 4, colors: ['#F3E3C3', '#8C5A2B'], label: 'Bún chả', body: 'Chả nướng thơm than hoa, nước chấm vừa miệng. Chỗ ngồi hơi chật giờ trưa. [UAT ảnh tổng hợp]', tags: ['buncha', 'hanoi'] },
  { slug: 'cho-dem', author: 'manual.uat.pro@tappyai.com', place: 'Chợ Đêm Ven Sông (UAT)', addr: 'TP. Đà Lạt, Lâm Đồng', rating: 4, colors: ['#1E2A5A', '#F2A541'], label: 'Chợ đêm', body: 'Nhiều món nướng và đồ len, nên đi sau 19h. Nhớ mang áo ấm. [UAT ảnh tổng hợp]', tags: ['dalat', 'dulich'] },
  { slug: 'spa-thu-gian', author: 'manual.uat.admin@tappyai.com', place: 'Spa Lá Xanh (UAT)', addr: 'Quận 7, TP. Hồ Chí Minh', rating: 5, colors: ['#DDEFE3', '#3E8E63'], label: 'Spa', body: 'Massage chân 60 phút rất thư giãn, nhân viên nhẹ nhàng. Nên đặt trước cuối tuần. [UAT ảnh tổng hợp]', tags: ['spa', 'thugian'] },
  { slug: 'rap-phim', author: 'manual.uat.user@tappyai.com', place: 'Rạp Chiếu Phim Trung Tâm (UAT)', addr: 'Quận 10, TP. Hồ Chí Minh', rating: 4, colors: ['#2B1B3D', '#E0457B'], label: 'Xem phim', body: 'Ghế êm, âm thanh tốt, bắp nước hơi đắt. Suất khuya vắng người. [UAT ảnh tổng hợp]', tags: ['xemphim', 'giaitri'] },
  { slug: 'tai-nghe', author: 'manual.uat.pro@tappyai.com', place: 'Cửa Hàng Âm Thanh (UAT)', addr: 'Quận 5, TP. Hồ Chí Minh', rating: 4, colors: ['#E6ECF5', '#2F5C9E'], label: 'Tai nghe', body: 'Được nghe thử trước khi mua, tư vấn kỹ về chống ồn. Có bảo hành chính hãng. [UAT ảnh tổng hợp]', tags: ['muasam', 'congnghe'] },
]
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
async function makeImage({ colors: [a, b], label }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#g)"/>
  <circle cx="540" cy="620" r="300" fill="#ffffff" fill-opacity="0.22"/>
  <circle cx="540" cy="620" r="210" fill="#ffffff" fill-opacity="0.28"/>
  <circle cx="820" cy="260" r="90" fill="#ffffff" fill-opacity="0.15"/>
  <text x="540" y="1110" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(label)}</text>
  <text x="540" y="1200" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#ffffff" fill-opacity="0.8" text-anchor="middle">UAT · ảnh tổng hợp</text>
</svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 84, mozjpeg: true }).toBuffer() // sharp writes no EXIF unless asked
}

// 3. DB
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const ids = Object.fromEntries((await c.query(`select email, id from auth.users where email = any($1)`, [[...new Set(SEED.map(s => s.author))]])).rows.map(r => [r.email, r.id]))
const existing = new Set((await c.query(`select place_id from public.reviews where place_id like 'community_uat_seed_%'`)).rows.map(r => r.place_id))
const planned = []
for (const [i, s] of SEED.entries()) {
  const placeId = `community_uat_seed_${s.slug}`
  if (existing.has(placeId)) { say('skip (exists)', placeId); continue }
  if (!ids[s.author]) { say('REFUSING: missing author', s.author); process.exit(1) }
  const img = await makeImage(s)
  const path = `reviews/${s.slug}.jpg`
  const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: img })
  if (!up.ok) { say('upload FAILED', path, up.status, (await up.text()).slice(0, 200)); process.exit(1) }
  const sg = await fetch(`${base}/storage/v1/object/sign/${BUCKET}/${path}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: EXPIRES }) })
  const signed = (await sg.json()).signedURL
  if (!signed) { say('sign FAILED', path); process.exit(1) }
  const url = `${base}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`
  // the signed URL must actually serve the image, and the bucket itself must NOT (non-public)
  const got = await fetch(url); const pub = await fetch(`${base}/storage/v1/object/public/${BUCKET}/${path}`)
  say('image', path, { bytes: img.length, signedGet: got.status, contentType: got.headers.get('content-type'), publicGet: pub.status })
  if (got.status !== 200 || pub.status === 200) { say('REFUSING: signed URL not serving or bucket readable publicly'); process.exit(1) }
  planned.push({ ...s, placeId, url, userId: ids[s.author], createdAt: new Date(Date.now() - (i + 1) * 5 * 3600 * 1000).toISOString() })
}
await c.query('BEGIN')
try {
  for (const p of planned) {
    const r = await c.query(
      `insert into public.reviews (user_id, place_id, place_name, place_address, rating, body, photos, content_type, media_url, thumbnail, hashtags, source_type, publication_state, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,'photo',$8,$8,$9,'upload','PUBLISHED',$10) returning id`,
      [p.userId, p.placeId, p.place, p.addr, p.rating, p.body, [p.url], p.url, p.tags, p.createdAt])
    say('inserted review', r.rows[0].id, p.placeId, 'by', p.author)
  }
  await c.query('COMMIT')
} catch (err) { await c.query('ROLLBACK'); say('INSERT FAILED (rolled back)', String(err.message).slice(0, 300)); process.exit(1) }
const after = (await c.query(`select content_type, count(*)::int n from public.reviews where publication_state='PUBLISHED' and not is_hidden group by 1 order by 1`)).rows
say('published reviews now', after)
await c.end()
say(`signed URLs expire in ${EXPIRES / 86400} days (${new Date(Date.now() + EXPIRES * 1000).toISOString().slice(0, 10)}); re-run after that to re-sign (delete the seed rows first).`)
writeFileSync(`${EV}/seed-run.log`, log.join('\n') + '\n')
