// (h) Composer on the real UAT backend: a PHOTO post, a VIDEO post (real MP4 through the three-step
// upload, metadata neutralised) and a YOUTUBE link post — each must then show on the author's
// profile (Đã đăng) and in Explore (Mới nhất), read back through the API too. Web twin: /reviews/new.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { asUser } from '../lib/api.mjs'

export const webAccount = 'e2e.android.pro@example.com'
const here = path.dirname(fileURLToPath(import.meta.url))
const IMAGE = path.resolve(here, '../../../public/tappy/wave.png')
const CLIP = path.resolve(here, '../fixtures/clip.mp4')
const YT = 'https://www.youtube.com/watch?v=ftsQYS1fkOs'

async function mine(email) {
  const api = await asUser(email)
  const r = await api('/api/reviews/mine')
  return (r.json?.reviews || r.json || []).map((x) => ({ body: x.body, type: x.content_type, source: x.source_type, media: x.media_url || '', photos: x.photos || [] }))
}

async function pickNewest(a, kind = 'Photo') {
  // The system picker (full screen or half sheet) labels each cell "Photo/Video taken on …".
  const cellRe = new RegExp(`^${kind} taken on`)
  let cell
  for (let i = 0; i < 10 && !cell; i++) {
    cell = a.dump().find((n) => n.clickable && cellRe.test(n.desc || ''))
    if (!cell) await a.sleep(1000)
  }
  if (!cell) throw new Error(`picker: no ${kind} cell`)
  await a.tap(cell, { after: 1500 })
  // The multi-select picker (photos) needs its confirm button; the single picker (video) returns at once.
  const add = a.find(/^(Add|Thêm) \(\d+\)$/)
  if (add) await a.tap(add, { after: 1500 })
}

async function openComposer(a) {
  await a.tap('Khám phá', { after: 4000 })
  // The "+" in Explore's header — the only square button left of search there.
  const plus = a.dump().filter((n) => n.clickable && n.y1 < 400 && n.x2 - n.x1 < 160 && n.x2 - n.x1 > 80).sort((x, y) => x.x1 - y.x1)[0]
  await a.tap(plus, { after: 3000 })
  if (!a.visible('Bài viết mới')) throw new Error('composer did not open')
}

async function post(a, body) {
  await a.tap('Chia sẻ trải nghiệm...', { after: 700 }).catch(() => a.tap(/Chia sẻ trải nghiệm/, { after: 700 }))
  await a.pasteText(body)
  await a.hideKeyboard()
  await a.tap('Đăng', { after: 8000 })
}

