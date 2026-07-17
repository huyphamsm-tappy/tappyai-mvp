package com.tappyai.features.auth.ui.otp

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyAppBar
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.features.auth.R

@Composable
fun EmailOtpVerificationScreen(
    onBackClick: () -> Unit,
    viewModel: EmailOtpVerificationViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val isLoading = uiState is UiState.Loading

    Scaffold(
        topBar = { TappyAppBar(title = stringResource(R.string.auth_otp_title), onBackClick = onBackClick) },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.TopCenter,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = TappyContainers.compact)
                    .padding(TappySpacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                Text(
                    text = stringResource(R.string.auth_otp_sent_to, viewModel.email),
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.auth_otp_instructions),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )

                HorizontalDivider()
                Text(
                    text = stringResource(R.string.auth_otp_code_divider),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                TappyTextField(
                    value = viewModel.code,
                    onValueChange = viewModel::onCodeChange,
                    label = stringResource(R.string.auth_otp_code_label),
                    placeholder = stringResource(R.string.auth_otp_code_placeholder),
                    enabled = !isLoading,
                    keyboardType = KeyboardType.NumberPassword,
                )
                TappyButton(
                    text = stringResource(R.string.auth_verify_code),
                    onClick = viewModel::onVerifyClick,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading,
                )

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
}
