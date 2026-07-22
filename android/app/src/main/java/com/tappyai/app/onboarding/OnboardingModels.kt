package com.tappyai.app.onboarding

import androidx.annotation.StringRes
import com.tappyai.app.R

/**
 * One selectable interest — mirrors the web's `ONBOARDING_INTERESTS` entry. [emoji] comes straight
 * from `GET api/config`; [labelRes] is resolved locally from the config's `id` (the config's `key`
 * is a web i18n key native clients can't resolve), so the displayed label matches the web's
 * `tag.*` translation in the current app language.
 */
data class OnboardingInterest(
    val id: String,
    val emoji: String,
    @StringRes val labelRes: Int,
)

/** The onboarding catalog from `GET api/config` — interests + city suggestions. */
data class OnboardingCatalog(
    val interests: List<OnboardingInterest>,
    val cities: List<String>,
)

/** Maps a config interest id to its Android label, matching the web's `tag.<id>` dictionary keys.
 *  An unknown id (a future backend addition) is dropped rather than shown label-less. */
@StringRes
fun interestLabelResFor(id: String): Int? = when (id) {
    "food" -> R.string.onboarding_interest_food
    "spa" -> R.string.onboarding_interest_spa
    "travel" -> R.string.onboarding_interest_travel
    "shopping" -> R.string.onboarding_interest_shopping
    "entertainment" -> R.string.onboarding_interest_entertainment
    "hotel" -> R.string.onboarding_interest_hotel
    else -> null
}
