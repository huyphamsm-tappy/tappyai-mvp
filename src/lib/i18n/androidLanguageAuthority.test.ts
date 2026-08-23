import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── The app language must be read when it is used, never captured ────────────
//
// Device-reproduced: with the app in Vietnamese, switching to English left the Home hero rendering
// the new language's eyebrow ("Hi there 👋") directly above a greeting still in Vietnamese, and it
// stayed that way until the next force stop. The owner saw the mirror image of the same defect —
// Vietnamese UI, English greeting — and reported it as anonymous-vs-authenticated. It is not:
// signing in rebuilds the Home graph, which recomputes the greeting, so the authenticated leg only
// looked correct.
//
// The mechanism is that two authorities answer "what language is this screen in":
//
//   • Android's resource system, which re-resolves `values-vi/` vs `values/` on a configuration
//     change and therefore always matches what the user sees.
//   • `LanguageManager.current`, which is correct at the moment it is read — but `HomeViewModel`
//     read it ONCE, in its constructor, and below API 33 (minSdk is 26; the test device is 31) a
//     language switch does not recreate the ViewModel.
//
// So the value was not wrong, it was STALE, and no amount of checking translations would have
// found it. The fix removes the second authority from Home entirely: the composable passes
// `booleanResource(R.bool.resources_are_english)`, which by construction is whatever chose the
// strings beside it.
//
// This guards the class of defect, not the one screen: a language read that sits in a property
// initialiser is captured for the lifetime of the object, and that lifetime is not the screen's.

const ANDROID_SOURCE_ROOTS = ['android/app/src/main/java', 'android/core', 'android/features']

/** Reads the current language rather than merely referring to the language types. */
const LANGUAGE_READ = /\b(languageManager|AppLanguageResolver)\s*\.\s*(current|currentTag)\b/

/**
 * Property initialisers that read the language on purpose, each with the reason.
 *
 * `SettingsViewModel.language` is the language PICKER's own selection state. It seeds from the
 * current value and is then driven by `selectLanguage`, so a stale read is impossible — the user
 * changing it is the thing that changes it.
 */
const ALLOWED_CAPTURES: Record<string, string> = {
  'android/app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt':
    "the language picker's own selection state, updated by selectLanguage",
}

function kotlinSources(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'build' || entry === 'test' || entry === 'androidTest') continue
      kotlinSources(path, out)
    } else if (entry.endsWith('.kt')) {
      out.push(path.replace(/\\/g, '/'))
    }
  }
  return out
}

/**
 * Language reads that are captured rather than evaluated on demand.
 *
 * A read is fine inside a `fun` body or a `get()` accessor — both run when the caller asks. It is
 * NOT fine in a property initialiser or an `init` block, which run once when the object is built.
 *
 * The question is whether the read sits inside a function body, so this tracks brace depth forward
 * through the file and records the depth at which each `fun`/`get()` body opens. A read is on
 * demand exactly while such a body is open.
 *
 * Two simpler rules were tried and both were wrong, which is why this one is worth its length.
 * Stopping at the nearest `val` walking backwards flags the local `val` a read is usually written
 * as. Walking backwards to the nearest `fun` instead crosses SIBLING members, so a property
 * initialiser declared after any function in the same class is read as being inside that function.
 */
