package com.tappyai.app.groupdining

import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Group
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Group Dining — **create** screen, matching the web `/group/new` (`GroupNewForm`): a single group-
 * name input and a submit that calls `POST /api/group`, then hands off to the group's detail page
 * (creator view) via the app navigator. Reached from Profile → "Group dining". The earlier static
 * "Feature Preview" section was placeholder-only and is gone — the real group (share link, members,
 * AI suggestion) now lives on [GroupDetailScreen].
 */
@Composable
fun GroupDiningScreen(
    onBack: () -> Unit,
    viewModel: GroupDiningViewModel = hiltViewModel(),
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.common_back),
                    )
                }
                Text(
                    text = stringResource(R.string.profile_menu_group_dining),
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            CreateGroupSection(
                groupName = viewModel.groupName,
                onGroupNameChange = viewModel::onGroupNameChange,
                onCreateGroup = viewModel::createGroup,
                isCreating = viewModel.isCreating,
                errorMessage = viewModel.errorMessage,
            )
        }
    }
}

/** Create form — group name input + submit (mirrors the web `GroupNewForm`). */
@Composable
private fun CreateGroupSection(
    groupName: String,
    onGroupNameChange: (String) -> Unit,
    onCreateGroup: () -> Unit,
    isCreating: Boolean,
    errorMessage: String?,
) {
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(TappyShapes.card)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Group,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(24.dp),
                    )
                }
                Column {
                    Text(
                        text = stringResource(R.string.groupdining_create_heading),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = stringResource(R.string.groupdining_create_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            TappyTextField(
                value = groupName,
                onValueChange = onGroupNameChange,
                label = stringResource(R.string.groupdining_name_label),
                placeholder = stringResource(R.string.groupdining_name_placeholder),
                singleLine = true,
                enabled = !isCreating,
                errorText = errorMessage,
            )

            TappyButton(
                text = stringResource(R.string.groupdining_create_button),
                onClick = onCreateGroup,
                enabled = groupName.isNotBlank(),
                loading = isCreating,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
