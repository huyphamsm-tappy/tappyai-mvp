import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import ts from 'typescript'

// ── The public / app boundary, enforced ──────────────────────────────────────
//
// A stranger who opens a shared Tappy link (a plan, a public result, a review or clip, a profile)
// must see the page — not a location prompt, not the "Chọn ngôn ngữ" modal, not an age gate, not a
// login wall. Those four belong to the signed-in product.
//
// THE RULE, AND WHY NOTHING HAS TO BE REMEMBERED:
//   · The app is the route group `src/app/(app)/`. Its layout mounts the first-visit gates.
//   · Every other route is public. It is discovered here by walking `src/app` — there is no list
//     of public routes to keep up to date. A new page placed outside `(app)` is checked the moment
//     it exists; a gate that leaks into the root layout (the file that wraps EVERYTHING) fails at
//     once. This regression already came back once through a merge; that is the case this catches.
//
// WHAT COUNTS AS A GATE, anywhere in the transitive import graph of a public route entry:
//   1. the gate components themselves — LocationProvider, LanguagePicker, the (app) layout;
//   2. a MOUNT-TIME gate: inside a React effect (or at module/server-render time), code that asks
//      for location (`navigator.geolocation`), or redirects to /login, /register or /age-check;
//   3. in a server module, any `redirect()` to /login, /register or /age-check (a server component
//      runs on every request, so that is a wall by definition).
// Gates inside event handlers and request callbacks are allowed: asking for location when the
// visitor taps "near me", or sending them to log in when they tap "like", is correct.

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const APP = join(SRC, 'app')
const APP_GROUP = '(app)'

const ENTRY_RE = /^(page|layout|template|not-found|error|loading|default|opengraph-image|twitter-image|icon|apple-icon)\.(tsx|ts|jsx|js)$/

const GATE_MODULES: Record<string, string> = {
  [join(SRC, 'components', 'LocationProvider.tsx')]: 'location gate (LocationProvider)',
  [join(SRC, 'components', 'LanguagePicker.tsx')]: 'language modal (LanguagePicker)',
  [join(APP, APP_GROUP, 'layout.tsx')]: 'the (app) layout (mounts every first-visit gate)',
}

const WALL_TARGET = /(['"`])\/(login|register|age-check)\b|loginPathFor|loginPath\b|ageCheckHref/
const LOGIN_TARGET = /(['"`])\/(login|register)\b|loginPathFor|loginPath\b/

// The sign-in flow itself (/login, /register, /auth/*) cannot have a "login wall" — bouncing a
// failed Zalo callback back to /login IS the flow. These routes are still checked for location,
// the language modal and the age gate. This is an exemption, not a registry: a route missing from
// it is checked MORE strictly, never less, so forgetting to update it can only fail the build.
const SIGN_IN_FLOW = new Set(['login', 'register', 'auth'])
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (p === join(APP, 'api')) continue // route handlers render nothing
      walk(p, out)
    } else if (ENTRY_RE.test(name)) out.push(p)
  }
  return out
}

const isAppEntry = (file: string) => relative(APP, file).split(sep)[0] === APP_GROUP
const allEntries = walk(APP)
const publicEntries = allEntries.filter((f) => !isAppEntry(f))

const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
function resolveSpec(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null // a package — outside this app's code
  if (/\.(css|scss|svg|png|jpg|json)$/.test(base)) return null
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const e of EXTS) if (existsSync(base + e)) return base + e
  for (const e of EXTS) if (existsSync(join(base, 'index' + e))) return join(base, 'index' + e)
  return null
}

interface Mod { file: string; sf: ts.SourceFile; imports: string[]; isClient: boolean }
const cache = new Map<string, Mod>()
function load(file: string): Mod {
  const hit = cache.get(file)
  if (hit) return hit
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const imports: string[] = []
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      if (!(ts.isImportDeclaration(n) && n.importClause?.isTypeOnly)) imports.push(n.moduleSpecifier.text)
    } else if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0]) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
      imports.push(n.arguments[0].text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const isClient = /^\s*(['"])use client\1/.test(text)
  const mod = { file, sf, imports: imports.map((s) => resolveSpec(file, s)).filter((x): x is string => !!x), isClient }
  cache.set(file, mod)
  return mod
}

/** Every module a route entry pulls in, with the chain that reached it (for a readable failure). */
function closure(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]])
  const queue = [entry]
  while (queue.length) {
    const f = queue.shift()!
    for (const dep of load(f).imports) {
      if (seen.has(dep)) continue
      seen.set(dep, [...seen.get(f)!, dep])
      queue.push(dep)
    }
  }
  return seen
}

