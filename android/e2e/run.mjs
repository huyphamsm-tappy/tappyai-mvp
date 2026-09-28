// One command for the whole Android ↔ web e2e suite against UAT:
//
//   node android/e2e/run.mjs                 # every flow, Android + web
//   node android/e2e/run.mjs chat nav-back   # some flows
//   E2E_ONLY=android node android/e2e/run.mjs profile
//
// Needs: the uat APK built (gradlew :app:assembleUat), an emulator on E2E_SERIAL (default
// emulator-5556), D:/TappyAI-backups/{uat-e2e.env,vercel-bypass.txt}. Seeds the AUDIT accounts first.
// Output: android/e2e/out/<run>/<flow>/{android,web}/NN-step.png + video, results.json, summary.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as a from './lib/adb.mjs'
import { openWeb } from './lib/web.mjs'
import { UAT_BASE, bypassSecret } from './lib/env.mjs'
import { seed } from './seed/seed-accounts.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const APK = process.env.E2E_APK || path.join(here, '../app/build/outputs/apk/uat/app-uat.apk')
const only = process.env.E2E_ONLY // 'android' | 'web'
const flowsDir = path.join(here, 'flows')
const all = fs.readdirSync(flowsDir).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort()
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all

const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outRoot = path.join(here, 'out', runId)
fs.mkdirSync(outRoot, { recursive: true })

const uatSha = await fetch(UAT_BASE + '/api/version', { headers: { 'x-vercel-protection-bypass': bypassSecret() } }).then((r) => r.json()).then((j) => j.v).catch(() => 'unknown')
console.log(`UAT ${UAT_BASE} @ ${uatSha} — run ${runId}`)
const seeded = await seed()
if (only !== 'web') {
  a.install(APK)
  a.sh('cmd', 'uimode', 'night', 'yes')
  a.sh('pm', 'grant', a.PKG, 'android.permission.POST_NOTIFICATIONS')
}

const results = []
for (const name of wanted) {
  const flow = await import(`./flows/${name}.mjs`)
  for (const platform of ['android', 'web']) {
    if (only && only !== platform) continue
    if (!flow[platform]) continue
    const dir = path.join(outRoot, name, platform)
    fs.mkdirSync(dir, { recursive: true })
    const checks = []
    const check = (label, pass, detail = '') => { checks.push({ label, pass: !!pass, detail }); console.log(`  ${pass ? '✔' : '✘'} ${label}${detail ? ' — ' + detail : ''}`) }
    console.log(`▶ ${name} [${platform}]`)
    let error = null
    const t0 = Date.now()
    if (platform === 'android') {
      const rec = new a.Recorder(dir)
      rec.startVideo()
      try { await flow.android({ a, rec, shot: (n) => rec.shot(n), check, seeded }) } catch (e) { error = e.message; try { rec.shot('error') } catch {} }
      await rec.stopVideo()
    } else {
      const w = await openWeb({ email: flow.webAccount ?? null, dir })
      try { await flow.web({ w, page: w.page, shot: (n, full) => w.shot(n, full), check, seeded }) } catch (e) { error = e.message; try { await w.shot('error') } catch {} }
      await w.close()
    }
    if (error) console.log(`  ✘ ERROR ${error}`)
    const pass = !error && checks.length > 0 && checks.every((c) => c.pass)
    results.push({ flow: name, platform, pass, error, checks, seconds: Math.round((Date.now() - t0) / 1000) })
  }
}

fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify({ runId, uat: UAT_BASE, uatSha, results }, null, 2))
const lines = [`# e2e ${runId}`, '', `UAT ${UAT_BASE} @ \`${uatSha}\``, '', '| flow | platform | result | checks |', '|---|---|---|---|']
for (const r of results) lines.push(`| ${r.flow} | ${r.platform} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.checks.filter((c) => c.pass).length}/${r.checks.length}${r.error ? ' — ' + r.error : ''} |`)
fs.writeFileSync(path.join(outRoot, 'summary.md'), lines.join('\n') + '\n')
console.log('\n' + lines.slice(4).join('\n') + `\n\nout: ${outRoot}`)
process.exit(results.every((r) => r.pass) ? 0 : 1)
