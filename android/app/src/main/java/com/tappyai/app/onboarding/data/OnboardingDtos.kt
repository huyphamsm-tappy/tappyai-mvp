package com.tappyai.app.onboarding.data

import kotlinx.serialization.Serializable

/**
 * `GET api/config` — the product's single source for freemium limits, feature flags, and upload
 * caps (plus the onboarding catalog and an auth block). Every block is optional-with-default so a
 * partial/older payload never fails the parse; consumers apply their own fallback defaults too.
 * Note: the 62s accept tolerance is deliberately NOT in this payload and must never appear in a UI.
 */
@Serializable
data class AppConfigDto(
    val onboarding: OnboardingCatalogDto = OnboardingCatalogDto(),
    val upload: UploadConfigDto = UploadConfigDto(),
    val flags: FlagsConfigDto = FlagsConfigDto(),
    val freemium: FreemiumConfigDto = FreemiumConfigDto(),
    val scamShield: ScamShieldConfigDto = ScamShieldConfigDto(),
)

/** Defaults mirror the current prod values, so a failed/absent config keeps today's behaviour. */
@Serializable
data class UploadConfigDto(
    val maxPhotosPerReview: Int = 6,
    val maxVideoSizeMb: Int = 50,
    val maxVideoDurationSec: Int = 60,
)

@Serializable
data class FlagsConfigDto(
    val showProUpgrade: Boolean = false,
    val showAppConnections: Boolean = false,
    /**
     * Defaults to true, unlike the two above: `SHOW_SCAM_SHIELD` is true in prod, and the web
     * renders its Scam Shield entry point unconditionally. Defaulting to false would hide the
     * feature whenever `/api/config` is unreachable, which the web never does.
     */
    val showScamShield: Boolean = true,
)

@Serializable
data class FreemiumConfigDto(
    val freeDailyLimit: Int = 15,
    val anonDailyLimit: Int = 5,
)

/**
 * Scam Shield daily caps as published by `/api/config` (`SCAM_SHIELD_DAILY_LIMIT_AUTH` /
 * `_ANON`). Modelled so the wire contract is complete. Neither client displays these numbers:
 * the cap is enforced server-side and surfaced as a `daily_limit` error whose copy the client
 * localises — the web publishes them and reads them nowhere either.
 */
@Serializable
data class ScamShieldConfigDto(
    val dailyLimitAuth: Int = 30,
    val dailyLimitAnon: Int = 10,
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
