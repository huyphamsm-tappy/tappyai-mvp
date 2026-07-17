package com.tappyai.app.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyAppBar
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyMenuRow
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

@Composable
fun AccountScreen(
    viewModel: AccountViewModel,
    onBack: () -> Unit,
    onEditProfile: () -> Unit,
) {
    Scaffold(
        topBar = { TappyAppBar(title = stringResource(R.string.account_title), onBackClick = onBack) },
    ) { innerPadding ->
        val profile = viewModel.profile
        when {
            viewModel.isLoading && profile == null -> Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) { TappyLoadingIndicator() }

            viewModel.error != null && profile == null -> Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                TappyErrorState(
                    title = stringResource(R.string.account_load_error_title),
                    message = viewModel.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = viewModel::retry,
                )
            }

            profile != null -> AccountContent(
                profile = profile,
                onEditProfile = onEditProfile,
                modifier = Modifier.fillMaxSize().padding(innerPadding),
            )
        }
    }
}

@Composable
private fun AccountContent(
    profile: AccountProfile,
    onEditProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            // Hero avatar + identity
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                TappyAvatar(
                    name = profile.fullName,
                    imageUrl = profile.avatarUrl,
                    size = TappyAvatarSize.ProfileHero,
                )
                Text(
                    text = profile.fullName,
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    text = profile.email,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Info section
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(
                    text = stringResource(R.string.account_info_section),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    TappyMenuRow(
                        icon = Icons.Filled.Person,
                        title = stringResource(R.string.account_full_name_label),
                        subtitle = profile.fullName,
                        showChevron = false,
                        onClick = {},
                    )
                    HorizontalDivider()
                    TappyMenuRow(
                        icon = Icons.Filled.Mail,
                        title = stringResource(R.string.account_email_label),
                        subtitle = profile.email,
                        showChevron = false,
                        onClick = {},
                    )
                    HorizontalDivider()
                    TappyMenuRow(
                        icon = Icons.Filled.CalendarMonth,
                        title = stringResource(R.string.account_joined_label),
                        // GET /api/profile doesn't return the creation date → no-data placeholder.
                        subtitle = profile.joinDate.ifBlank { stringResource(R.string.account_no_data_placeholder) },
                        showChevron = false,
                        onClick = {},
                    )
                }
            }

            // Edit section
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(
                    text = stringResource(R.string.account_edit_section),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    TappyMenuRow(
                        icon = Icons.Filled.Edit,
                        title = stringResource(R.string.account_edit_profile),
                        onClick = onEditProfile,
                    )
                }
            }

            Spacer(modifier = Modifier.height(TappySpacing.xl))
        }
    }
}
