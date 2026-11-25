// A small secret scan of the files git tracks (A4, 20/11/2026): fails (exit 1) when a tracked file holds something that looks like a live credential. No third-party service, no network.
// It prints the FILE and LINE and the KIND of match, never the matched text. Run: `node scripts/scanSecrets.mjs`.
// A line that must stay (a documented example, a public key id) is allowed by putting `secret-scan:allow` on the same line, with a reason; whole paths are allowed in ALLOWED_PATHS below.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** [kind, pattern]. Kept narrow on purpose: a noisy scan gets switched off. */
export const PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
  ['OpenAI-style secret key', /\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{32,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe live secret key', /\b[sr]k_live_[0-9A-Za-z]{20,}\b/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/],
]

/** Paths whose content is deliberately fake or documentary. Each carries its reason. */
export const ALLOWED_PATHS = [
  /^scripts\/scanSecrets(?:\.test)?\.mjs$/, // this scanner and its own fake samples
  /^package-lock\.json$/, // integrity hashes, not credentials
  /^\.env\.local\.example$/, // placeholders ("MIGH...") that show the shape of a value
  /^android\/app\/google-services\.json$/, // Firebase client config: its API keys are public by design (they ship inside the app; restrictions are set in the Google console)
  /^\.github\/workflows\/ios\.yml$/, // checks that a decoded secret STARTS with a PEM header; no key is stored in the file
  /^src\/lib\/ai\/agent\/runtime\/toolRegistry\.test\.ts$/, // fake tool names and sample tokens in a unit test
  /^src\/lib\/ai\/agent\/streaming\.test\.ts$/, // a fake "system key" sentence used to test the output guard
  /^src\/lib\/security\/safePost\.test\.ts$/, // a regex that READS a PEM block from a child process output in a test
]

/** The findings of one text: [{ line, kind }] (1-based). Pure. */
export function findSecrets(text) {
  const out = []
  const lines = String(text).split(/\r?\n/)
  lines.forEach((ln, i) => {
    if (ln.includes('secret-scan:allow')) return
    for (const [kind, re] of PATTERNS) if (re.test(ln)) { out.push({ line: i + 1, kind }); break }
  })
  return out
}

export function isAllowedPath(p) {
  return ALLOWED_PATHS.some(re => re.test(p))
}

/** Tracked, text-looking files. Binary and very large files are skipped. */
export function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)
}

function main() {
  const findings = []
  for (const f of trackedFiles()) {
    if (isAllowedPath(f) || /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|mp3|mp4|zip|gz|jar|keystore|jks|xcassets|icns|ogg|wav|mov)$/i.test(f)) continue
    let text
    try { text = readFileSync(f, 'utf8') } catch { continue }
    if (text.length > 2_000_000 || text.includes('\u0000')) continue
    for (const h of findSecrets(text)) findings.push(`${f}:${h.line}  ${h.kind}`)
  }
  if (findings.length) {
    console.error(`Possible secrets in tracked files (${findings.length}). The matched text is not printed. Remove it and rotate the credential, or, for a documented example, add "secret-scan:allow <reason>" on that line.`)
    for (const f of findings) console.error('  ' + f)
    process.exit(1)
  }
  console.log('secret scan: no credential-shaped text in tracked files')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