const textOf = (n: ts.Node) => n.getText()
const isGeolocation = (n: ts.Node) => ts.isPropertyAccessExpression(n) && n.name.text === 'geolocation' && textOf(n.expression) === 'navigator'
function isWallRedirect(n: ts.Node): boolean {
  if (ts.isCallExpression(n)) {
    const callee = textOf(n.expression)
    const arg = n.arguments.map(textOf).join(',')
    if (/^(redirect|permanentRedirect|router\.(push|replace)|window\.location\.(assign|replace)|location\.(assign|replace))$/.test(callee) && WALL_TARGET.test(arg)) return true
    if (callee === 'redirectToAgeCheck') return true
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    /(^|\.)location(\.href)?$/.test(textOf(n.left)) && WALL_TARGET.test(textOf(n.right))) return true
  return false
}

/** Gate calls in a subtree, following same-module helper functions one level deep. */
function gatesIn(node: ts.Node, helpers: Map<string, string[]>): string[] {
  const found: string[] = []
  const visit = (n: ts.Node) => {
    if (isGeolocation(n)) found.push('asks for location (navigator.geolocation)')
    else if (isWallRedirect(n)) found.push(`redirects to a wall: ${textOf(n).slice(0, 90)}`)
    else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && helpers.has(n.expression.text)) {
      for (const g of helpers.get(n.expression.text)!) found.push(`${g} (via ${n.expression.text}())`)
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/** Mount-time gates in one module: inside effects, at module scope, or (server) anywhere. */
function mountTimeGates(mod: Mod): string[] {
  const helpers = new Map<string, string[]>()
  const collectHelpers = (n: ts.Node) => {
    const name = ts.isFunctionDeclaration(n) && n.name ? n.name.text
      : ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.name.text
      : null
    if (name) { const g = gatesIn(n, new Map()); if (g.length) helpers.set(name, g) }
    ts.forEachChild(n, collectHelpers)
  }
  collectHelpers(mod.sf)

  const out: string[] = []
  if (!mod.isClient) {
    // Server module: a Next `redirect()` runs while the page renders, i.e. on every request —
    // so a redirect to a wall there is a wall. (Browser navigation helpers in a plain lib file only
    // run when something calls them, which the effect rule below covers.)
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && /^(redirect|permanentRedirect)$/.test(textOf(n.expression)) && WALL_TARGET.test(n.arguments.map(textOf).join(',')))
        out.push(`server redirect to a wall: ${textOf(n).slice(0, 90)}`)
      ts.forEachChild(n, visit)
    }
    visit(mod.sf)
  }
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && EFFECT_HOOKS.has(n.expression.text) && n.arguments[0]) {
      for (const g of gatesIn(n.arguments[0], helpers)) out.push(`in ${n.expression.text}: ${g}`)
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(mod.sf)
  // Module scope (outside any function): runs on import.
  for (const st of mod.sf.statements) {
    if (ts.isExpressionStatement(st)) for (const g of gatesIn(st, new Map())) out.push(`at module load: ${g}`)
  }
  return out
}

function violations(entry: string): string[] {
  const out: string[] = []
  const signInFlow = SIGN_IN_FLOW.has(relative(APP, entry).split(sep)[0])
  for (const [file, chain] of closure(entry)) {
    const via = chain.map((c) => relative(ROOT, c)).join(' → ')
    if (GATE_MODULES[file]) out.push(`${GATE_MODULES[file]}\n      via ${via}`)
    for (const g of mountTimeGates(load(file))) {
      if (signInFlow && LOGIN_TARGET.test(g) && !/age-check|ageCheck/.test(g)) continue
      out.push(`${g}\n      in ${via}`)
    }
  }
  return [...new Set(out)]
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/')

describe('public / app boundary — a stranger on a shared link is never gated', () => {
  it('discovers the public routes by walking src/app (no list to maintain)', () => {
    const pub = publicEntries.map(rel)
    // Anchors: the share targets that MUST stay public. If one is ever moved into (app), this fails.
    for (const must of [
      'src/app/layout.tsx',
      'src/app/plan/[shareId]/page.tsx',
      'src/app/r/[slug]/page.tsx',
      'src/app/reviews/[id]/page.tsx',
      'src/app/users/[id]/page.tsx',
      'src/app/scam-shield/page.tsx',
    ]) expect(pub).toContain(must)
    expect(allEntries.some(isAppEntry)).toBe(true)
  })

  it('the (app) layout is the one place the first-visit gates are mounted', () => {
    const layout = readFileSync(join(APP, APP_GROUP, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/<LocationProvider\s*\/>/)
    expect(layout).toMatch(/<LanguagePicker\s*\/>/)
    for (const [file] of Object.entries(GATE_MODULES)) {
      if (file.endsWith(join(APP_GROUP, 'layout.tsx'))) continue
      const importers = allEntries.filter((e) => !isAppEntry(e) && load(e).imports.includes(file))
      expect(importers.map(rel), `${rel(file)} imported by a public route entry`).toEqual([])
    }
  })

  it.each(publicEntries.map((f) => [rel(f), f]))('%s mounts no location gate, language modal, age gate or login wall', (_name, file) => {
    const v = violations(file as string)
    expect(v, `\n  ✗ ${v.join('\n  ✗ ')}\n`).toEqual([])
  })
})
