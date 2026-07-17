package com.tappyai.app.preferences

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * Static option sets for the My Preferences form — mirror the web `BUDGET_OPTIONS`,
 * `CUISINE_OPTIONS`, `QUICK_PREF_CHIPS` constants. These are the app's fixed choices (NOT user
 * data), so the form renders fully even before the user has selected anything. The user's own
 * selections live in [PreferencesViewModel] (empty by default per the approved decision).
 *
 * Labels are localized via string resources (pattern mirrors [com.tappyai.app.chat.ChatCategory]):
 * a private enum/list holds `@StringRes` ids, and a `@Composable` function resolves them at read
 * time so the form re-renders in the user's selected app language.
 */

enum class BudgetLevel { Cheap, Mid, High }

enum class Gender { Female, Male }

data class BudgetOption(val level: BudgetLevel, val emoji: String, val label: String, val desc: String)

data class GenderOption(val gender: Gender, val emoji: String, val label: String)

/** Budget tiers — VND thresholds kept as product data; labels/descs are localized. */
private enum class BudgetTier(
    val level: BudgetLevel,
    val emoji: String,
    @StringRes val labelRes: Int,
    @StringRes val descRes: Int,
) {
    Cheap(BudgetLevel.Cheap, "💚", R.string.preferences_budget_cheap_label, R.string.preferences_budget_cheap_desc),
    Mid(BudgetLevel.Mid, "💛", R.string.preferences_budget_mid_label, R.string.preferences_budget_mid_desc),
    High(BudgetLevel.High, "❤️", R.string.preferences_budget_high_label, R.string.preferences_budget_high_desc),
}

@Composable
fun budgetOptions(): List<BudgetOption> = BudgetTier.entries.map { tier ->
    BudgetOption(tier.level, tier.emoji, stringResource(tier.labelRes), stringResource(tier.descRes))
}

private enum class GenderTier(val gender: Gender, val emoji: String, @StringRes val labelRes: Int) {
    Female(Gender.Female, "👩", R.string.preferences_gender_female),
    Male(Gender.Male, "👨", R.string.preferences_gender_male),
}

@Composable
fun genderOptions(): List<GenderOption> = GenderTier.entries.map { tier ->
    GenderOption(tier.gender, tier.emoji, stringResource(tier.labelRes))
}

/**
 * Cuisine choices. NOTE: these localized strings double as the identity/value stored in
 * `cuisine_likes` on `/api/preferences` (see [com.tappyai.app.preferences.data.RealPreferencesRepository]),
 * since the backend has no separate stable key for each option (this predates this localization
 * pass — the web mirrors the same pattern with fixed Vietnamese strings). A consequence worth
 * flagging: a cuisine selected while the app is in one language will no longer match this list's
 * strings after switching the in-app language, so a previously selected chip will stop showing as
 * selected on screen (the raw value is NOT lost server-side, just visually out of sync). Fixing
 * this would require a stable non-localized key from the backend and is out of scope for this
 * string-externalization pass.
 */
private val cuisineOptionResIds = listOf(
    R.string.preferences_cuisine_pho_bun,
    R.string.preferences_cuisine_com_tam,
    R.string.preferences_cuisine_hot_pot,
    R.string.preferences_cuisine_bbq_grill,
    R.string.preferences_cuisine_seafood,
    R.string.preferences_cuisine_vegetarian_vegan,
    R.string.preferences_cuisine_sushi_japanese,
    R.string.preferences_cuisine_korean,
    R.string.preferences_cuisine_pizza_burger,
    R.string.preferences_cuisine_dimsum_chinese,
    R.string.preferences_cuisine_coffee_cake,
    R.string.preferences_cuisine_northern_dishes,
    R.string.preferences_cuisine_southern_dishes,
    R.string.preferences_cuisine_fast_food,
    R.string.preferences_cuisine_ice_cream_dessert,
)

@Composable
fun cuisineOptions(): List<String> = cuisineOptionResIds.map { stringResource(it) }

/** Same identity-vs-display caveat as [cuisineOptions] applies here (freeform `preferences` list). */
private val quickPrefChipResIds = listOf(
    R.string.preferences_quick_chip_vegetarian_fridays,
    R.string.preferences_quick_chip_lunch_budget,
    R.string.preferences_quick_chip_japanese_spa,
    R.string.preferences_quick_chip_seafood_allergy,
    R.string.preferences_quick_chip_district_3,
    R.string.preferences_quick_chip_no_spicy,
    R.string.preferences_quick_chip_binh_thanh,
    R.string.preferences_quick_chip_quiet_spaces,
)

@Composable
fun quickPrefChips(): List<String> = quickPrefChipResIds.map { stringResource(it) }
