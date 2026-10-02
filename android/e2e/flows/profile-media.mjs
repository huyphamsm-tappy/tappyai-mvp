// (g) Avatar + cover upload on the real UAT backend, then a cold restart: both must still be there.
// Android picks through the SYSTEM photo picker (an image pushed into the emulator's gallery);
// the web twin uses /profile/edit's file inputs. The server state is read back through /api/profile.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { asUser } from '../lib/api.mjs'

export const webAccount = 'e2e.android.free@example.com'
const here = path.dirname(fileURLToPath(import.meta.url))
const IMAGE = path.resolve(here, '../../../public/tappy/wave.png')

async function serverProfile(email) {
  const api = await asUser(email)
  return (await api('/api/profile')).json
}

async function pickFirstImage(a) {
  // Android photo picker: the newest image is the first grid cell.
  await a.sleep(2500)
  const cell = a.dump().find((n) => /Photo|Ảnh|image/i.test(n.desc) && n.clickable && n.y1 > 300)
    || a.dump().filter((n) => n.clickable && n.x2 - n.x1 > 200 && n.x2 - n.x1 < 400 && n.y1 > 400)[0]
  if (!cell) throw new Error('photo picker: no image cell')
  await a.tap(cell, { after: 1500 })
}

export async function android({ a, shot, check, seeded }) {
  const email = seeded.users.free.email
  // An image in the gallery for the picker.
  a.adb(['push', IMAGE, '/sdcard/Pictures/e2e-wave.png'])
  a.sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Pictures/e2e-wave.png')
  const before = await serverProfile(email)

  await a.signIn(email)
  await a.tap('Tôi', { after: 4000 })
  await a.tap('Chỉnh sửa hồ sơ', { after: 4000 })
  shot('edit')
  check('màn sửa hồ sơ có mục "Ảnh bìa"', a.visible(/^ẢNH BÌA$|^Ảnh bìa$/))

  await a.tap('Thay ảnh bìa', { after: 1500 })
  shot('picker-cover')
  await pickFirstImage(a)
  await a.waitGone(/Đang tải ảnh bìa/, { timeout: 60000 }).catch(() => {})
  await a.sleep(6000)
  shot('cover-uploaded')
  check('có nút "Gỡ ảnh bìa" sau khi tải lên', a.visible('Gỡ ảnh bìa'))

  const avatar = a.find(/Đổi ảnh đại diện|Thay ảnh đại diện|ảnh đại diện/i)
  if (avatar) {
    await a.tap(avatar, { after: 1500 })
    await pickFirstImage(a)
    await a.sleep(8000)
    shot('avatar-uploaded')
  }
  const after = await serverProfile(email)
  check('server: cover_url đã đổi', !!after.cover_url && after.cover_url !== before.cover_url)
  check('server: avatar_url đã đổi', !!avatar && !!after.avatar_url && after.avatar_url !== before.avatar_url, avatar ? '' : 'không tìm thấy nút ảnh đại diện')

  // Cold restart: the hub hero shows the cover, the edit screen still offers "Gỡ ảnh bìa".
  await a.launch({ fresh: true })
  await a.tap('Tôi', { after: 5000 })
  shot('after-restart-hub')
  await a.tap('Chỉnh sửa hồ sơ', { after: 4000 })
  shot('after-restart-edit')
  check('sau khi mở lại app: ảnh bìa vẫn còn', a.visible('Gỡ ảnh bìa'))
}

export async function web({ w, page, shot, check }) {
  const email = webAccount
  const before = await serverProfile(email)
  await w.go('/profile/edit', 3000)
  await page.getByText('Ảnh bìa').first().waitFor({ timeout: 30000 })
  await shot('edit', true)
  const inputs = page.locator('input[type=file]')
  const n = await inputs.count()
  // The cover input is the one inside the cover section.
  await page.locator('[data-edit-cover] input[type=file]').setInputFiles(IMAGE).catch(async () => inputs.nth(n - 1).setInputFiles(IMAGE))
  await page.waitForTimeout(8000)
  await shot('cover-uploaded', true)
  await inputs.first().setInputFiles(IMAGE)
  await page.waitForTimeout(8000)
  await shot('avatar-uploaded', true)
  const after = await serverProfile(email)
  check('server: cover_url đã đổi', !!after.cover_url && after.cover_url !== before.cover_url)
  check('server: avatar_url đã đổi', !!after.avatar_url && after.avatar_url !== before.avatar_url)
  await w.go('/profile', 5000)
  await shot('after-reload-profile', true)
  check('sau khi tải lại: ảnh bìa hiện trên /profile', (await page.locator('img[src*="cover"]').count()) > 0)
}
