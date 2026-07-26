package com.tappyai.app.music

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * A music track, mirroring the web `MusicTrack` (`src/modules/music/types/track.ts`) — the
 * fields the UI renders. `coverUrl` is nullable so a missing cover falls back to the note
 * placeholder (never a fake image). [previewUrl]/[audioUrl] feed [rememberAudioPlayer]'s real
 * ExoPlayer playback — `previewUrl` first (matches the web player's own preference), falling back
 * to `audioUrl` (today the backend always sets both to the same URL, but the UI honors the same
 * precedence the web does rather than assuming that).
 */
data class MusicTrack(
    val id: String,
    val title: String,
    val artist: String?,
    val durationSec: Int,
    val coverUrl: String?,
    val categoryId: String?,
    val previewUrl: String?,
    val audioUrl: String?,
)

/** Track licensing/source type — mirrors the web `TYPE_LABEL` map on the sound page. The backend
 *  sends this as a raw string (`music_type` column, e.g. `"royalty_free"`); [fromWireValue] maps
 *  it defensively (unknown/missing → [RoyaltyFree], the DB column's own default). */
enum class MusicType(@StringRes val labelRes: Int) {
    RoyaltyFree(R.string.music_type_royalty_free),
    Licensed(R.string.music_type_licensed),
    OriginalSound(R.string.music_type_original_sound),
    AiGenerated(R.string.music_type_ai_generated),
    External(R.string.music_type_external);

    companion object {
        fun fromWireValue(value: String): MusicType = when (value) {
            "licensed" -> Licensed
            "original_sound" -> OriginalSound
            "ai_generated" -> AiGenerated
            "external" -> External
            else -> RoyaltyFree
        }
    }
}

@Composable
fun MusicType.label(): String = stringResource(labelRes)

/** A browse category, mirroring the web `MusicCategory`. `id == null` is the "All" tab. [label]
 *  is already resolved to the current app language at the DTO→domain mapping site. */
data class MusicCategory(val id: String, val label: String)

/**
 * The `/sound/{trackId}` "mini-Spotify" page data — a superset of [MusicTrack] plus the stats and
 * social state the plain list/search endpoints don't return. A separate type (not [MusicTrack]
 * with nullable extra fields) because the two screens genuinely see different backend shapes.
 */
data class SoundDetail(
    val track: MusicTrack,
    val type: MusicType,
    val playCount: Int,
    val usageCount: Int,
    val savedCount: Int,
    val savedByMe: Boolean,
    val followCount: Int,
    val followedByMe: Boolean,
    val trendingRank: Int?,
    val videos: List<SoundVideo>,
)

/** One review using a sound, for the Sound Detail "videos using this sound" grid — mirrors the web
 *  `SoundVideo`. Tapping a tile opens the reused review detail, exactly like the web's `/reviews/{id}`
 *  link. [thumbnail] is nullable so a missing thumbnail falls back to a placeholder. */
data class SoundVideo(
    val id: String,
    val placeName: String,
    val thumbnail: String?,
    val likeCount: Int,
)

/**
 * CC-BY attribution reconstructed from a curated track's audio URL — the legal credit CC-BY
 * requires. Mirrors the web `attributionFor` (`src/app/sound/[trackId]/page.tsx`): Jamendo tracks
 * are ingested with a `mp3d.jamendo.com/?trackid=<id>` URL, so the source + license are
 * reconstructable. Returns null for non-Jamendo/unknown sources (no attribution line shown).
 */
data class SoundAttribution(val license: String, val source: String, val provider: String)

private val JAMENDO_TRACK_REGEX = Regex("""mp3d\.jamendo\.com/\?trackid=(\d+)""")

fun attributionFor(audioUrl: String?): SoundAttribution? {
    val match = JAMENDO_TRACK_REGEX.find(audioUrl ?: "") ?: return null
    val trackId = match.groupValues[1]
    return SoundAttribution(
        license = "CC-BY",
        source = "https://www.jamendo.com/track/$trackId",
        provider = "Jamendo",
    )
}

/** One page of tracks from `/api/music/tracks` or `/api/music/tracks/search`. */
data class MusicTracksPage(val tracks: List<MusicTrack>, val page: Int, val hasMore: Boolean)

/** Result of `POST`/`DELETE /api/sound/{trackId}/save` — the backend's own post-mutation count,
 *  used to reconcile an optimistic UI update rather than trusting the local increment/decrement. */
data class SaveResult(val saved: Boolean, val savedCount: Int)

/** Result of `POST`/`DELETE /api/sound/{trackId}/follow` — same reconciliation role as [SaveResult]. */
data class FollowResult(val followed: Boolean, val followCount: Int)

/** `m:ss`, mirroring the web `formatDuration` (`src/modules/music/utils/formatDuration.ts`). */
fun formatDuration(totalSeconds: Int): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}
