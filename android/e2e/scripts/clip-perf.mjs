// Feed clip start-up: signs in, opens Explore, swipes through N slides and collects the app's own `ClipPerf` log lines
// (prepare() -> first rendered frame, per clip; debug/UAT builds only). Test account on UAT.
//   E2E_APK=<apk> node android/e2e/scripts/clip-perf.mjs <outFile> [slides=8]
import fs from 'node:fs'
import * as a from '../lib/adb.mjs'
import { seed } from '../seed/seed-accounts.mjs'

const [out, slidesArg] = process.argv.slice(2)
const slides = Number(slidesArg || 8)
const seeded = await seed()
if (process.env.E2E_APK) a.install(process.env.E2E_APK)
await a.signIn(seeded.users.free.email)
await a.tap('Khám phá', { after: 1500 })
a.adb(['logcat', '-c'], { allowFail: true })
a.sh('am', 'force-stop', a.PKG)
await a.launch()
await a.tap('Khám phá', { after: 6000 })
for (let i = 0; i < slides; i++) {
  a.sh('input', 'swipe', '540', '1700', '540', '500', '350')
  await a.sleep(6000)
}
const log = a.adb(['logcat', '-d', '-s', 'ClipPerf:D'], { allowFail: true }) || ''
const ms = [...log.matchAll(/firstFrame (\d+) ms (\S+)/g)].map((m) => ({ ms: +m[1], clip: m[2] }))
const sorted = ms.map((x) => x.ms).sort((x, y) => x - y)
const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
const res = { samples: ms.length, median_ms: med, min_ms: sorted[0] ?? null, max_ms: sorted.at(-1) ?? null, all: ms }
fs.writeFileSync(out, JSON.stringify(res, null, 2))
console.log(JSON.stringify({ samples: res.samples, median_ms: res.median_ms, min_ms: res.min_ms, max_ms: res.max_ms }))
