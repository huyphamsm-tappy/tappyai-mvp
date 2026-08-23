import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Controller V2.1 — Owner Decision D10: the Controller surface has a FIXED DARK
// visual theme.
//
// 🔑 WHAT THIS PINS, AND WHY EACH ASSERTION EXISTS.
//
// D10 is presentation-only. D9 (theme *preference* / switching) is still
// DEFERRED, so the dangerous failure mode here is not "the palette is wrong" —
// it is "somebody quietly added a theme switch and called it D10". Several
// assertions below exist purely to make that impossible to do silently.
//
// The second failure mode is scope. `.admin-theme` must theme the CONTROLLER
// and nothing else; the consumer app keeps its light `:root` and its own
// Header toggle. So the consumer palette is asserted UNCHANGED, not ignored.
//
// MEASURED BEFORE THIS EXISTED: `.admin-theme` was applied as a wrapper class in
// `admin/layout.tsx` but was never defined as a CSS rule anywhere — the only
// match in any stylesheet was a COMMENT. Its tokens therefore resolved from the
// light `:root`, and the Controller rendered white (production `afd18a0`:
// background rgb(255,255,255)) while its own login page was already `#070E1F`.

const ROOT = process.cwd()
const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

/**
 * The stylesheet with comments removed — i.e. what the browser actually applies.
 *
 * 🔑 A STRUCTURAL GUARD MUST SCAN CODE, NOT PROSE. The first version of the
 * `prefers-color-scheme` assertion below scanned the raw file and failed on the
 * theme block's OWN comment, which accurately says the Controller deliberately
 * does not use that query. A guard that cannot tell "this stylesheet has a
 * media query" from "this comment says it must not" is testing the wrong thing,
 * and the alternative — deleting a true comment to make a test pass — is worse.
 * Stripping comments also makes the guard stronger: a real query can no longer
 * be hidden by moving it onto a commented line.
 */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of a top-level CSS rule, comments stripped. */
function ruleBody(selector: string): string | null {
  // Comment-stripped: a selector named inside a comment is not a rule, and that
  // is exactly the state this test was written to catch.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS_CODE)
  return m ? m[1] : null
}

/** `--x: H S% L%` → L, or null. */
function lightnessOf(body: string, token: string): number | null {
  const m = new RegExp(`--${token}\\s*:\\s*[\\d.]+\\s+[\\d.]+%\\s+([\\d.]+)%`).exec(body)
  return m ? Number(m[1]) : null
}

describe('D10 — .admin-theme is a real, dark CSS rule', () => {
  it('🔑 is defined as a RULE, not merely mentioned in a comment', () => {
    // The pre-D10 state: `grep .admin-theme *.css` matched a comment only.
    expect(ruleBody('.admin-theme')).not.toBeNull()
  })

  it('paints a dark surface — background lightness is low', () => {
    const body = ruleBody('.admin-theme') ?? ''
    const l = lightnessOf(body, 'background')
    expect(l).not.toBeNull()
    // Anything above this is not a dark enterprise surface; the shipped page
    // colour is #070E1F ≈ 7.5%.
    expect(l as number).toBeLessThan(20)
  })

  it('paints light text — foreground lightness is high', () => {
    const body = ruleBody('.admin-theme') ?? ''
    const l = lightnessOf(body, 'foreground')
    expect(l).not.toBeNull()
    expect(l as number).toBeGreaterThan(80)
  })

  it('defines the full surface token set, so no role falls back to the light :root', () => {
    const body = ruleBody('.admin-theme') ?? ''
    // A partial override is worse than none: a dark background with a light
    // `--card` produces unreadable cards rather than an obvious failure.
    for (const token of [
      'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
      'muted', 'muted-foreground', 'secondary', 'secondary-foreground', 'border', 'input', 'ring',
    ]) {
      expect(body, `missing --${token}`).toContain(`--${token}:`)
    }
  })

  it('cards and popovers are not darker than the page — elevation reads upward', () => {
    const body = ruleBody('.admin-theme') ?? ''
    const bg = lightnessOf(body, 'background') as number
    expect(lightnessOf(body, 'card') as number).toBeGreaterThanOrEqual(bg)
    expect(lightnessOf(body, 'popover') as number).toBeGreaterThanOrEqual(bg)
  })
})

describe('D10 — the Controller root applies the theme, statically', () => {
  const layout = readFileSync(join(ROOT, 'src/app/admin/layout.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('wraps the Controller in both theme classes', () => {
    // `admin-theme` carries the palette; `dark` makes the `dark:` variants that
    // components already ship (DealsManager alone has 11) actually resolve.
    expect(layout).toMatch(/className="admin-theme dark"/)
  })

  it('🔑 applies them as STATIC classes — no runtime theme decision', () => {
    // A template literal or ternary here would be a theme mode wearing a
    // className, which is precisely what D9 defers and D10 does not ship.
    expect(layout).not.toMatch(/className=\{[^}]*(admin-theme|dark)/)
  })

  it('never touches <html> or <body>', () => {
    // Themeing the document would leak the Controller palette into the consumer
    // app, which shares the root layout.
    expect(layout).not.toMatch(/documentElement|document\.body/)
  })
})

describe('D10 — the consumer app is NOT themed by this', () => {
  it(':root stays the light palette', () => {
    // D10 is scoped to the Controller. If this flips, every consumer surface
    // using a shadcn token changes appearance.
    const root = ruleBody(':root') ?? ''
    expect(CSS).toContain('--background: 0 0% 100%')
    expect(root.length).toBeGreaterThan(0)
  })

  it('no system-preference query was introduced', () => {
    // D10 explicitly excludes system-theme detection. Scans CODE, not prose —
    // see CSS_CODE above for why that distinction is load-bearing here.
    expect(CSS_CODE).not.toContain('prefers-color-scheme')
  })
})

describe('D10 — it is a THEME, not a theme-mode system (D9 stays deferred)', () => {
  const CONTROLLER_DIRS = [
    'src/components/admin',
    'src/components/controller',
    'src/app/admin',
    'src/lib/controller',
  ]

  const files: string[] = []
  const walk = (dir: string) => {
    const abs = join(ROOT, dir)
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry)
      if (statSync(p).isDirectory()) walk(join(dir, entry))
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(p)
    }
  }
  CONTROLLER_DIRS.forEach((d) => walk(d))

  it('the Controller persists no theme anywhere', () => {
    // D9's blocker is the preference contract. Any of these would BE that
    // contract, smuggled in under a presentation change.
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      return /localStorage\s*\.\s*(get|set)Item\s*\(\s*['"`]theme|setTheme|toggleTheme|useTheme|prefers-color-scheme|document\.documentElement\.classList\.(add|toggle)\(\s*['"`]dark/.test(src)
    })
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([])
  })

  it('the Controller ships no theme toggle control', () => {
    const offenders = files.filter((f) => /theme[- ]?(toggle|switch(er)?)/i.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([])
  })
})
