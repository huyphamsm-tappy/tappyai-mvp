package com.tappyai.features.auth.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.core.common.UiState
import com.tappyai.features.auth.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
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

@Composable
fun LoginScreen(viewModel: LoginViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Text(
                text = stringResource(R.string.auth_brand_name),
                style = MaterialTheme.typography.displayLarge,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.auth_subtitle),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                TappyButton(
                    text = stringResource(R.string.auth_continue_with_google),
                    onClick = { viewModel.onGoogleSignInClick(context) },
                    enabled = !isLoading,
                )
                // MVP login methods: Google + Zalo. Facebook and Email are intentionally hidden
                // from the UI (their ViewModel/AuthRepository implementations are retained for
                // future use — Email is gated by SHOW_EMAIL_LOGIN below, deferred on infra grounds).
                TappyButton(
                    text = stringResource(R.string.auth_continue_with_zalo),
                    onClick = { viewModel.onZaloSignInClick(context) },
                    variant = TappyButtonVariant.Secondary,
                    enabled = !isLoading,
                )
            }

            if (SHOW_EMAIL_LOGIN) {
                Text(
                    text = stringResource(R.string.auth_or_divider),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
                ) {
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
                        variant = TappyButtonVariant.Ghost,
                        enabled = !isLoading,
                    )
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
