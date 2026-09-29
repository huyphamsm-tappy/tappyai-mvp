package com.tappyai.app.share.card

import android.content.Context
import android.graphics.Bitmap
import com.tappyai.app.R
import com.tappyai.app.share.ShareArtifact
import com.tappyai.app.share.ShareImageRenderer
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * THE ONE card-file generator — port of web `src/lib/share/shareCardFile.ts`. The LAYOUT decides the
 * file (owner picks 29/09):
 *  - PROFILE / POST  the TappyAI QR card ([BrandedQrCard]).
 *  - REVIEW / CLIP   an Explore post's own card ([ContentCards.renderPostCard]).
 *  - SUGGESTION      a chat recommendation's places ([ContentCards.renderSuggestionCard]).
 *  - PLAN            the itinerary image ([PlanCard]).
 *  - DEFAULT         the legacy card ([ShareImageRenderer]) — url/text-only shares.
 *
 * 🔑 ONE FILE. The share sheet renders the chosen layout ONCE per (layout, link), shows that very
 * file as its preview, and hands the SAME file to "Lưu về máy" and to TikTok ([ShareCardFiles]).
 */
enum class ShareCardLayout(val fileTag: String) {
    DEFAULT("card"), PROFILE("profile"), POST("post"), REVIEW("review"), CLIP("clip"), SUGGESTION("suggestion"), PLAN("plan"),
}

enum class ShareSheetVariant { DEFAULT, PROFILE, POST, SUGGESTION, PLAN }

object ShareCardLayouts {
    /** The layouts a share offers, in order — the first is the default selection (web `shareCardLayouts`). */
    fun of(variant: ShareSheetVariant, artifact: ShareArtifact, post: SharePostCard?, plan: PlanCardData?): List<ShareCardLayout> = when {
        variant == ShareSheetVariant.PROFILE -> listOf(ShareCardLayout.PROFILE)
        variant == ShareSheetVariant.POST -> if (post != null) listOf(if (post.kind == SharePostCard.Kind.CLIP) ShareCardLayout.CLIP else ShareCardLayout.REVIEW, ShareCardLayout.POST) else listOf(ShareCardLayout.POST)
        artifact.kind == ShareArtifact.Kind.PLAN && plan != null && plan.days.isNotEmpty() -> listOf(ShareCardLayout.PLAN)
        variant == ShareSheetVariant.SUGGESTION && artifact.kind == ShareArtifact.Kind.PLACES && artifact.places.isNotEmpty() -> listOf(ShareCardLayout.SUGGESTION)
        else -> listOf(ShareCardLayout.DEFAULT)
    }

    /** `tappyai-<layout>-YYYY-MM-DD.png` — the saved file says which layout produced it. */
    fun fileName(layout: ShareCardLayout, now: Date = Date()): String {
        val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(now)
        return "tappyai-${layout.fileTag}-$day.png"
    }
}

/** What a card may be drawn from. */
data class ShareCardInput(
    val artifact: ShareArtifact,
    val layout: ShareCardLayout,
    /** Name on the TappyAI QR card: the profile's name, or the post's title. */
    val displayName: String? = null,
    val post: SharePostCard? = null,
    val plan: PlanCardData? = null,
)

/**
 * Web `playBadgeEnabled`: the Google Play badge only where the listing may be pointed at — every
 * non-release build (UAT review), and a release once PLAY_LISTING_LIVE is set. App Store: never (not listed).
 */
fun playBadgeEnabled(buildType: String = com.tappyai.app.BuildConfig.BUILD_TYPE, listingLive: Boolean = com.tappyai.app.BuildConfig.PLAY_LISTING_LIVE): Boolean =
    listingLive || buildType != "release"

/** The card copy, from string resources (web `ShareMenu` `copy`), in the app's language. */
internal fun cardWebsite(webAppUrl: String): String = runCatching { java.net.URI(webAppUrl).host.orEmpty() }.getOrDefault("")

