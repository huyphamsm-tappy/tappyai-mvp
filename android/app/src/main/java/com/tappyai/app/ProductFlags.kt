package com.tappyai.app

/**
 * Product visibility flags — the Android mirror of the web's `src/lib/config/product.ts`.
 *
 * 🚨 A FLAG THAT EXISTS ON ONE PLATFORM ONLY IS THE DEFECT, NOT THE FEATURE. The web file records
 * what `SHOW_SCAM_SHIELD` cost: it gated Android and was read by no web surface at all, so one
 * boolean meant two different products. Anything listed here is flipped on **every** platform in
 * the same change.
 *
 * Android has carried single-use copies of this idea before (`SHOW_PRO_UPGRADE` as a private
 * constant inside `ProfileScreen.kt`). Those stay where they are; this object exists for the flags
 * that more than one package has to agree on.
 */
internal object ProductFlags {
    /**
     * Music — HIDDEN ON EVERY PLATFORM, NOT DELETED.
     *
     * The catalogue served in production is Jamendo API hotlinks and that licensing question is
     * still open (`docs/uat/PHASE7-AUDIT.md` R5), so a user must not be able to reach Music through
     * normal product navigation. Nothing underneath is touched — the `music` package, its API, its
     * repository, the composer's picker and the sound screens all stay exactly where they are, and
     * flipping this one boolean back to `true` restores every Android entry point at once.
     *
     * Mirrors web `SHOW_MUSIC` (also served as `flags.showMusic` by `GET /api/config`) and iOS
     * `ProductFlags.showMusic`. Flip all three together.
     */
    const val SHOW_MUSIC = false
}
