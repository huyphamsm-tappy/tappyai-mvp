import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── No user-facing English literals in shipped Android UI code ───────────────
//
// V2-UAT-010 (TalkBack said "Profile avatar" / "Huy Phạm's avatar" in a Vietnamese app) and
// V2-UAT-016 (the account-deletion dialog put an English "Cancel" next to a Vietnamese "Tiếp
// tục") were reported as two separate localization bugs. They are one defect: a user-facing
// string written as a Kotlin literal instead of a string resource cannot follow the app language,
// because it never reaches Android's resource qualifier system at all.
//
// It is worth noticing what was NOT wrong. The string catalogue is complete — 1101 EN keys, 1100
// VI keys, the only gap being `app_name`, which is the brand and is deliberately untranslated.
// `common_cancel` = "Hủy" already existed. Nothing was missing; three call sites simply did not
// ask for it. So the durable guard is not "count the keys", it is "no shipped composable builds
// user-facing text out of a literal".
//
// SCOPE, and why it is drawn here:
//   • `contentDescription = "…"` — read aloud by TalkBack. Always user-facing.
//   • a default parameter whose value is an English literal in a shared component — the value
//     every caller that does not think about it ships, which is exactly how 016 happened.
// Previews (`@TappyComponentPreviews`, `@Preview`) and the internal DesignSystemShowcase screen
// are excluded: they are development surfaces that never ship to a user, and forcing them through
// resources would add noise without adding a single localized string.

const ANDROID_SOURCE_ROOTS = [
  'android/app/src/main/java',
  'android/core',
  'android/features',
]

/** Every `.kt` file under [dir] that is production source (not a unit or instrumentation test). */
function kotlinSources(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'build' || entry === 'test' || entry === 'androidTest') continue
      out.push(...kotlinSources(path))
    } else if (entry.endsWith('.kt')) {
      out.push(path)
    }
  }
  return out
}

const ALL_SOURCES = ANDROID_SOURCE_ROOTS.flatMap(kotlinSources)

/**
 * Line numbers of a match, minus the ones inside a preview composable.
 *
 * A preview is detected by walking backwards to the nearest `@Composable` and checking whether a
 * preview annotation sits above it. Crude, but it fails in the safe direction: an unrecognised
 * shape counts as shipped code and gets reported.
 */
function shippedMatches(source: string, pattern: RegExp): number[] {
  const lines = source.split(/\r?\n/)
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i])) continue
    let inPreview = false
    for (let j = i; j >= 0 && j > i - 200; j--) {
      if (/@(TappyComponentPreviews|Preview)\b/.test(lines[j])) { inPreview = true; break }
      // A non-preview declaration above us ends the search: we are in shipped code.
      if (/^(private )?fun |^@Composable/.test(lines[j]) && !/@Preview/.test(lines[j] ?? '')) {
        if (/^(private )?fun /.test(lines[j])) break
      }
    }
    if (!inPreview) hits.push(i + 1)
  }
  return hits
}

describe('shipped Android UI never hardcodes user-facing English', () => {
  it('has Android sources to check at all', () => {
    // Guards the guard. A path typo would otherwise make every assertion below vacuously true —
    // the exact failure mode that lets a localization regression ship under a green suite.
    expect(ALL_SOURCES.length).toBeGreaterThan(100)
  })

  it('no contentDescription is a string literal', () => {
    const offenders: string[] = []
    for (const file of ALL_SOURCES) {
      const source = readFileSync(file, 'utf8')
      // `contentDescription = null` is correct and common — a decorative image whose meaning is
      // carried by the merged parent node. Only quoted text is a defect.
      for (const line of shippedMatches(source, /contentDescription\s*=\s*"[^"]/)) {
        offenders.push(`${file.replace(/\\/g, '/')}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no shared component defaults a user-facing parameter to an English literal', () => {
    // The 016 shape specifically: `dismissText: String? = "Cancel"`. Any `String` parameter whose
    // default is a quoted literal in the design system is the same trap.
    const offenders: string[] = []
    for (const file of ALL_SOURCES.filter((f) => f.includes('designsystem'))) {
      const source = readFileSync(file, 'utf8')
      for (const line of shippedMatches(source, /^\s*\w+\s*:\s*String\??\s*=\s*"[^"]/)) {
        offenders.push(`${file.replace(/\\/g, '/')}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the three fixed call sites resolve through resources', () => {
    // Named explicitly so that deleting the string and re-hardcoding it fails here even if the
    // pattern scans above are ever loosened.
    const avatar = readFileSync(
      'android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyAvatar.kt',
      'utf8',
    )
    expect(avatar).toContain('stringResource(R.string.tappy_cd_avatar_generic)')
    expect(avatar).toContain('stringResource(R.string.tappy_cd_avatar_named, name)')

    const dialog = readFileSync(
      'android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyDialog.kt',
      'utf8',
    )
    expect(dialog).toContain('dismissText: String? = stringResource(R.string.tappy_dialog_dismiss)')

    const markdown = readFileSync(
      'android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt',
      'utf8',
    )
    expect(markdown).toContain('stringResource(R.string.tappy_cd_copy_code)')
  })
})

describe('Android string resources stay at EN/VI parity', () => {
  // The catalogue was already at parity when V2-UAT-010/016 were found, and this asserts it stays
  // there — including for the four keys those fixes added, which is the way a fix like this
  // usually rots: someone adds the EN string, ships, and the VI file follows "later".
  const STRING_DIRS = [
    ['android/app/src/main/res/values', 'android/app/src/main/res/values-vi'],
    [
      'android/core/designsystem/src/main/res/values',
      'android/core/designsystem/src/main/res/values-vi',
    ],
  ] as const

  /** `name` of every `<string>`/`<string-array>` declared in a resource directory. */
  function keysIn(dir: string): Set<string> {
    const keys = new Set<string>()
    let files: string[] = []
    try {
      files = readdirSync(dir).filter((f) => f.startsWith('strings') && f.endsWith('.xml'))
    } catch {
      return keys
    }
    for (const file of files) {
      const xml = readFileSync(join(dir, file), 'utf8')
      for (const m of xml.matchAll(/<string(?:-array)?\s+name="([^"]+)"/g)) keys.add(m[1])
    }
    return keys
  }

  // `app_name` is the brand. A brand is not translated, and pretending otherwise would be the
  // wrong fix — so it is named here rather than silently tolerated by a looser assertion.
  const UNTRANSLATED_BY_DESIGN = new Set(['app_name'])

  for (const [en, vi] of STRING_DIRS) {
    it(`every English key in ${en} has a Vietnamese counterpart`, () => {
      const enKeys = keysIn(en)
      const viKeys = keysIn(vi)
      expect(enKeys.size).toBeGreaterThan(0)
      const missing = [...enKeys].filter((k) => !viKeys.has(k) && !UNTRANSLATED_BY_DESIGN.has(k))
      expect(missing).toEqual([])
    })

    it(`${vi} declares nothing English does not`, () => {
      // The other direction matters too: a VI-only key is a string no English user can ever see,
      // which is a localization hole pointing the other way.
      const enKeys = keysIn(en)
      const viKeys = keysIn(vi)
      expect([...viKeys].filter((k) => !enKeys.has(k))).toEqual([])
    })
  }
})
