// Generates src/lib/i18n/w4/<name>.ts from the Android string resources, so the
// Web and Android key sets are literally identical (same resource names).
//
//   repoRoot -> android/app/src/main/res/{values,values-vi}/strings_*.xml
//            -> parse -> src/lib/i18n/w4/*.ts
//
// Android positional format specifiers (%1$s, %2$d) become the web dictionary's
// {1}, {2} placeholders, which translate() substitutes from its `vars` map.
//
// Safety contract (a hard-coded absolute path here once made this script read and
// write a *different* checkout while it was run from a git worktree, silently
// editing another branch's files):
//   1. No absolute paths. repoRoot is derived from this file's own location.
//   2. Every read and write is asserted to stay inside that repoRoot.
//   3. Missing Android resources abort with a clear message — never a partial
//      or empty generation, and never a fallback to some other checkout.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/** Abort with a readable message rather than a stack trace. */
function fail(message, detail = []) {
  console.error(`\n✗ gen-i18n-w4: ${message}`)
  for (const line of detail) console.error(`    ${line}`)
  console.error(`\n  repo root resolved to: ${ROOT}`)
  console.error('  (resolved from this script\'s location — pass no paths)\n')
  process.exit(1)
}

/** Every path this script touches must resolve inside ROOT. */
function inside(p, what) {
  const abs = resolve(p)
  const rel = relative(ROOT, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    fail(`refusing to ${what} outside the repository`, [`path:      ${abs}`, `repo root: ${ROOT}`])
  }
  return abs
}

// Confirm ROOT really is this project, so a moved/copied script fails loudly
// instead of generating into an unrelated directory.
for (const marker of ['package.json', 'android', 'src/lib/i18n']) {
  if (!existsSync(join(ROOT, marker))) {
    fail('this does not look like the TappyAI repository root', [
      `missing marker: ${marker}`,
      'expected layout: <repo>/scripts/gen-i18n-w4.mjs alongside <repo>/android and <repo>/src',
    ])
  }
}

const RES = inside(join(ROOT, 'android/app/src/main/res'), 'read')
const OUT = inside(join(ROOT, 'src/lib/i18n/w4'), 'write')

// Android resource file -> generated web module name + the screens that use it.
const MODULES = [
  ['strings_common', 'common', 'shared Account/Settings chrome'],
  ['strings_account', 'account', '/profile/account, /profile/edit'],
  ['strings_history', 'history', '/profile/history'],
  ['strings_bookings', 'bookings', '/profile/bookings'],
  ['strings_preferences', 'preferences', '/profile/preferences'],
  ['strings_saved', 'saved', '/profile/favorites'],
  ['strings_pricetracking', 'priceTracking', '/profile/price-watches'],
  ['strings_memory', 'memory', '/profile/tappy-knows'],
  ['strings_myreviews', 'myReviews', '/profile/posts'],
  ['strings_groupdining', 'groupDining', '/group/new, /group/[id]'],
  ['strings_app_connections', 'appConnections', '/profile/integrations'],
]

// Fail up front, listing everything that is missing, rather than dying on the
// first file: if the Android resources are not on this branch the whole
// generation is invalid and the caller needs the full picture.
{
  if (!existsSync(RES)) {
    fail('Android resources not found', [
      `expected: ${RES}`,
      'the Android app must be present on this branch before web localization can be generated',
    ])
  }
  const missing = []
  for (const [xml] of MODULES) {
    for (const locale of ['values', 'values-vi']) {
      const p = join(RES, locale, `${xml}.xml`)
      if (!existsSync(p)) missing.push(relative(ROOT, p).replace(/\\/g, '/'))
    }
  }
  if (missing.length) {
    fail(`${missing.length} required Android resource file(s) missing`, [
      ...missing,
      '',
      'Web localization is generated from the Android resources; generating without',
      'them would silently drop keys the web code calls. Merge the Android branch first.',
    ])
  }
}

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&')
    // Android string escapes
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    // %1$s / %1$d -> {1}  (positional, same order as Android)
    .replace(/%(\d)\$[sd]/g, (_, n) => `{${n}}`)
}

function parse(file) {
  const src = readFileSync(inside(file, 'read'), 'utf8')
  const out = new Map()
  const re = /<string name="([^"]+)"([^>]*)>([\s\S]*?)<\/string>/g
  let m
  while ((m = re.exec(src))) {
    const [, name, attrs, body] = m
    if (/translatable="false"/.test(attrs)) continue // brand names, emails
    out.set(name, decode(body))
  }
  return out
}

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"

/** Single write choke point — nothing reaches disk without the containment check. */
function write(file, body) {
  writeFileSync(inside(file, 'write'), body, 'utf8')
}

mkdirSync(OUT, { recursive: true })
const index = []
let total = 0

for (const [xml, mod, screens] of MODULES) {
  const en = parse(join(RES, 'values', `${xml}.xml`))
  const vi = parse(join(RES, 'values-vi', `${xml}.xml`))

  const keys = [...en.keys()]
  if (keys.length === 0) fail(`${xml}.xml (values) declares no strings — refusing to emit an empty module`)

  const missingVi = keys.filter((k) => !vi.has(k))
  if (missingVi.length) console.warn(`! ${xml}: no vi for ${missingVi.join(', ')}`)

  const emit = (map) =>
    keys.map((k) => `  ${q(k)}: ${q(map.get(k) ?? en.get(k))},`).join('\n')

  const body = `// GENERATED from android/app/src/main/res/{values,values-vi}/${xml}.xml
// Keys are the Android resource names verbatim so Web and Android share one key
// set — t('${keys[0]}') on web is R.string.${keys[0]} on Android.
// Screens: ${screens}
// Regenerate rather than hand-editing: keep the two platforms in lockstep.
export const vi: Record<string, string> = {
${emit(vi)}
}

export const en: Record<string, string> = {
${emit(en)}
}
`
  write(join(OUT, `${mod}.ts`), body)
  index.push([mod, keys.length])
  total += keys.length
  console.log(`${mod}.ts  ${keys.length} keys`)
}

// webOnly.ts is hand-maintained (see its header) and merged last.
const all = [...index.map(([m]) => m), 'webOnly']
const idx = `// Wave 4 — Account & Settings screens. Every module except webOnly is
// GENERATED from the Android string resources (see each file's header) so the
// two platforms cannot drift: the web key IS the Android resource name.
${all.map((m) => `import { vi as ${m}Vi, en as ${m}En } from './${m}'`).join('\n')}

export const w4vi: Record<string, string> = {
${all.map((m) => `  ...${m}Vi,`).join('\n')}
}

export const w4en: Record<string, string> = {
${all.map((m) => `  ...${m}En,`).join('\n')}
}
`
write(join(OUT, 'index.ts'), idx)
console.log(`\ntotal ${total} keys across ${index.length} modules`)
console.log(`wrote to ${relative(ROOT, OUT).replace(/\\/g, '/')} (repo root: ${ROOT})`)
