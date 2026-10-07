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
     * normal product navigation.
     *
     * 🚨 ON ANDROID THERE IS NOTHING TO GATE (uat/unified, "Huong 2", 2026-09-24). This build took
     * phase7's Android, which had already REMOVED the Android music surface entirely — no
     * `com.tappyai.app.music` package, no registry entry, no composer sound picker, no feed sound
     * pill, no music routes. Music is ABSENT on Android (the strongest hide), and this constant is
     * kept only as the cross-platform MIRROR so the contract stays symmetric. (Web keeps its
     * `/music` LIBRARY behind the flag; Android does not carry it.)
     *
     * Mirrors web `SHOW_MUSIC` (also served as `flags.showMusic` by `GET /api/config`) and iOS
     * `ProductFlags.showMusic`. Flip all three together if Music is ever launched — on Android that
     * also means re-adding the music package, which was removed here.
     */
    const val SHOW_MUSIC = false
}
