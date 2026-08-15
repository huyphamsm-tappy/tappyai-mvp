package com.tappyai.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * "How to use TappyAI" — feature usage guidance, the native counterpart of the web's
 * `/how-to-use` page.
 *
 * Reuses [LegalDocumentScreen] rather than introducing a documentation framework: that layout
 * already gives a back header, a subtitle line, and a numbered list of titled sections, which is
 * the exact shape this content needs. Note its contract — it prefixes "1. ", "2. " BY INDEX, so
 * the section titles below must not carry their own numbers.
 *
 * Unlike Terms and Privacy, which deliberately left their long-form bodies as hardcoded English,
 * every string here lives in `strings_guide.xml` with a full `values-vi` counterpart. Guidance that
 * only half the users can read is not guidance, and `MissingTranslation` fails the build anyway.
 *
 * The content is deliberately Android-specific where the platforms differ: read-aloud is described
 * as the phone's own voice because that is what `ChatViewModel` drives (`android.speech.tts`), and
 * the Tappy notification sound gets its own section because this is the one platform where the
 * user can actually toggle it (SettingsScreen → `SettingsViewModel.tappyNotificationSoundEnabled`).
 */
@Composable
fun HowToUseScreen(onBack: () -> Unit) {
    LegalDocumentScreen(
        title = stringResource(R.string.guide_title),
        subtitle = stringResource(R.string.guide_subtitle),
        sections = listOf(
            LegalSection(
                title = stringResource(R.string.guide_chat_title),
                body = stringResource(R.string.guide_chat_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_food_title),
                body = stringResource(R.string.guide_food_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_travel_title),
                body = stringResource(R.string.guide_travel_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_product_title),
                body = stringResource(R.string.guide_product_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_readaloud_title),
                body = stringResource(R.string.guide_readaloud_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_notifications_title),
                body = stringResource(R.string.guide_notifications_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_tappysound_title),
                body = stringResource(R.string.guide_tappysound_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_reviews_title),
                body = stringResource(R.string.guide_reviews_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_saves_title),
                body = stringResource(R.string.guide_saves_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_tools_title),
                body = stringResource(R.string.guide_tools_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_account_title),
                body = stringResource(R.string.guide_account_body),
            ),
            LegalSection(
                title = stringResource(R.string.guide_limits_title),
                body = stringResource(R.string.guide_limits_body),
            ),
        ),
        onBack = onBack,
    )
}
