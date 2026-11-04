// Device/configuration matrix on the emulator: sets a display / font / theme / language / rotation configuration, visits the key screens
// of the signed-in app, screenshots each, then RESETS the emulator.   Test accounts only.
//   E2E_APK=<apk> node android/e2e/scripts/matrix.mjs <outDir> <config> [config...]
// configs: base · small360 · fold · tablet · font13 · font15 · light · dark · en · landscape · small-font15
import fs from 'node:fs'
import path from 'node:path'
import * as a from '../lib/adb.mjs'
import { seed } from '../seed/seed-accounts.mjs'

const CONFIGS = {
  base: {},
  small360: { size: '720x1280', density: '320' }, // 360 x 640 dp
  fold: { size: '1840x2208', density: '420' }, // ~ 700 x 840 dp (unfolded foldable)
  tablet: { size: '1600x2560', density: '320' }, // 800 x 1280 dp
  font13: { font: '1.3' },
  font15: { font: '1.5' },
  light: { night: 'no' },
  dark: { night: 'yes' },
  en: { locale: 'en-US' },
  landscape: { rotation: 1 },
  'small-font15': { size: '720x1280', density: '320', font: '1.5' },
}
const TABS = {
  vi: { home: 'Trang chủ', chat: 'Chat', explore: 'Khám phá', deals: 'Deals', me: 'Tôi', settings: 'Cài đặt' },
  en: { home: 'Home', chat: 'Chat', explore: 'Explore', deals: 'Deals', me: 'Me', settings: 'Settings' },
}

const [outDir, ...names] = process.argv.slice(2)
fs.mkdirSync(outDir, { recursive: true })
const seeded = await seed()
if (process.env.E2E_APK) a.install(process.env.E2E_APK)
a.sh('pm', 'grant', a.PKG, 'android.permission.POST_NOTIFICATIONS')
await a.signIn(seeded.users.free.email)

const reset = () => {
  a.sh('wm', 'size', 'reset'); a.sh('wm', 'density', 'reset')
  a.sh('settings', 'put', 'system', 'font_scale', '1.0')
  a.sh('settings', 'put', 'system', 'accelerometer_rotation', '0'); a.sh('settings', 'put', 'system', 'user_rotation', '0')
  a.sh('cmd', 'uimode', 'night', 'yes')
  try { a.sh('cmd', 'locale', 'set-app-locales', a.PKG, '--locales', 'vi') } catch { /* older images */ }
}

for (const name of names) {
  const c = CONFIGS[name]
  if (!c) { console.log('unknown config', name); continue }
  reset()
  for (let i = 0; i < 2; i++) a.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'], { allowFail: true })
  a.adb(['shell', 'input', 'swipe', '540', '1700', '540', '300', '300'], { allowFail: true })
  if (c.size) a.sh('wm', 'size', c.size)
  if (c.density) a.sh('wm', 'density', c.density)
  if (c.font) a.sh('settings', 'put', 'system', 'font_scale', c.font)
  if (c.night) a.sh('cmd', 'uimode', 'night', c.night)
  if (c.rotation) { a.sh('settings', 'put', 'system', 'user_rotation', String(c.rotation)) }
  if (c.locale) { try { a.sh('cmd', 'locale', 'set-app-locales', a.PKG, '--locales', c.locale) } catch (e) { console.log('locale failed', String(e).slice(0, 100)) } }
  await a.sleep(2500)
  await a.launch()
  await a.sleep(3000)
  const T = TABS[c.locale ? 'en' : 'vi']
  const dir = path.join(outDir, name); fs.mkdirSync(dir, { recursive: true })
  let n = 0
  const shot = (label) => { fs.writeFileSync(path.join(dir, `${String(++n).padStart(2, '0')}-${label}.png`), a.adb(['exec-out', 'screencap', '-p'], { binary: true })) }
  const visit = async (label, tab, extra) => {
    try {
      if (tab) await a.tap(tab, { after: 3500, timeout: 8000 })
      if (extra) await extra()
    } catch (e) { console.log(`  [${name}] ${label}: ${String(e).slice(0, 90)}`) }
    shot(label)
  }
  await visit('home', T.home)
  await visit('chat', T.chat)
  await visit('explore', T.explore)
  await visit('deals', T.deals)
  await visit('me', T.me)
  await visit('settings', null, async () => {
    // upward swipes only: a downward swipe from the top edge pulls the notification shade
    let st = a.find(T.settings)
    for (let i = 0; i < 10 && !(st && st.y1 > 200 && st.y2 < 2050); i++) { a.swipe('up'); await a.sleep(800); st = a.find(T.settings) }
    if (st) await a.tap(st, { after: 3500 })
  })
  console.log('done', name, n, 'shots')
}
reset()
