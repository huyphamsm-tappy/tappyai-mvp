package com.tappyai.features.auth.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.core.common.UiState
import com.tappyai.features.auth.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

// Email (magic-link) login is implemented end-to-end (LoginViewModel.onSendEmailOtpClick →
// AuthRepository.sendEmailOtp → Supabase magic link → tappyai://auth-callback deep-link session
// import) but is DEFERRED from the MVP by owner decision (infrastructure): the Supabase project's
// built-in email service is rate-limited to ~2–4 emails/hour — an infra limit, not a code issue —
// which is unusable for real users until custom SMTP is provisioned. The button is hidden behind
// this flag; no code, backend, or Magic Link flow was removed. Flip to true (and set up SMTP) to
// re-enable. MVP authentication = Google + Zalo.
private const val SHOW_EMAIL_LOGIN = false

// Public terms/privacy pages (opened in the browser; the in-app Terms/Privacy screens live behind
// the post-auth Profile graph, unreachable from this pre-auth screen).
private const val TERMS_URL = "https://www.tappyai.com/terms"
private const val PRIVACY_URL = "https://www.tappyai.com/privacy"

// Feature bullets — the four "tags" from the web login's left column, in the same order (chat,
// explore, privacy, always-on). Emoji stand in for the web's lucide icons (the auth module has no
// icon pack, and the mascot hero art is owner-provided and not present on Android — see the
// welcome header, which uses the brand wordmark rather than the /tappy/welcome.png hero).
private data class LoginFeature(val emoji: String, val titleRes: Int, val descRes: Int)

private val LOGIN_FEATURES = listOf(
    LoginFeature("💬", R.string.auth_feature_1_title, R.string.auth_feature_1_desc),
    LoginFeature("🧭", R.string.auth_feature_2_title, R.string.auth_feature_2_desc),
    LoginFeature("🔒", R.string.auth_feature_3_title, R.string.auth_feature_3_desc),
    LoginFeature("⭐", R.string.auth_feature_4_title, R.string.auth_feature_4_desc),
)

@Composable
fun LoginScreen(viewModel: LoginViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val isLoading = uiState is UiState.Loading

    Box(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.compact)
                .padding(TappySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xxl),
        ) {
            // Brand + tagline (web login's welcome/hero copy; wordmark stands in for the mascot hero).
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                Text(
                    text = stringResource(R.string.auth_welcome_to),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.auth_brand_name),
                    style = MaterialTheme.typography.displaySmall,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.auth_tagline),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.auth_personal_agent),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            // Feature bullets ("tags").
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                LOGIN_FEATURES.forEach { feature ->
                    LoginFeatureRow(
                        emoji = feature.emoji,
                        title = stringResource(feature.titleRes),
                        description = stringResource(feature.descRes),
                    )
                }
            }

            // Sign-in card.
            TappyCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
                ) {
                    Text(
                        text = stringResource(R.string.auth_signin_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = stringResource(R.string.auth_signin_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )

                    // MVP login methods: Google + Zalo. Facebook and Email are intentionally hidden
                    // from the UI (their ViewModel/AuthRepository implementations are retained for
                    // future use — Email is gated by SHOW_EMAIL_LOGIN below, deferred on infra grounds).
                    TappyButton(
                        text = stringResource(R.string.auth_continue_with_google),
                        onClick = { viewModel.onGoogleSignInClick(context) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isLoading,
                    )
                    TappyButton(
                        text = stringResource(R.string.auth_continue_with_zalo),
                        onClick = { viewModel.onZaloSignInClick(context) },
                        modifier = Modifier.fillMaxWidth(),
                        variant = TappyButtonVariant.Secondary,
                        enabled = !isLoading,
                    )

                    if (SHOW_EMAIL_LOGIN) {
                        Text(
                            text = stringResource(R.string.auth_or_divider),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TappyTextField(
                            value = viewModel.email,
                            onValueChange = viewModel::onEmailChange,
                            label = stringResource(R.string.auth_email_label),
                            placeholder = stringResource(R.string.auth_email_placeholder),
                            enabled = !isLoading,
                        )
                        TappyButton(
                            text = stringResource(R.string.auth_send_code),
                            onClick = viewModel::onSendEmailOtpClick,
                            modifier = Modifier.fillMaxWidth(),
                            variant = TappyButtonVariant.Ghost,
                            enabled = !isLoading,
                        )
                    }

                    // Trust line.
                    Text(
                        text = "🛡 " + stringResource(R.string.auth_trust_line),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )

                    // Terms / Privacy.
                    Text(
                        text = stringResource(R.string.auth_agree_prefix),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = stringResource(R.string.auth_terms),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { uriHandler.openUri(TERMS_URL) },
                        )
                        Text(
                            text = stringResource(R.string.auth_and),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = stringResource(R.string.auth_privacy),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { uriHandler.openUri(PRIVACY_URL) },
                        )
                    }
                }
            }

            if (isLoading) {
                TappyLoadingIndicator()
            }

            val errorState = uiState
            if (errorState is UiState.Error) {
                Text(
                    text = errorState.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun LoginFeatureRow(emoji: String, title: String, description: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = emoji, fontSize = 20.sp)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
