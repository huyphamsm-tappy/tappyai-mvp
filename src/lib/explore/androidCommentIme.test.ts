import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── The keyboard must not cover the Explore comment composer ─────────────────
//
// Device-measured on SM-A127F: opening the comment field on Explore → detail put the input bar at
// y=1418..1465 while the IME started at y≈930. The composer was entirely behind the keyboard — the
// user could not see what they were typing and could not reach Send.
//
// Nothing about the window was wrong. `MainActivity` declares `adjustResize` and calls
// `enableEdgeToEdge()`, which is a deliberate pair: the window does not pan, and each screen
// consumes the IME inset itself so it is subtracted exactly once. That makes consuming it a
// PER-SCREEN obligation. ChatScreen meets it; the review detail never did.
//
// There is a Kotlin test for this too (`ImeInsetContractTest`), and it is the better place to read
// the reasoning. This exists because CI does not run Gradle, so the Kotlin one guards nothing on a
// pull request.
//
// Keyed on the comment bar rather than on a file path: a screen that adopts the bar in future
// inherits the requirement instead of quietly repeating the defect.

const REVIEWS_UI = 'android/app/src/main/java/com/tappyai/app/reviews/ui'
/** Where the bar is declared. It is padded by whichever screen hosts it, not by itself. */
const DECLARATION = 'ReviewCommentSection.kt'

function kotlinFiles(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((p) => statSync(p).isFile() && p.endsWith('.kt'))
    .map((p) => p.replace(/\\/g, '/'))
}

const hostsOfCommentBar = () =>
  kotlinFiles(REVIEWS_UI).filter(
    (p) => !p.endsWith(DECLARATION) && readFileSync(p, 'utf8').includes('ReviewCommentInputBar('),
  )

describe('screens hosting the comment composer consume the IME inset', () => {
  it('at least one screen hosts the comment bar', () => {
    // Guards the guard: with no hosts, the case below would pass while checking nothing.
    expect(hostsOfCommentBar().length).toBeGreaterThan(0)
  })

  it.each(hostsOfCommentBar())('%s applies imePadding()', (file) => {
    expect(readFileSync(file, 'utf8')).toContain('.imePadding()')
  })

  it('the window still leaves the inset to Compose', () => {
    // imePadding() is only correct while the window does NOT also pan. If `adjustPan` ever came
    // back, every screen above would be double-shifted instead of fixed — that regression is
    // recorded in ImeInsetContractTest and has happened on this project before.
    const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"')
    expect(manifest).not.toContain('adjustPan')
    expect(
      readFileSync('android/app/src/main/java/com/tappyai/app/MainActivity.kt', 'utf8'),
    ).toContain('enableEdgeToEdge()')
  })

  it('the shell still yields the bottom nav to the keyboard', () => {
    // The composer moving up only helps if the nav bar is not left sitting on top of it. The shell
    // hides the bar while the IME is up; that is the other half of "the composer is reachable".
    const shell = readFileSync(
      'android/app/src/main/java/com/tappyai/app/home/HomeShellScreen.kt',
      'utf8',
    )
    expect(shell).toMatch(/val imeVisible = WindowInsets\.ime\.getBottom\(LocalDensity\.current\) > 0/)
    expect(shell).toMatch(/if \(!isExpanded && !imeVisible\)/)
  })
})
