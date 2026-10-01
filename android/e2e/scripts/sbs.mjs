// Side-by-side composites: Android (left) | web (right) for every screen name present on both sides.
//   node android/e2e/scripts/sbs.mjs <run dir>/<flow> [outDir]
// <run dir>/<flow>/android/NN-name.png + <run dir>/<flow>/web/NN-name.png  ->  outDir/name.png
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const [flowDir, outDirArg] = process.argv.slice(2)
if (!flowDir) { console.error('usage: sbs.mjs <run>/<flow> [outDir]'); process.exit(1) }
const outDir = outDirArg || path.join(flowDir, 'sbs')
fs.mkdirSync(outDir, { recursive: true })
const names = (side) => Object.fromEntries(fs.readdirSync(path.join(flowDir, side)).filter((f) => f.endsWith('.png')).map((f) => [f.replace(/^\d+-/, '').replace(/\.png$/, ''), path.join(flowDir, side, f)]))
const A = names('android'), W = names('web')
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } })
const both = Object.keys(A).filter((k) => W[k])
for (const k of both) {
  await page.setContent(`<body style="margin:0;background:#222;font:600 22px sans-serif;color:#fff">
    <div style="display:flex;gap:16px;padding:12px;align-items:flex-start">
      <div><div style="padding:4px 0">Android — ${k}</div><img src="${b64(A[k])}" style="height:1500px"></div>
      <div><div style="padding:4px 0">Web — ${k}</div><img src="${b64(W[k])}" style="height:1500px"></div>
    </div></body>`)
  await page.setViewportSize({ width: 1500, height: 1600 })
  await page.screenshot({ path: path.join(outDir, `${k}.png`), fullPage: true })
  console.log('wrote', path.join(outDir, `${k}.png`))
}
console.log('screens only on one side:', Object.keys(A).filter((k) => !W[k]).concat(Object.keys(W).filter((k) => !A[k])).join(', ') || '(none)')
await browser.close()
