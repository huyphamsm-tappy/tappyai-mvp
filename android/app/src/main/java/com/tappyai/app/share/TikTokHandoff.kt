package com.tappyai.app.share

/**
 * TikTok takes a FILE (an image or a video), never a link — owner requirement, UAT 2026-09-28.
 *
 * The TikTok tile sends the rendered card (or a clip's video) with `ACTION_SEND` + `EXTRA_STREAM`
 * through the share FileProvider, aimed at the installed TikTok app: the global package first,
 * then the Asia build ("trill"). Neither installed → the system chooser with the same file, so
 * the user still gets it wherever they choose. No file at all → the caption is copied.
 *
 * Pure decision, no Android types, so it is unit-tested on the JVM; [ShareDelivery.toTikTok]
 * turns it into the Intent.
 */
object TikTokHandoff {

    /** TikTok (global) first, then TikTok's Asia build. Both are declared in the manifest `<queries>`. */
    val PACKAGES: List<String> = listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill")

    sealed class Plan {
        /** ACTION_SEND to exactly [pkg] with the file. */
        data class ToApp(val pkg: String, val mimeType: String) : Plan()
        /** No TikTok installed: the system chooser with the file. */
        data class Chooser(val mimeType: String) : Plan()
        /** No file could be produced: copy the caption, say so. */
        data object CopyCaption : Plan()
    }

    fun plan(isInstalled: (String) -> Boolean, hasFile: Boolean, mimeType: String): Plan {
        if (!hasFile) return Plan.CopyCaption
        val pkg = PACKAGES.firstOrNull(isInstalled)
        return if (pkg != null) Plan.ToApp(pkg, mimeType) else Plan.Chooser(mimeType)
    }

    /** The caption that rides with the file: the title line, then the link. */
    fun caption(subject: String, url: String): String {
        val s = subject.trim()
        val u = url.trim()
        return when {
            s.isEmpty() -> u
            u.isEmpty() || s == u -> s
            else -> "$s\n$u"
        }
    }
}
