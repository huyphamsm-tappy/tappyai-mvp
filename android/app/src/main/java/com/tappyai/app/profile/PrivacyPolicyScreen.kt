package com.tappyai.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * Privacy Policy — content is a faithful English translation of the web's `PrivacyPage`
 * (`src/app/profile/privacy/page.tsx`), same 6 sections, same meaning, same "last updated" date.
 * See [TermsOfServiceScreen]'s doc comment for why English (not Vietnamese) is used here. Static
 * text, no backend — matches the web (this page performs no API call).
 *
 * Only the chrome (title, "last updated" date, section headers) is localized via string
 * resources; the long-form body paragraphs stay hardcoded English — deliberately out of scope
 * for this i18n pass (matches [TermsOfServiceScreen]'s same scope boundary).
 */
@Composable
fun PrivacyPolicyScreen(onBack: () -> Unit) {
    LegalDocumentScreen(
        title = stringResource(R.string.legal_privacy_title),
        subtitle = stringResource(R.string.legal_last_updated, stringResource(R.string.legal_last_updated_date)),
        sections = listOf(
            LegalSection(
                title = stringResource(R.string.legal_privacy_section1_title),
                body = "When you sign in with Google, TappyAI stores your name, email, and " +
                    "profile picture from your Google account. We also store your chat history " +
                    "with the AI assistant so you can review it later.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_privacy_section2_title),
                body = "Information is used to provide and improve the chat experience, " +
                    "remember your conversation history, and display your account information " +
                    "in the Profile section. We do not sell your personal information to third " +
                    "parties.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_privacy_section3_title),
                body = "To answer questions about prices, locations, and services, TappyAI " +
                    "sends the content of your questions to AI and search services (Anthropic " +
                    "Claude, Google Search) to retrieve results. These services process data " +
                    "according to their own policies.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_privacy_section4_title),
                body = "Your data is stored on Supabase with per-account authentication and " +
                    "authorization. Only you can view your own chat history and profile " +
                    "information.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_privacy_section5_title),
                body = "You can sign out at any time. If you want to delete your account and " +
                    "all related data, please contact TappyAI support by email.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_privacy_section6_title),
                body = "This policy may be updated from time to time. Any changes will be " +
                    "reflected in the new version of this page.",
            ),
        ),
        onBack = onBack,
    )
}
