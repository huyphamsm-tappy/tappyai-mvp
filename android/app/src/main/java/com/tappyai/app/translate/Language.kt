package com.tappyai.app.translate

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * A target language option. [code] is sent to the backend verbatim (matches the web's
 * `LANGUAGES[].code`, which the backend's `LANG_NAMES` map keys against) and [ttsTag] is the
 * BCP-47 tag used to pick a device TTS voice for "read aloud" (matches the web's `tts` field,
 * used the same way with the Web Speech API). [nameRes] resolves via `stringResource()` — see
 * [displayName].
 */
data class Language(val code: String, @StringRes val nameRes: Int, val ttsTag: String)

/**
 * Mirrors the web `LANGUAGES` array (`src/app/translate/page.tsx`) exactly — same 30 languages,
 * same codes, same order, same native-language display names (language endonyms — each language's
 * own name for itself — are already language-neutral, so the `strings_translate.xml` entries hold
 * the identical value in both `values/` and `values-vi/`; they're still resources, not inline
 * literals, to keep this list free of hardcoded strings) — so the backend's `targetLang` contract
 * and the picker's contents match the Web 1:1.
 */
val LANGUAGES: List<Language> = listOf(
    Language("vi", R.string.translate_lang_vietnamese, "vi-VN"),
    Language("en", R.string.translate_lang_english, "en-US"),
    Language("ja", R.string.translate_lang_japanese, "ja-JP"),
    Language("ko", R.string.translate_lang_korean, "ko-KR"),
    Language("zh-CN", R.string.translate_lang_chinese_simplified, "zh-CN"),
    Language("zh-TW", R.string.translate_lang_chinese_traditional, "zh-TW"),
    Language("fr", R.string.translate_lang_french, "fr-FR"),
    Language("de", R.string.translate_lang_german, "de-DE"),
    Language("es", R.string.translate_lang_spanish, "es-ES"),
    Language("it", R.string.translate_lang_italian, "it-IT"),
    Language("pt", R.string.translate_lang_portuguese, "pt-PT"),
    Language("ar", R.string.translate_lang_arabic, "ar-SA"),
    Language("th", R.string.translate_lang_thai, "th-TH"),
    Language("id", R.string.translate_lang_indonesian, "id-ID"),
    Language("ms", R.string.translate_lang_malay, "ms-MY"),
    Language("hi", R.string.translate_lang_hindi, "hi-IN"),
    Language("ru", R.string.translate_lang_russian, "ru-RU"),
    Language("nl", R.string.translate_lang_dutch, "nl-NL"),
    Language("pl", R.string.translate_lang_polish, "pl-PL"),
    Language("tr", R.string.translate_lang_turkish, "tr-TR"),
    Language("sv", R.string.translate_lang_swedish, "sv-SE"),
    Language("da", R.string.translate_lang_danish, "da-DK"),
    Language("no", R.string.translate_lang_norwegian, "nb-NO"),
    Language("fi", R.string.translate_lang_finnish, "fi-FI"),
    Language("cs", R.string.translate_lang_czech, "cs-CZ"),
    Language("hu", R.string.translate_lang_hungarian, "hu-HU"),
    Language("ro", R.string.translate_lang_romanian, "ro-RO"),
    Language("el", R.string.translate_lang_greek, "el-GR"),
    Language("he", R.string.translate_lang_hebrew, "he-IL"),
    Language("uk", R.string.translate_lang_ukrainian, "uk-UA"),
)

@Composable
fun Language.displayName(): String = stringResource(nameRes)

val DEFAULT_LANGUAGE_CODE = "vi"
