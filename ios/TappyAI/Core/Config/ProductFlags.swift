import Foundation

/// Product visibility flags — the iOS mirror of the web's `src/lib/config/product.ts`.
///
/// 🚨 A FLAG THAT EXISTS ON ONE PLATFORM ONLY IS THE DEFECT, NOT THE FEATURE. The web file records
/// what `SHOW_SCAM_SHIELD` cost: it gated native and was read by no web surface at all, so one
/// boolean meant two different products. Anything listed here is flipped on **every** platform in
/// the same change.
///
/// These are compile-time constants, deliberately. `/api/config` also carries the same values under
/// `flags`, and `ProfileMainView` already reads two of them at runtime — but a runtime flag cannot
/// hide a surface before the first config response lands, and a feature withdrawn for a legal
/// reason must be absent from the first frame. When the decision behind one of these is settled,
/// the constant is the single place to change.
enum ProductFlags {
    /// Music — HIDDEN ON EVERY PLATFORM, NOT DELETED.
    ///
    /// The catalogue served in production is Jamendo API hotlinks and that licensing question is
    /// still open (`docs/uat/PHASE7-AUDIT.md` R5), so a user must not be able to reach Music
    /// through normal product navigation. Nothing underneath is touched — `Features/Music`, the
    /// composer's `MusicPickerView`, `SoundPageView` and their services all stay exactly where they
    /// are, and flipping this one boolean back to `true` restores every iOS entry point at once.
    ///
    /// Mirrors web `SHOW_MUSIC` (served as `flags.showMusic`) and Android
    /// `com.tappyai.app.ProductFlags.SHOW_MUSIC`. Flip all three together.
    static let showMusic = false
}
