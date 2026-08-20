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

  // Ten keys whose two locales are legitimately identical: acronyms ("DAU",
  // "MRR"), a loanword Vietnamese uses unchanged ("Email"), role names, and
  // proper nouns ("Super Admin", "Production", the brand). Pinned as a LIST
  // rather than a pattern so adding an eleventh is a deliberate decision.
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
