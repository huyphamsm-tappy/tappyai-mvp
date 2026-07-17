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
                TappyButton(
                    text = stringResource(R.string.auth_continue_with_facebook),
                    onClick = viewModel::onFacebookSignInClick,
                    variant = TappyButtonVariant.Secondary,
                    enabled = !isLoading,
                )
            }

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
