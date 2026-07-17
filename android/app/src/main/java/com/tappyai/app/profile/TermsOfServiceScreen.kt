package com.tappyai.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * Terms of Service — content is a faithful English translation of the web's `TermsPage`
 * (`src/app/profile/terms/page.tsx`), same 6 sections, same meaning, same "last updated" date.
 * English rather than the web's Vietnamese to match this Android app's existing UI-language
 * convention (established throughout every other screen — see `NetworkErrorMessages.kt`'s own
 * note on this project's MVP localization stance); the web is still the source of truth for
 * *content*, not for UI language. Static text, no backend — matches the web (this page performs
 * no API call; it renders fixed legal copy).
 *
 * Only the chrome (title, "last updated" date, section headers) is localized via string
 * resources; the long-form body paragraphs stay hardcoded English — deliberately out of scope
 * for this i18n pass.
 */
@Composable
fun TermsOfServiceScreen(onBack: () -> Unit) {
    LegalDocumentScreen(
        title = stringResource(R.string.legal_terms_title),
        subtitle = stringResource(R.string.legal_last_updated, stringResource(R.string.legal_last_updated_date)),
        sections = listOf(
            LegalSection(
                title = stringResource(R.string.legal_terms_section1_title),
                body = "TappyAI is an AI assistant that helps you find places to eat, shop, " +
                    "get spa treatments, be entertained, travel, and access related reference " +
                    "information. By using TappyAI, you agree to the terms below.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_terms_section2_title),
                body = "You need to sign in with a Google account to use TappyAI. You are " +
                    "responsible for keeping your account secure and for all activity that " +
                    "occurs under it.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_terms_section3_title),
                body = "Prices, locations, reviews, and other information provided by TappyAI " +
                    "are for reference only, compiled from public search sources, and may " +
                    "change over time, by branch, or by the moment. TappyAI does not guarantee " +
                    "absolute accuracy and is not responsible for decisions made based on this " +
                    "information.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_terms_section4_title),
                body = "You agree not to use TappyAI for any illegal or harmful purpose, or in " +
                    "a way that violates the rights of others.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_terms_section5_title),
                body = "TappyAI may update these terms from time to time. Continuing to use " +
                    "the service after a change means you accept the new terms.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_terms_section6_title),
                body = "If you have questions about these terms, please contact TappyAI " +
                    "support by email.",
            ),
        ),
        onBack = onBack,
    )
}
