// Lay the screenshots of one folder out in a single row (for fast visual review).
//   node android/e2e/scripts/montage.mjs <dir> [outFile] [height]
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const [dir, outArg, hArg] = process.argv.slice(2)
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort()
const out = outArg || path.join(dir, '_montage.png')
const h = Number(hArg || 1100)
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: h + 60 } })
await page.setContent(`<body style="margin:0;background:#333;font:600 18px sans-serif;color:#fff"><div style="display:flex;gap:10px;padding:8px;align-items:flex-start">${files.map((f) => `<div><div>${f.replace('.png', '')}</div><img src="${b64(f)}" style="height:${h}px"></div>`).join('')}</div></body>`)
await page.screenshot({ path: out, fullPage: true })
console.log('wrote', out, files.length, 'images')
await browser.close()
