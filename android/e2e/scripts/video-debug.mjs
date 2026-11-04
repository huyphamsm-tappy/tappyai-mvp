// Debug helper: the composer's video pick on the build in E2E_APK (or the installed one), step by step, with screenshots + logcat.
//   E2E_ONLY=android node android/e2e/scripts/video-debug.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as a from '../lib/adb.mjs'
import { seed } from '../seed/seed-accounts.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '../out/video-debug'); fs.mkdirSync(out, { recursive: true })
const CLIP = path.resolve(here, '../fixtures/clip.mp4')
let n = 0
const shot = (name) => { const f = path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`); fs.writeFileSync(f, a.adb(['exec-out', 'screencap', '-p'], { binary: true })); console.log('shot', f) }

const seeded = await seed()
if (process.env.E2E_APK) a.install(process.env.E2E_APK)
a.adb(['push', CLIP, '/sdcard/Movies/e2e-clip.mp4'])
a.sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Movies/e2e-clip.mp4')
await a.signIn(seeded.users.pro.email)
await a.tap('Khám phá', { after: 4000 })
const plus = a.dump().filter((x) => x.clickable && x.y1 < 400 && x.x2 - x.x1 < 160 && x.x2 - x.x1 > 80).sort((p, q) => p.x1 - q.x1)[0]
await a.tap(plus, { after: 3000 })
await a.tap('Video', { after: 1200 })
await a.tap('Chọn video', { after: 3000 })
shot('picker')
console.log('cells:', a.dump().filter((x) => /taken on|Video/.test(x.desc || x.text || '')).map((x) => x.desc || x.text).slice(0, 8))
const cell = a.dump().find((x) => x.clickable && /^Video taken on/.test(x.desc || ''))
if (cell) { await a.tap(cell, { after: 4000 }); shot('after-pick') }
for (let i = 0; i < 8; i++) { await a.sleep(5000); shot(`wait-${i}`); if (a.visible('Video đã tải lên')) break }
