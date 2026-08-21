import { describe, it, expect } from 'vitest'
import { vi as viStrings, en as enStrings } from './index'

// `01_CONTROLLER_V2_ARCHITECTURE.md` §8 — "no raw strings".
//
// `useTranslation` falls back to the KEY when a lookup misses, so a string
// added to one locale and not the other renders `admin.userAnalytics.tab.
// retention` in the sidebar of the other. Nothing throws, no test fails, and
// the defect is visible only to somebody reading the app in that language.
//
// `hubGrouping.test.tsx` checks this for nav-group and module labels, which is
// where it was first needed. This checks the WHOLE admin map, so a panel string
// is covered the same way a nav label is.

const viKeys = Object.keys(viStrings).sort()
const enKeys = Object.keys(enStrings).sort()

/**
 * Every literal key the admin UI passes to `t()`.
 *
 * 🔑 THE HOLE THIS CLOSES. The parity tests below prove vi and en carry the
 * SAME keys — and say nothing about whether a key the code actually uses is in
 * either. `admin.common.cancel` shipped to production in two components on
 * 2026-08-21 with no entry at all, so both Cancel buttons rendered the raw key.
 * Symmetry was perfect; the catalogue was simply missing it.
 *
 * Template keys (`t(\`admin.x.${v}\`)`) are deliberately not collected — they
 * are covered by the enum-shaped assertions in the suites that own them.
 */
function literalKeysUsedInCode(): { key: string; file: string }[] {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const out: { key: string; file: string }[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) {
        const text = fs.readFileSync(p, 'utf8')
        // `t('…')` only, and only keys shaped like ours — `.select('hashtags')`
        // ends in `t(` too, which is how the first version of this scan
        // produced three false positives from a Supabase query builder.
        for (const m of text.matchAll(/\bt\('(admin\.[a-zA-Z0-9_.]+)'\)/g)) {
          out.push({ key: m[1], file: p })
        }
      }
    }
  }
  const root = path.join(__dirname, '..', '..', '..')
  walk(path.join(root, 'components', 'admin'))
  walk(path.join(root, 'app', 'admin'))
  // The Controller's PUBLIC surface lives outside /admin — it is the one
  // Controller screen an anonymous visitor can reach, so it is also the one
  // whose missing key would be visible to someone who is not an admin. It uses
  // the same `admin.*` catalogue, so it needs the same scan.
  walk(path.join(root, 'components', 'controller'))
  walk(path.join(root, 'app', 'controller'))
  return out
}

describe('🔑 admin i18n — every key the UI asks for actually exists', () => {
  const used = literalKeysUsedInCode()

  it('the scan found keys at all — otherwise the assertion below is vacuous', () => {
    expect(used.length).toBeGreaterThan(50)
  })

  it('🔑 no literal `t(...)` key is missing from the catalogue', () => {
    const missing = used
      .filter(({ key }) => !(key in viStrings) || !(key in enStrings))
      .map(({ key, file }) => `${key}  <-  ${file}`)
    expect(missing).toEqual([])
  })

  it('the scan reaches the Controller PUBLIC surface, not only /admin', () => {
    // Without this the walk above can quietly stop covering a directory — the
    // scan still finds 300+ keys from /admin and the suite stays green while
    // the public page's strings go unchecked. It is the only Controller screen
    // an anonymous visitor can reach, so a raw key there is the most visible
    // kind there is.
    const fromPublicHome = used.filter(({ file }) => /[\\/]controller[\\/]/.test(file))
    expect(fromPublicHome.length).toBeGreaterThan(0)
  })
})

describe('admin i18n — the two locales carry the same keys', () => {
  it('every Vietnamese key exists in English', () => {
    expect(viKeys.filter((k) => !(k in enStrings))).toEqual([])
  })

  it('every English key exists in Vietnamese', () => {
    expect(enKeys.filter((k) => !(k in viStrings))).toEqual([])
  })

  it('no value is blank — an empty string renders as nothing at all', () => {
    const blank = [...viKeys, ...enKeys].filter(
      (k) => !String(viStrings[k] ?? '').trim() || !String(enStrings[k] ?? '').trim()
    )
    expect(blank).toEqual([])
  })

  // Keys whose two locales are legitimately identical: acronyms ("DAU",
  // "MRR"), a loanword Vietnamese uses unchanged ("Email"), role names, and
  // proper nouns ("Super Admin", "Production", the brand). Pinned as a LIST
  // rather than a pattern so adding another is a deliberate decision.
  const IDENTICAL_BY_DESIGN = [
    'admin.audit.filter.actorIdPlaceholder',
    'admin.role.admin',
    'admin.shell.brand',
    'admin.dashboard.kpi.dau',
    'admin.dashboard.kpi.mrr',
    'admin.home.env.production',
    'admin.rbac.userIdLabel',
    'admin.role.superAdmin',
    'admin.shell.badge',
    'admin.users.detail.email',
    // Public Home: the product name and the copyright line are the same mark in
    // both locales, exactly as the Owner-approved design shows them.
    'admin.publicHome.badge',
    'admin.publicHome.headlineBrand',
    'admin.publicHome.footer',
    // Controller Login: same copyright line, same reason.
    'admin.login.footer',
  ]

  it('🔑 no NEW Vietnamese value is a copy of its English one', () => {
    // A key pasted into both maps with the English text passes a presence check
    // while leaving the Vietnamese UI untranslated — the failure this catches.
    const copied = viKeys.filter(
      (k) => viStrings[k] === enStrings[k] && !IDENTICAL_BY_DESIGN.includes(k)
    )
    expect(copied).toEqual([])
  })

  it('the pinned exceptions are all still real — none was renamed away', () => {
    // Without this, a stale entry silently exempts a key that no longer exists
    // while a genuinely untranslated one takes its place.
    expect(IDENTICAL_BY_DESIGN.filter((k) => viStrings[k] !== enStrings[k])).toEqual([])
  })
})
