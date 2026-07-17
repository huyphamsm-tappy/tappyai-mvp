package com.tappyai.app.account.data

import com.tappyai.app.account.AccountProfile
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `/api/profile`. GET returns snake_case fields (`full_name`, `avatar_url`) mapped to
 * the camelCase [AccountProfile] domain model here; PATCH takes `full_name` + `bio`. The domain
 * model is unchanged by the wire format — mapping lives here per the standing convention.
 */
@Serializable
data class ProfileDto(
    @SerialName("full_name") val fullName: String = "",
    @SerialName("avatar_url") val avatarUrl: String = "",
    val email: String = "",
    val bio: String = "",
    val language: String? = null,
)

/** PATCH body — only the fields the Edit screen exposes; language is a separate partial update
 *  (see [UpdateLanguageRequestDto]) since the two are edited from different screens. */
@Serializable
data class UpdateProfileRequestDto(
    @SerialName("full_name") val fullName: String,
    val bio: String,
)

/** PATCH body for the Language picker — `PATCH /api/profile` accepts any subset of its fields,
 *  so sending just `language` leaves name/bio untouched server-side. */
@Serializable
data class UpdateLanguageRequestDto(val language: String)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

/** Response of `POST /api/profile` (multipart avatar upload) — the new public URL of the image. */
@Serializable
data class AvatarUploadResponseDto(@SerialName("avatar_url") val avatarUrl: String = "")

fun ProfileDto.toDomain(): AccountProfile = AccountProfile(
    fullName = fullName,
    email = email,
    bio = bio,
    // GET /api/profile does not return the account creation date, so there is no join date to show.
    joinDate = "",
    avatarUrl = avatarUrl.ifBlank { null },
    language = language,
)