object ShareCardRenderer {
    fun render(context: Context, input: ShareCardInput, webAppUrl: String, images: CardImageLoader = HttpCardImageLoader): Bitmap? {
        fun s(id: Int): String = context.getString(id)
        val website = cardWebsite(webAppUrl)
        val a = input.artifact
        fun contentCopy(badge: Int) = ContentCardCopy(
            tagline = s(R.string.share_card_tagline), badge = s(badge), scanTitle = s(R.string.share_card_scan),
            slogan = s(R.string.share_card_slogan), sloganSub = s(R.string.share_card_slogan_sub), website = website,
            byline = s(R.string.share_card_byline), morePlaces = s(R.string.share_card_more_places),
        )
        return when (input.layout) {
            ShareCardLayout.PROFILE, ShareCardLayout.POST -> BrandedQrCard.render(context, BrandedQrOptions(
                text = a.url,
                displayName = input.displayName.orEmpty(),
                caption = s(if (input.layout == ShareCardLayout.POST) R.string.share_card_post_scan_hint else R.string.share_card_profile_scan_hint),
                invite = if (input.layout == ShareCardLayout.PROFILE) s(R.string.share_card_invite) else null,
                tagline = s(R.string.share_card_tagline),
                slogan = s(R.string.share_card_slogan),
                sloganSub = s(R.string.share_card_slogan_sub),
                websiteLabel = s(R.string.share_card_website_label),
                features = listOf(s(R.string.share_card_feat1), s(R.string.share_card_feat2), s(R.string.share_card_feat3), s(R.string.share_card_feat4)),
                website = website,
                googlePlay = if (!playBadgeEnabled()) null else GooglePlayCopy(s(R.string.share_card_play_badge_top), s(R.string.share_card_get_app_pre), s(R.string.share_card_get_app_post), s(R.string.share_card_get_app_sub), s(R.string.share_card_or_website)),
            ))
            ShareCardLayout.REVIEW, ShareCardLayout.CLIP -> input.post?.let {
                ContentCards.renderPostCard(context, it, a.url, contentCopy(if (input.layout == ShareCardLayout.CLIP) R.string.share_card_badge_clip else R.string.share_card_badge_review), images)
            }
            ShareCardLayout.SUGGESTION -> ContentCards.renderSuggestionCard(context, a.subject, a.places, a.url, contentCopy(R.string.share_card_badge_suggestion), images)
            ShareCardLayout.PLAN -> input.plan?.let { PlanCard.render(context, it, a.url, PlanCardStrings.of(s(R.string.share_card_lang)), images) }
            ShareCardLayout.DEFAULT -> ShareImageRenderer.render(context, a)
        }
    }
}

/**
 * The per-sheet cache that makes it ONE file: `(layout, url)` → the PNG written once. The preview,
 * "Lưu về máy" and TikTok all ask here, so they get the same bytes. A failed render is not cached
 * (the next ask retries).
 */
class ShareCardFiles(private val context: Context, private val webAppUrl: String, private val images: CardImageLoader = HttpCardImageLoader) {
    data class Card(val layout: ShareCardLayout, val file: File, val bitmap: Bitmap)

    private val mutex = Mutex()
    private val cache = HashMap<String, Deferred<Card?>>()

    suspend fun get(input: ShareCardInput): Card? = coroutineScope {
        val key = "${input.layout}|${input.artifact.url}"
        val job = mutex.withLock {
            cache[key] ?: async(Dispatchers.Default) { renderToFile(input) }.also { cache[key] = it }
        }
        val card = job.await()
        if (card == null) mutex.withLock { if (cache[key] === job) cache.remove(key) }
        card
    }

    private suspend fun renderToFile(input: ShareCardInput): Card? = withContext(Dispatchers.IO) {
        val bmp = runCatching { ShareCardRenderer.render(context, input, webAppUrl, images) }.getOrNull() ?: return@withContext null
        runCatching {
            val dir = File(context.cacheDir, "share/cards").apply { mkdirs() }
            // One file per (layout, link): the name carries the layout; a hash keeps two links apart.
            val file = File(dir, "${input.layout.fileTag}-${Integer.toHexString(input.artifact.url.hashCode())}.png")
            file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            Card(input.layout, file, bmp)
        }.getOrNull()
    }
}