function capturedLanguageReads(): Array<{ file: string; line: number; text: string }> {
  const found: Array<{ file: string; line: number; text: string }> = []
  const DECLARES_FUN = /^\s*(@\w+\s+)*(override\s+|private\s+|internal\s+|public\s+|protected\s+)*(suspend\s+)?fun\s|^\s*get\(\)/

  for (const root of ANDROID_SOURCE_ROOTS) {
    for (const file of kotlinSources(root)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      let depth = 0
      /** Brace depths at which a function body is currently open. */
      const funBodies: number[] = []
      /** Inside a `fun … =` whose expression body continues on following lines. */
      let expressionBody = false

      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        const isComment = /^\s*(\*|\/\/|\/\*)/.test(line)
        const declaresFun = !isComment && DECLARES_FUN.test(code)

        if (
          LANGUAGE_READ.test(line) && !isComment &&
          funBodies.length === 0 && !declaresFun && !expressionBody
        ) {
          // A single-line `fun x() = <read>` is on demand and is caught by `declaresFun`; one that
          // wraps onto the next line is caught by `expressionBody`.
          found.push({ file, line: i + 1, text: line.trim() })
        }

        // `fun provideX(): T =` with the body on the following line. Cleared once that expression
        // closes, which for every such function in this codebase is the very next line.
        if (declaresFun && !code.includes('{') && /=\s*$/.test(code)) expressionBody = true
        else if (expressionBody && !declaresFun) expressionBody = false

        for (const ch of code) {
          if (ch === '{') {
            depth++
            if (declaresFun && funBodies.length === 0) funBodies.push(depth)
          } else if (ch === '}') {
            if (funBodies.length && depth === funBodies[funBodies.length - 1]) funBodies.pop()
            depth--
          }
        }
      })
    }
  }
  return found
}

describe('the app language is read on demand, never captured', () => {
  it('finds Kotlin sources to scan at all', () => {
    // Guards the guard: a broken path would make every case below pass vacuously.
    expect(ANDROID_SOURCE_ROOTS.flatMap((r) => kotlinSources(r)).length).toBeGreaterThan(100)
  })

  it('no ViewModel captures the language in a property initialiser', () => {
    const offenders = capturedLanguageReads().filter((f) => !(f.file in ALLOWED_CAPTURES))

    expect(
      offenders.map((f) => `${f.file}:${f.line} — ${f.text}`),
      'a language read in a property initialiser is frozen for the object\'s lifetime; move it into a function or a get() accessor',
    ).toEqual([])
  })

  it('the deliberate exceptions still exist, so the allowlist cannot rot', () => {
    // An allowlist entry that no longer matches anything is worse than no entry: it silently grants
    // permission to a file that may since have grown a real capture.
    const captured = capturedLanguageReads().map((f) => f.file)
    for (const allowed of Object.keys(ALLOWED_CAPTURES)) {
      expect(captured, `${allowed} no longer captures the language — drop it from the allowlist`)
        .toContain(allowed)
    }
  })
})

describe('Home takes its greeting language from the resolved resources', () => {
  const BOOLS_EN = 'android/app/src/main/res/values/bools_language.xml'
  const BOOLS_VI = 'android/app/src/main/res/values-vi/bools_language.xml'
  const HOME_SCREEN = 'android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt'
  const HOME_VM = 'android/app/src/main/java/com/tappyai/app/home/HomeViewModel.kt'
  const read = (p: string) => readFileSync(p, 'utf8')

  it('the flag is declared in both locales and disagrees between them', () => {
    // If both said the same thing the flag would be a constant, and a constant cannot track the
    // configuration — which is the entire job.
    expect(read(BOOLS_EN)).toMatch(/<bool name="resources_are_english">true<\/bool>/)
    expect(read(BOOLS_VI)).toMatch(/<bool name="resources_are_english">false<\/bool>/)
  })

  it('the hero greeting is passed the resource-resolved flag', () => {
    expect(read(HOME_SCREEN)).toMatch(
      /viewModel\.greeting\(booleanResource\(R\.bool\.resources_are_english\)\)/,
    )
  })

  it('HomeViewModel no longer consults the language store', () => {
    // The greeting used to be `val greeting: String = run { ... languageManager.current ... }`.
    // Asserting the absence of the store is what makes reintroducing that shape fail here.
    const vm = read(HOME_VM)
    const code = vm
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toMatch(/LanguageManager|languageManager|AppLanguage\b/)
    expect(code).toMatch(/fun greeting\(english: Boolean\): String/)
  })
})
