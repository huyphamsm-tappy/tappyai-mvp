package com.tappyai.app.music.data

import com.tappyai.app.music.MusicCategory
import com.tappyai.app.music.MusicTrack
import com.tappyai.app.music.MusicTracksPage
import com.tappyai.app.music.MusicType
import com.tappyai.app.music.SoundDetail
import java.util.Locale

fun MusicTrackDto.toDomain(): MusicTrack = MusicTrack(
    id = id,
    title = title,
    artist = artist,
    durationSec = durationSec,
    coverUrl = coverUrl,
    categoryId = categoryId,
    previewUrl = previewUrl,
    audioUrl = audioUrl,
)

fun MusicTracksPageDto.toDomain(): MusicTracksPage =
    MusicTracksPage(tracks = tracks.map { it.toDomain() }, page = page, hasMore = hasMore)

/** [MusicCategoryDto.labelI18n] is a locale map (`{"en": "...", "vi": "..."}`) — resolved to the
 *  current app language here, with English then "any value" then the raw slug as fallbacks, so a
 *  category never renders blank even if a translation is missing. */
fun MusicCategoryDto.toDomain(): MusicCategory {
    val language = Locale.getDefault().language
    val label = labelI18n[language] ?: labelI18n["en"] ?: labelI18n.values.firstOrNull() ?: slug
    return MusicCategory(id = id, label = label)
}

fun SoundDetailResponseDto.toDomain(): SoundDetail = SoundDetail(
    track = MusicTrack(
        id = track.id,
        title = track.title,
        artist = track.artist,
        durationSec = track.durationSec,
        coverUrl = track.coverUrl,
        categoryId = null,
        previewUrl = track.previewUrl,
        audioUrl = track.audioUrl,
    ),
    type = MusicType.fromWireValue(track.musicType),
    playCount = track.playCount,
    usageCount = usageCount,
    savedCount = savedCount,
    savedByMe = savedByMe,
    followCount = followCount,
    followedByMe = followedByMe,
    trendingRank = trendingRank,
)
