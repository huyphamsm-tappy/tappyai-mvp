package com.tappyai.app.music.data

import kotlinx.serialization.Serializable

/**
 * Wire DTOs for the Music backend (`/api/music/` and `/api/sound/` routes). All JSON is camelCase — the
 * Next.js routes map DB snake_case to camelCase server-side (`src/modules/music/repository/
 * musicRepository.ts`'s `mapTrackRow`), so no `@SerialName` remapping is needed here, unlike most
 * other backends in this app.
 */
@Serializable
data class MusicTrackDto(
    val id: String = "",
    val title: String = "",
    val artist: String? = null,
    val durationSec: Int = 0,
    val audioUrl: String? = null,
    val previewUrl: String? = null,
    val coverUrl: String? = null,
    val categoryId: String? = null,
    val providerId: String? = null,
)

/** `GET /api/music/tracks` and `/api/music/tracks/search` share this page shape. */
@Serializable
data class MusicTracksPageDto(
    val tracks: List<MusicTrackDto> = emptyList(),
    val page: Int = 0,
    val limit: Int = 20,
    val hasMore: Boolean = false,
)

/** One category row — `label` is a locale map (`{"en": "...", "vi": "..."}`), not a plain
 *  string; resolved to the current app language at the DTO→domain mapping site. */
@Serializable
data class MusicCategoryDto(
    val id: String = "",
    val slug: String = "",
    val labelI18n: Map<String, String> = emptyMap(),
    val sortOrder: Int = 0,
)

@Serializable
data class MusicCategoriesResponseDto(
    val categories: List<MusicCategoryDto> = emptyList(),
)

/** `GET /api/sound/{trackId}` — the "mini-Spotify" page. Everything past the core track is
 *  best-effort on the backend (defaults to 0/false when a table/RPC isn't migrated yet), so every
 *  field here has a safe default rather than failing the whole page on one missing stat. */
@Serializable
data class SoundDetailResponseDto(
    val track: SoundTrackDto = SoundTrackDto(),
    val usageCount: Int = 0,
    val savedCount: Int = 0,
    val savedByMe: Boolean = false,
    val followCount: Int = 0,
    val followedByMe: Boolean = false,
    val trendingRank: Int? = null,
)

/** The track sub-object inside [SoundDetailResponseDto] — adds [musicType]/[playCount] that the
 *  plain list/search track shape doesn't carry. */
@Serializable
data class SoundTrackDto(
    val id: String = "",
    val title: String = "",
    val artist: String? = null,
    val durationSec: Int = 0,
    val coverUrl: String? = null,
    val previewUrl: String? = null,
    val audioUrl: String? = null,
    val musicType: String = "royalty_free",
    val playCount: Int = 0,
)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

/** `POST`/`DELETE /api/sound/{trackId}/save` response — the backend's authoritative post-mutation
 *  saved-state and count. */
@Serializable
data class SaveTrackResponseDto(val saved: Boolean = false, val savedCount: Int = 0)

/** `POST`/`DELETE /api/sound/{trackId}/follow` response — same shape as [SaveTrackResponseDto]. */
@Serializable
data class FollowTrackResponseDto(val followed: Boolean = false, val followCount: Int = 0)

/** `POST /api/music/tracks/{trackId}/report` request body. [reason] is one of
 *  `copyright`/`inappropriate`/`spam`/`other`, matching the web's report sheet. */
@Serializable
data class ReportTrackRequestDto(val reason: String, val details: String? = null)
