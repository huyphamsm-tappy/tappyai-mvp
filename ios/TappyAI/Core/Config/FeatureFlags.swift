import Foundation

/// Product feature flags — hardcoded product decisions, NOT runtime/env configuration.
///
/// This mirrors the web `src/lib/config/product.ts` `SHOW_*` flags. A value here is a
/// deliberate, compiled-in product choice, distinct from `AppEnvironment` (which reads
/// per-build settings from the xcconfig/Info.plist).
enum FeatureFlags {
    /// Music — HIDDEN BY DEFAULT, NOT DELETED (owner decision 2026-09-24: Music is out,
    /// not launching, no licensing review).
    ///
    /// Hardcoded `false` on purpose: hidden must be the *code* default and must never depend
    /// on an env var or remote config being set correctly — if anything is missing, Music
    /// stays hidden. The Music feature (`Features/Music/*`, the composer `MusicPickerView`,
    /// the feed `ReviewMusicDisc` → `SoundPageView`) and its view models stay in the target;
    /// flipping this one boolean to `true` restores every iOS entry point at once.
    ///
    /// Mirrors web `SHOW_MUSIC` (also a hardcoded `false`). Flip BOTH together if Music ever
    /// launches. NOTE: the "use this sound" reuse/SoundPage path was retired on web + Android
    /// but is still present on iOS; hiding it here is the interim gate until iOS ships.
    static let showMusic = false
}
