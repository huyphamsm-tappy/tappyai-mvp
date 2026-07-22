package com.tappyai.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * Music copyright policy (Original Sound notice-and-takedown) — content is a faithful English
 * translation of the web's `CopyrightPolicyPage` (`src/app/copyright/page.tsx`), same 5 sections,
 * same meaning. Reached from the Music library, mirroring the web, where the page is linked from
 * `/music` and referenced by the sound page's Report button.
 *
 * Reuses [LegalDocumentScreen] like [TermsOfServiceScreen]/[PrivacyPolicyScreen] do; see their docs
 * for why the body text is English and why only the chrome is localized. Static text, no backend —
 * matches the web (this page performs no API call).
 *
 * The web has no "last updated" date on this page (unlike Terms/Privacy); it opens with a scope
 * line instead, which is what [LegalDocumentScreen]'s [subtitle] slot carries here.
 */
@Composable
fun CopyrightPolicyScreen(onBack: () -> Unit) {
    LegalDocumentScreen(
        title = stringResource(R.string.legal_copyright_title),
        subtitle = stringResource(R.string.legal_copyright_scope),
        sections = listOf(
            LegalSection(
                title = stringResource(R.string.legal_copyright_section1_title),
                body = "When you upload a track (an \"Original Sound\"), you confirm that you own " +
                    "it or hold all the necessary rights to it, and you grant TappyAI and other " +
                    "users the right to use it on the platform (adding it to videos, playing it " +
                    "back). You must not upload music that is copyrighted by someone else without " +
                    "their permission.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_copyright_section2_title),
                body = "The uploader is legally responsible for the content they upload. TappyAI " +
                    "acts as an intermediary platform and will remove infringing content once it " +
                    "receives a valid notice.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_copyright_section3_title),
                body = "If you are a rights holder and believe a track on TappyAI infringes your " +
                    "copyright, send a notice to the copyright agent below, or use the " +
                    "\"Report\" button on the track's sound page. Your notice should include: " +
                    "(a) the infringing track or link, (b) evidence that you are the rights " +
                    "holder, and (c) your contact details.\n\nWe will review and remove " +
                    "infringing content within 24–48 hours of receiving a valid notice.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_copyright_section4_title),
                body = "Email: copyright@tappyai.com\n\nWe receive and handle all copyright " +
                    "complaints at this address.",
            ),
            LegalSection(
                title = stringResource(R.string.legal_copyright_section5_title),
                body = "Accounts that repeatedly upload infringing content may lose the ability " +
                    "to upload music, or be suspended.",
            ),
        ),
        onBack = onBack,
    )
}
