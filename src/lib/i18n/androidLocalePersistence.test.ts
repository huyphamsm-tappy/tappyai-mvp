import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Android app-language persistence, guarded from the web test suite ────────
//
// V2-UAT-001: choose English, force stop, relaunch → the app is Vietnamese again. Not a rendering
// glitch — the stored PREFERENCE was gone, and Settings showed Tiếng Việt.
//
// Root cause: `LanguageManager` sets the language with
// `AppCompatDelegate.setApplicationLocales()` and nothing else. On API 33+ the platform owns and
// persists that value. Below 33 AppCompat persists it only when the manifest declares
// `androidx.appcompat.app.AppLocalesMetadataHolderService` with `autoStoreLocales=true`; with no
// such node AppCompat logs "Service not found" and keeps the locale in the current process only.
// `minSdk` is 26, so API 26–32 — the UAT device, an SM-A127F on API 31, among them — lost the
// choice on every process start.
//
// V2-UAT-005 is the SAME defect one layer out, which is why both are guarded here: Deals reads
// `LanguageManager.current` per request to build `?lang=`, `current` reads AppCompat's state back,
// and after a restart that state was empty → null → the device locale. English chrome, Vietnamese
// data. Fixing the Deals client alone could never have fixed it.
//
// Static source assertions are the mechanism deliberately: CI does not run Gradle, so a text-level
// contract check on the manifest is the only guard that can actually run on every push. It cannot
// prove the runtime behaviour — that needs the device UAT recorded in the fix report — but it can
// prove the one line whose absence caused this never silently disappears again.

const MANIFEST = 'android/app/src/main/AndroidManifest.xml'
const BUILD_GRADLE = 'android/app/build.gradle.kts'
const LANGUAGE_MANAGER =
  'android/app/src/main/java/com/tappyai/app/language/LanguageManager.kt'
const DEALS_REPOSITORY =
  'android/app/src/main/java/com/tappyai/app/deals/data/RealDealsRepository.kt'

const read = (path: string) => readFileSync(path, 'utf8')

/**
 * The `<service>` element whose `android:name` is [name], attributes and children included.
 *
 * Throws rather than returning empty when the element is absent, so a rename or a deletion fails
 * loudly here instead of quietly satisfying a `not.toContain` somewhere else.
 */
function serviceElement(manifest: string, name: string): string {
  const at = manifest.indexOf(name)
  if (at === -1) throw new Error(`no <service> declares android:name="${name}"`)
  const open = manifest.lastIndexOf('<service', at)
  const close = manifest.indexOf('</service>', at)
  if (open === -1 || close === -1) throw new Error(`"${name}" is not inside a <service> element`)
  return manifest.slice(open, close + '</service>'.length)
}

describe('Android persists the in-app language across a process restart', () => {
  it('declares AppLocalesMetadataHolderService with autoStoreLocales=true', () => {
    const service = serviceElement(
      read(MANIFEST),
      'androidx.appcompat.app.AppLocalesMetadataHolderService',
    )

    // The metadata AppCompat looks for. Without BOTH the name and the literal string "true" it
    // takes the same in-memory-only path as a missing service.
    expect(service).toMatch(/android:name="autoStoreLocales"/)
    expect(service).toMatch(/android:name="autoStoreLocales"[\s\S]*android:value="true"/)

    // The component is a metadata holder, never a running service.
    expect(service).toMatch(/android:enabled="false"/)
    expect(service).toMatch(/android:exported="false"/)
  })

  it('still targets API levels where the declaration is load-bearing', () => {
    // The guard above matters because minSdk is below 33. If minSdk ever reaches 33 the platform
    // persists the locale on its own and this whole file may be deleted — but that has to be a
    // decision someone makes, not something that drifts. Until then, minSdk < 33 and the service
    // must stay.
    const minSdk = Number(/minSdk\s*=\s*(\d+)/.exec(read(BUILD_GRADLE))?.[1])
    expect(Number.isFinite(minSdk)).toBe(true)
    expect(minSdk).toBeLessThan(33)
  })

  it('LanguageManager still relies on the mechanism this guard protects', () => {
    // If the app ever stops going through AppCompatDelegate — a DataStore of its own, say — the
    // manifest node stops being the thing that makes persistence work, and this guard would be
    // protecting a component nothing uses. Fail then, so the guard gets rewritten rather than
    // rotting into a green check that means nothing.
    const source = read(LANGUAGE_MANAGER)
    expect(source).toContain('AppCompatDelegate.setApplicationLocales')
    expect(source).toContain('AppCompatDelegate.getApplicationLocales')
  })

  it('the Deals client reads the app language per request, not once per process', () => {
    // V2-UAT-005's half of the fix, and the reason it is asserted next to the persistence one:
    // reading the language into a field at construction would put the value back on process
    // lifetime even with the manifest node present, and switching language in Settings would not
    // take effect until the next cold start.
    const source = read(DEALS_REPOSITORY)
    expect(source).toContain('languageManager.current')
    // Read inside a function, not captured in a constructor property.
    expect(source).toMatch(/private fun languageTag\(\)[\s\S]*languageManager\.current/)
    expect(source).toMatch(/api\.getDeals\(languageTag\(\)\)/)
  })
})
