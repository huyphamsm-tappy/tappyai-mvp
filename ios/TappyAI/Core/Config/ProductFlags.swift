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

    /// The in-app purchase of TappyAI Pro (StoreKit price, buy button). OFF unless the build turns it on:
    /// The Debug and Release xcconfig files add `IAP_PURCHASE_UI` to `SWIFT_ACTIVE_COMPILATION_CONDITIONS`, so a build
    /// that does not name the condition has no purchase button. Restore Purchases, the subscription terms and the
    /// plan status of the account are NOT behind this flag: they must stay reachable (App Review 3.1.1, 3.1.2).
    /// iOS only: the web keeps `subscriptions` OFF, so no web payment exists for a plan iOS cannot buy.
    #if IAP_PURCHASE_UI
    static let iapPurchaseUI = true
    #else
    static let iapPurchaseUI = false
    #endif

    /// Dịch (Translate) — HIDDEN, NOT DELETED (owner decision 2026-10-25). The view, the service and
    /// `POST /api/translate` stay in place; the entry points and the service call are gated off.
    /// Mirrors web `SHOW_TRANSLATE` (`src/lib/config/product.ts`). Flip both together.
    static let showTranslate = false

    /// Viết nội dung (Captions) — HIDDEN, NOT DELETED (owner decision 2026-10-25). Mirrors web
    /// `SHOW_VIET_CONTENT`. Flip both together.
    static let showVietContent = false
}
