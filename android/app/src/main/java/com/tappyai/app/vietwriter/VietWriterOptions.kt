package com.tappyai.app.vietwriter

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/** Target platform for the generated caption — mirrors the web's `PLATFORMS` list
 *  (`src/components/VietContentForm.tsx`). [wireValue] is the exact id the backend expects. */
enum class VietWriterPlatform(val wireValue: String, val emoji: String, @StringRes val labelRes: Int) {
    Facebook("facebook", "📘", R.string.vietwriter_platform_facebook),
    TikTok("tiktok", "🎵", R.string.vietwriter_platform_tiktok),
    Instagram("instagram", "📸", R.string.vietwriter_platform_instagram),
}

/** Caption tone — mirrors the web's `TONES` list, same 5 ids/order. */
enum class VietWriterTone(val wireValue: String, @StringRes val labelRes: Int) {
    Funny("funny", R.string.vietwriter_tone_funny),
    Emotional("emotional", R.string.vietwriter_tone_emotional),
    Youthful("youthful", R.string.vietwriter_tone_youthful),
    Inspiring("inspiring", R.string.vietwriter_tone_inspiring),
    Professional("professional", R.string.vietwriter_tone_professional),
}

/** Caption length — mirrors the web's `LENGTHS` list. */
enum class VietWriterLength(val wireValue: String, @StringRes val labelRes: Int, @StringRes val hintRes: Int) {
    Short("short", R.string.vietwriter_length_short, R.string.vietwriter_length_short_hint),
    Medium("medium", R.string.vietwriter_length_medium, R.string.vietwriter_length_medium_hint),
    Long("long", R.string.vietwriter_length_long, R.string.vietwriter_length_long_hint),
}

@Composable
fun VietWriterPlatform.label(): String = stringResource(labelRes)

@Composable
fun VietWriterTone.label(): String = stringResource(labelRes)

@Composable
fun VietWriterLength.label(): String = stringResource(labelRes)

@Composable
fun VietWriterLength.hint(): String = stringResource(hintRes)
