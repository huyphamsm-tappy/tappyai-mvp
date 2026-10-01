// UI exerciser: signs the pro test account in on the build, then runs `adb shell monkey` with several seeds and
// collects crashes / ANRs / StrictMode lines from logcat.   Test accounts only (AUDIT database via UAT).
//   E2E_APK=<apk> node android/e2e/scripts/monkey.mjs <outDir> <events> <seed> [seed...]
import fs from 'node:fs'
import path from 'node:path'
import * as a from '../lib/adb.mjs'
import { seed } from '../seed/seed-accounts.mjs'

const [outDir, eventsArg, ...seeds] = process.argv.slice(2)
const events = Number(eventsArg || 3000)
fs.mkdirSync(outDir, { recursive: true })
for (let i = 0; i < 2; i++) a.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'], { allowFail: true })
a.adb(['shell', 'input', 'swipe', '540', '1700', '540', '300', '300'], { allowFail: true })
const seeded = await seed()
if (process.env.E2E_APK) a.install(process.env.E2E_APK)
a.sh('pm', 'grant', a.PKG, 'android.permission.POST_NOTIFICATIONS')
await a.signIn(seeded.users.free.email)
const summary = []
for (const s of seeds) {
  a.adb(['logcat', '-c'], { allowFail: true })
  const started = Date.now()
  const res = a.adb(['shell', 'monkey', '-p', a.PKG, '-s', s, '--throttle', '120', '--pct-syskeys', '3', '--pct-appswitch', '1',
    '--pct-nav', '3', '--pct-majornav', '6', '--pct-touch', '52', '--pct-motion', '25', '--pct-trackball', '0', '--pct-anyevent', '0',
    '--monitor-native-crashes', '-v', String(events)], { allowFail: true }) || ''
  const log = a.adb(['logcat', '-d'], { allowFail: true }) || ''
  fs.writeFileSync(path.join(outDir, `monkey-${s}.out.txt`), res)
  fs.writeFileSync(path.join(outDir, `logcat-${s}.txt`), log)
  const fatal = [...log.matchAll(/FATAL EXCEPTION[\s\S]{0,700}?(?=\n\d\d-\d\d )/g)].map((m) => m[0].split('\n').slice(0, 6).join(' | '))
  const anr = (log.match(/ANR in [^\n]*/g) || []).concat(res.match(/\/\/ NOT RESPONDING[^\n]*/g) || [])
  const crash = (res.match(/\/\/ CRASH[^\n]*/g) || [])
  const strict = (log.match(/StrictMode[^\n]*/g) || []).slice(0, 5)
  const injected = (res.match(/Events injected: (\d+)/) || [])[1]
  summary.push({ seed: s, injected, seconds: Math.round((Date.now() - started) / 1000), crash: crash.length, anr: anr.length, fatal: fatal.slice(0, 3), strict })
  console.log(JSON.stringify(summary.at(-1)))
  await a.launch()
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
