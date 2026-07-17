package com.tappyai.app.onboarding.data

import kotlinx.serialization.Serializable

/**
 * Just the slice of `GET api/config` that onboarding needs. The full response also carries
 * freemium/flags/upload/auth blocks; the shared lenient Json (`ignoreUnknownKeys`) drops them.
 */
@Serializable
data class AppConfigDto(
    val onboarding: OnboardingCatalogDto = OnboardingCatalogDto(),
)

@Serializable
data class OnboardingCatalogDto(
    val interests: List<InterestDto> = emptyList(),
    val cities: List<String> = emptyList(),
)

/**
 * One interest option from the config. [key] is the web's i18n key (`tag.food`, …) which native
 * clients can't resolve, so the label is looked up by [id] against a local string map at the
 * DTO→domain site; [emoji] is used as-is.
 */
@Serializable
data class InterestDto(
    val id: String = "",
    val emoji: String = "",
    val key: String = "",
)

/** Minimal read of `GET api/profile` for the post-login onboarding gate. */
@Serializable
data class OnboardedStatusDto(
    val onboarded: Boolean = false,
)

/**
 * `POST api/onboarding` body — the picked interest ids + a single city (free-text or a catalog
 * value). Mirrors the web's `{ interests, city }`. An empty selection is valid: the web's Skip
 * button posts exactly this.
 */
@Serializable
data class OnboardingRequestDto(
    val interests: List<String>,
    val city: String,
)

@Serializable
data class OnboardingResponseDto(val ok: Boolean = false)
