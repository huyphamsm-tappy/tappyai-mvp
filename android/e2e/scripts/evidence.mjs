// Turns an e2e run into committed evidence:
//   <archive>/<run>/<flow>/compare/<NN-step>.png           — web | Android (| D:/redesign) side by side
//   <archive>/<run>/<flow>/{android,web}/…                 — raw per-step PNGs + videos
//   docs/uat/evidence/android-parity/<flow>/RESULT.md        — checks, PASS/FAIL, UAT SHA, run id, paths
// Rule 2026-09-28: no image or video is committed to git; <archive> = D:/TappyAI-backups/android-parity-evidence.
//
//   node android/e2e/scripts/evidence.mjs [runId]      (default: the latest run)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, '..', 'out')
const runId = process.argv[2] || fs.readdirSync(outDir).filter((d) => fs.existsSync(path.join(outDir, d, 'results.json'))).sort().pop()
const run = path.join(outDir, runId)
const { results, uatSha } = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8'))
const docs = path.resolve(here, '../../../docs/uat/evidence/android-parity')
const archive = path.join(process.env.EVIDENCE_ARCHIVE || 'D:/TappyAI-backups/android-parity-evidence', runId)

// The D:/redesign mockup each flow is measured against (when there is one).
const REDESIGN = {
  'age-gate': 'ChatGPT Image Sep 10, 2026, 11_46_20 AM.png',
  onboarding: 'ChatGPT Image Sep 11, 2026, 11_12_16 AM.png',
  recommendations: 'ChatGPT Image Sep 22, 2026, 01_41_30 PM.png',
  'profile-hub': 'ChatGPT Image Sep 22, 2026, 01_53_39 PM.png',
  saved: 'ChatGPT Image Sep 28, 2026, 02_06_53 PM.png',
  'viet-content': 'ChatGPT Image Sep 28, 2026, 02_12_14 PM.png',
}

const pngs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [])
const stepName = (f) => f.replace(/^\d+-/, '').replace(/\.png$/, '')
const b64 = (p) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()
for (const flow of [...new Set(results.map((r) => r.flow))]) {
  const docDir = path.join(docs, flow)
  fs.mkdirSync(docDir, { recursive: true })
  const dest = path.join(archive, flow, 'compare')
  fs.mkdirSync(dest, { recursive: true })
  const aDir = path.join(run, flow, 'android')
  const wDir = path.join(run, flow, 'web')
  const aShots = pngs(aDir)
  const wShots = pngs(wDir)
  const redesign = REDESIGN[flow] ? path.join('D:/redesign', REDESIGN[flow]) : null
  const steps = [...new Set([...aShots, ...wShots].map(stepName))]
  let i = 0
  for (const step of steps) {
    const w = wShots.find((f) => stepName(f) === step)
    const a = aShots.find((f) => stepName(f) === step)
    const cols = [['Web UAT', w && path.join(wDir, w)], ['Android uat', a && path.join(aDir, a)]]
    if (redesign && i === 0) cols.push(['D:/redesign', redesign])
    const html = `<body style="margin:0;background:#1b1b1b;font-family:sans-serif"><div style="padding:10px;color:#ddd;font-size:15px">${flow} · ${step} · UAT ${uatSha.slice(0, 7)} · run ${runId}</div><div style="display:flex;gap:14px;padding:0 10px 10px;align-items:flex-start">${cols.map(([l, p]) => `<div style="width:380px"><div style="color:#fff;font-size:14px;margin-bottom:6px">${l}</div>${p ? `<img src="${b64(p)}" style="width:380px;border:1px solid #444">` : '<div style="color:#999;border:1px dashed #555;height:120px;display:flex;align-items:center;justify-content:center">không có bước này</div>'}</div>`).join('')}</div></body>`
    await page.setViewportSize({ width: 20 + cols.length * 394, height: 300 })
    await page.setContent(html)
    await page.waitForTimeout(150)
    await page.screenshot({ path: path.join(dest, `${String(++i).padStart(2, '0')}-${step}.png`), fullPage: true })
  }
  const rows = results.filter((r) => r.flow === flow)
  const md = [`# ${flow}`, '', `Run \`${runId}\` · UAT \`${uatSha}\``, '',
    ...rows.flatMap((r) => [`## ${r.platform}: ${r.pass ? 'PASS' : 'FAIL'}${r.error ? ` — ${r.error}` : ''}`, '', ...r.checks.map((c) => `- ${c.pass ? '✅' : '❌'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`), '']),
    `Side-by-side images: \`${dest.replace(/\\/g, '/')}/\` (${steps.length} steps).`,
    `Video + raw screenshots: \`${path.join(archive, flow).replace(/\\/g, '/')}/{android,web}/\` (outside git — rule 2026-09-28).`]
  fs.writeFileSync(path.join(docDir, 'RESULT.md'), md.join('\n') + '\n')
  fs.cpSync(path.join(run, flow), path.join(archive, flow), { recursive: true })
  console.log(`${flow}: ${steps.length} step images → ${dest}`)
}
fs.copyFileSync(path.join(run, 'results.json'), path.join(archive, 'results.json'))
await browser.close()