export async function android({ a, shot, check, seeded }) {
  const email = seeded.users.pro.email
  const stamp = Date.now().toString(36)
  a.adb(['push', IMAGE, '/sdcard/Pictures/e2e-wave.png'])
  a.adb(['push', CLIP, '/sdcard/Movies/e2e-clip.mp4'])
  for (const f of ['/sdcard/Pictures/e2e-wave.png', '/sdcard/Movies/e2e-clip.mp4']) a.sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + f)
  await a.signIn(email)

  // Photo
  await openComposer(a)
  await a.tap('Thêm ảnh', { after: 1500 })
  await pickNewest(a)
  await a.sleep(6000)
  shot('photo-picked')
  const photoBody = `[E2E] ảnh từ Android ${stamp}`
  await post(a, photoBody)
  shot('photo-posted')

  // Video
  await openComposer(a)
  await a.tap('Video', { after: 1200 })
  shot('video-tab')
  check('tab Video có gợi ý "mp4 · mov · tối đa 5 phút · 150MB"', a.visible(/mp4 · mov/))
  await a.tap('Chọn video', { after: 1500 })
  await pickNewest(a, 'Video')
  const t0 = Date.now()
  while (Date.now() - t0 < 240000 && !a.visible('Video đã tải lên') && !a.visible(/Lỗi tải video|chưa đúng định dạng/)) await a.sleep(3000)
  shot('video-uploaded')
  check('video tải lên xong ("Video đã tải lên")', a.visible('Video đã tải lên'), `${Math.round((Date.now() - t0) / 1000)} s`)
  const videoBody = `[E2E] video từ Android ${stamp}`
  await post(a, videoBody)
  shot('video-posted')

  // YouTube link
  await openComposer(a)
  await a.tap('Link', { after: 1200 })
  await a.tap('Dán link', { after: 600 })
  await a.pasteText(YT)
  await a.hideKeyboard()
  await a.waitFor(/Đã đính kèm link/, { timeout: 20000 }).catch(() => {})
  shot('link-pasted')
  const linkBody = `[E2E] link YouTube từ Android ${stamp}`
  await post(a, linkBody)
  shot('link-posted')

  const rows = await mine(email)
  const find = (b) => rows.find((r) => r.body === b)
  const p = find(photoBody), v = find(videoBody), l = find(linkBody)
  check('server: bài ảnh đã lưu, có ảnh', !!p && p.photos.length > 0, JSON.stringify(p || {}).slice(0, 120))
  check('server: bài video đã lưu (video/upload, media_url)', !!v && v.type === 'video' && v.source === 'upload' && /^https:\/\//.test(v.media), JSON.stringify(v || {}).slice(0, 140))
  check('server: bài link YouTube đã lưu', !!l && l.source === 'youtube' && l.media.includes('youtube.com'), JSON.stringify(l || {}).slice(0, 120))

  // They show on the profile (Đã đăng) — Tôi hub cards.
  await a.tap('Tôi', { after: 5000 })
  await a.scrollTo('Đã đăng', { max: 6 })
  a.sh('input', 'swipe', '540', '1600', '540', '700', '600'); await a.sleep(1500)
  shot('profile-posted')
  const onProfile = a.texts().filter((x) => /Chia sẻ|Chính Chủ/.test(x)).length
  check('hồ sơ "Đã đăng" có thêm các bài mới', onProfile >= 2, `${onProfile} thẻ`)
  // …and in Explore (Mới nhất) — for OTHER users: the feed never shows a signed-in user their own
  // posts (api/reviews/feed/route.ts:60, web and app alike), so look as the Free account.
  const other = seeded.users.free.email
  const feed = await (await asUser(other))('/api/reviews/feed?page=0&limit=20&sort=latest')
  const fr = (feed.json?.reviews || feed.json || []).map((x) => x.body || '')
  check('server: feed "Mới nhất" của người khác có các bài mới', [photoBody, videoBody, linkBody].every((b) => fr.includes(b)), fr.filter((b) => b.includes(stamp)).length + '/3')
  await a.signIn(other)
  await a.tap('Khám phá', { after: 3000 })
  await a.tap('Mới nhất', { after: 6000 })
  shot('explore-latest-as-other')
  check('Khám phá "Mới nhất" (tài khoản khác) hiện bài mới', a.texts().some((x) => x.includes(stamp)), 'caption chứa mã ' + stamp)
}

export async function web({ w, page, shot, check }) {
  const stamp = 'w' + Date.now().toString(36)
  const submit = async (body) => {
    await page.getByPlaceholder(/Chia sẻ trải nghiệm/).fill(body)
    await page.getByRole('button', { name: /^Đăng$/ }).click()
    await page.waitForTimeout(8000)
  }
  // Photo
  await w.go('/reviews/new', 4000)
  await page.locator('input[type=file][accept*="image"]').first().setInputFiles(IMAGE)
  await page.waitForTimeout(6000)
  await shot('photo-picked')
  await submit(`[E2E] ảnh từ web ${stamp}`)
  await shot('photo-posted')
  // Video
  await w.go('/reviews/new', 4000)
  await page.getByText('Video', { exact: true }).first().click()
  await page.locator('input[type=file][accept*="video"]').first().setInputFiles(CLIP)
  await page.getByText(/Video đã tải lên/).first().waitFor({ timeout: 240000 }).catch(() => {})
  await shot('video-uploaded')
  await submit(`[E2E] video từ web ${stamp}`)
  // Link
  await w.go('/reviews/new', 4000)
  await page.getByText('YouTube', { exact: true }).first().click()
  await page.locator('input[type=url], input[placeholder*="youtube" i], input[placeholder*="link" i]').first().fill(YT)
  await page.waitForTimeout(4000)
  await shot('link-pasted')
  await submit(`[E2E] link YouTube từ web ${stamp}`)
  const rows = await mine(webAccount)
  const has = (b) => rows.some((r) => r.body === b)
  check('server: bài ảnh (web) đã lưu', has(`[E2E] ảnh từ web ${stamp}`))
  check('server: bài video (web) đã lưu', has(`[E2E] video từ web ${stamp}`))
  check('server: bài link (web) đã lưu', has(`[E2E] link YouTube từ web ${stamp}`))
}
