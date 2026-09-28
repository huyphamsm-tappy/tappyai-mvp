// Proves from BUILD OUTPUTS (not sources) that the release variant carries neither the uat test hook
// nor the Vercel bypass secret nor the uat backend. Builds no artifact: it runs the release
// manifest-merge and BuildConfig tasks only (the release-artifact guard in app/build.gradle.kts
// is not triggered by them), then inspects what they produced.
//
//   node android/e2e/scripts/verify-release-clean.mjs
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bypassSecret } from '../lib/env.mjs'

const androidDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const javaHome = process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr'
const r = spawnSync(path.join(androidDir, 'gradlew.bat'), [':app:processReleaseMainManifest', ':app:generateReleaseBuildConfig', ':app:processUatMainManifest', '--console=plain', '-q'], {
  cwd: androidDir, shell: true, env: { ...process.env, JAVA_HOME: javaHome }, encoding: 'utf8',
})
if (r.status !== 0) { console.error(r.stdout.slice(-2000), r.stderr.slice(-2000)); process.exit(1) }

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f } else if (e.name === name) return p
  }
  return null
}
const out = path.join(androidDir, 'app/build/intermediates')
const releaseManifest = findFile(path.join(out, 'merged_manifest/release'), 'AndroidManifest.xml')
const uatManifest = findFile(path.join(out, 'merged_manifest/uat'), 'AndroidManifest.xml')
const releaseConfig = findFile(path.join(androidDir, 'app/build/generated/source/buildConfig/release'), 'BuildConfig.java')

const secret = bypassSecret()
const checks = [
  ['release merged manifest exists', !!releaseManifest],
  ['release manifest has NO UatTestHookActivity', releaseManifest && !fs.readFileSync(releaseManifest, 'utf8').includes('UatTestHook')],
  ['uat manifest DOES have UatTestHookActivity (the check can see it)', uatManifest && fs.readFileSync(uatManifest, 'utf8').includes('UatTestHookActivity')],
  ['release BuildConfig exists', !!releaseConfig],
  ['release BuildConfig does NOT contain the bypass secret', releaseConfig && !fs.readFileSync(releaseConfig, 'utf8').includes(secret)],
  ['release BuildConfig VERCEL_BYPASS_SECRET is empty', releaseConfig && /VERCEL_BYPASS_SECRET = ""/.test(fs.readFileSync(releaseConfig, 'utf8'))],
  ['release BuildConfig does not point at uat.tappyai.com', releaseConfig && !fs.readFileSync(releaseConfig, 'utf8').includes('uat.tappyai.com')],
]
let ok = true
for (const [name, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`); ok &&= !!pass }
process.exit(ok ? 0 : 1)
