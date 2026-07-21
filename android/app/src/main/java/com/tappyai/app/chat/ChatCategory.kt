package com.tappyai.app.chat

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * Chat category — determines the welcome hero, quick prompts, and mood chips shown before
 * the first message. Mirrors the Web's `CATEGORIES` from `src/lib/utils.ts` plus the implicit
 * "general" default. Accepted as an optional parameter from navigation sources (Home card,
 * Maps, Reviews, etc.); the Chat tab itself has no permanent category picker.
 */
// Each category maps to one of the owner's Otter mascot poses (the same art the web uses via
// TappyMascot's CATEGORY_POSES) — the PNGs live in res/drawable-nodpi. General falls back to the
// neutral `wave` pose, matching the web default.
enum class ChatCategory(
    val emoji: String,
    @StringRes val labelRes: Int,
    @DrawableRes val mascot: Int,
) {
    General("🤖", R.string.chat_category_general, R.drawable.tappy_wave),
    Food("🍜", R.string.chat_category_food, R.drawable.tappy_food),
    Shopping("🛍️", R.string.chat_category_shopping, R.drawable.tappy_shopping),
    Entertainment("🎭", R.string.chat_category_entertainment, R.drawable.tappy_entertainment),
    Travel("✈️", R.string.chat_category_travel, R.drawable.tappy_travel),
    Spa("💆", R.string.chat_category_spa, R.drawable.tappy_spa),
}

@Composable
fun ChatCategory.label(): String = stringResource(labelRes)

data class MoodChip(val emoji: String, val label: String, val prompt: String)

private enum class Mood(val emoji: String, @StringRes val labelRes: Int, @StringRes val promptRes: Int) {
    Happy("😊", R.string.chat_mood_happy_label, R.string.chat_mood_happy_prompt),
    Sad("😔", R.string.chat_mood_sad_label, R.string.chat_mood_sad_prompt),
    Stressed("😤", R.string.chat_mood_stressed_label, R.string.chat_mood_stressed_prompt),
    Tired("😴", R.string.chat_mood_tired_label, R.string.chat_mood_tired_prompt),
    Bored("🥱", R.string.chat_mood_bored_label, R.string.chat_mood_bored_prompt),
    Excited("🤩", R.string.chat_mood_excited_label, R.string.chat_mood_excited_prompt),
}

@Composable
fun moodChips(): List<MoodChip> = Mood.entries.map { mood ->
    MoodChip(mood.emoji, stringResource(mood.labelRes), stringResource(mood.promptRes))
}

@Composable
fun quickPrompts(category: ChatCategory): List<String> = when (category) {
    ChatCategory.General -> listOf(
        stringResource(R.string.chat_prompt_general_1),
        stringResource(R.string.chat_prompt_general_2),
        stringResource(R.string.chat_prompt_general_3),
    )
    ChatCategory.Food -> listOf(
        stringResource(R.string.chat_prompt_food_1),
        stringResource(R.string.chat_prompt_food_2),
        stringResource(R.string.chat_prompt_food_3),
    )
    ChatCategory.Shopping -> listOf(
        stringResource(R.string.chat_prompt_shopping_1),
        stringResource(R.string.chat_prompt_shopping_2),
        stringResource(R.string.chat_prompt_shopping_3),
    )
    ChatCategory.Entertainment -> listOf(
        stringResource(R.string.chat_prompt_entertainment_1),
        stringResource(R.string.chat_prompt_entertainment_2),
        stringResource(R.string.chat_prompt_entertainment_3),
    )
    ChatCategory.Travel -> listOf(
        stringResource(R.string.chat_prompt_travel_1),
        stringResource(R.string.chat_prompt_travel_2),
        stringResource(R.string.chat_prompt_travel_3),
    )
    ChatCategory.Spa -> listOf(
        stringResource(R.string.chat_prompt_spa_1),
        stringResource(R.string.chat_prompt_spa_2),
        stringResource(R.string.chat_prompt_spa_3),
    )
}
