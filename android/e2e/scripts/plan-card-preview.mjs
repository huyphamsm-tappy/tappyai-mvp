// Offline plan card v2 render on the emulator (uat build, no chat call):
//   node android/e2e/scripts/plan-card-preview.mjs <reply-with-[TAPPY_PLAN].txt> <out.png> [manifest.json] [displayHeight]
// Writes the fixture via run-as, opens UatPlanCardPreviewActivity on a tall virtual display, screencaps, resets.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const ADB = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe')
const S = ['-s', 'emulator-5556']
const PKG = 'com.tappyai.app.staging'
const [reply, out, manifest, height = '5200'] = process.argv.slice(2)
const sh = (...a) => spawnSync(ADB, [...S, 'shell', ...a], { encoding: 'utf8' }).stdout
const put = (name, content) => {
  const r = spawnSync(ADB, [...S, 'shell', 'run-as', PKG, 'sh', '-c', `'mkdir -p files/e2e && cat > files/e2e/${name}'`], { input: content })
  if (r.status !== 0) throw new Error('run-as failed ' + r.stderr)
}
put('plancard.txt', fs.readFileSync(reply))
if (manifest) put('planmanifest.json', fs.readFileSync(manifest)); else spawnSync(ADB, [...S, 'shell', 'run-as', PKG, 'rm', '-f', 'files/e2e/planmanifest.json'])
sh('am', 'force-stop', PKG)
sh('wm', 'size', `1080x${height}`)
await new Promise(r => setTimeout(r, 2500))
sh('am', 'start', '-W', '-n', `${PKG}/com.tappyai.app.uat.UatPlanCardPreviewActivity`)
await new Promise(r => setTimeout(r, manifest ? 9000 : 5000))
fs.writeFileSync(out, spawnSync(ADB, [...S, 'exec-out', 'screencap', '-p'], { maxBuffer: 256 << 20 }).stdout)
sh('am', 'force-stop', PKG)
sh('wm', 'size', 'reset')
console.log('saved', out)
