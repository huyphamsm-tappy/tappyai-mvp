package com.tappyai.app.groupdining

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * Group Dining — **detail** screen (`/group/[id]` → `GroupPage` on the web). Full-screen, pushed
 * over the shell (reached after creating a group, or via a `tappyai://group/{id}` deep link).
 * Branches exactly like the web: creator sees the share link + member list + an AI-suggestion
 * trigger; a non-creator sees a join form, then a "joined, waiting" state; the suggestion shows to
 * everyone once generated.
 */
@Composable
fun GroupDetailScreen(
    onBack: () -> Unit,
    viewModel: GroupDetailViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        viewModel.messages.collect { msg ->
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    // Hoisted here (rather than inline inside shareLink/copyLink's non-composable bodies) since
    // those need localized text but aren't @Composable — same pattern as QrProfileSheet's
    // shareChooserTitle hoisting.
    val shareChooserTitle = stringResource(R.string.groupdining_share_chooser_title)
    val linkClipLabel = stringResource(R.string.groupdining_link_clip_label)

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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
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

            when (val state = viewModel.uiState) {
                is UiState.Loading, UiState.Idle -> TappyLoadingIndicator()

                // 404 / no such group — the web's "Không tìm thấy nhóm này".
                UiState.Empty -> TappyErrorState(
                    title = stringResource(R.string.groupdining_not_found_title),
                    message = stringResource(R.string.groupdining_not_found_message),
                    onRetry = null,
                )

                is UiState.Error -> TappyErrorState(
                    title = stringResource(R.string.groupdining_load_error_title),
                    message = state.message,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = viewModel::load,
                )

                is UiState.Success -> GroupContent(
                    group = state.data,
                    isCreator = viewModel.isCreator(state.data),
                    viewModel = viewModel,
                    onShare = { link -> shareLink(context, link, shareChooserTitle) },
                    onCopy = { link -> copyLink(context, link, linkClipLabel) },
                )
            }
        }
    }
}

@Composable
private fun GroupContent(
    group: Group,
    isCreator: Boolean,
    viewModel: GroupDetailViewModel,
    onShare: (String) -> Unit,
    onCopy: (String) -> Unit,
) {
    val shareLink = "${BuildConfig.WEB_APP_URL}/${viewModel.groupLinkPath}"

    // Header card — name + member count.
    GroupHeaderCard(name = group.name, memberCount = group.members.size)

    if (isCreator) {
        ShareLinkCard(link = shareLink, onCopy = { onCopy(shareLink) }, onShare = { onShare(shareLink) })
        MemberListCard(members = group.members)
        if (group.members.isNotEmpty() && group.suggestion == null) {
            TappyButton(
                text = stringResource(R.string.groupdining_suggest_button),
                onClick = viewModel::suggest,
                loading = viewModel.suggesting,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    } else if (!viewModel.joined) {
        JoinFormCard(viewModel = viewModel)
    } else if (group.suggestion == null) {
        JoinedWaitingCard()
    }

    group.suggestion?.let { SuggestionCard(it) }
}

@Composable
private fun GroupHeaderCard(name: String, memberCount: Int) {
    TappyCard {
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
                Text(text = name, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = if (memberCount == 1) {
                        stringResource(R.string.groupdining_members_one, memberCount)
                    } else {
                        stringResource(R.string.groupdining_members_other, memberCount)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ShareLinkCard(link: String, onCopy: () -> Unit, onShare: () -> Unit) {
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(
                text = stringResource(R.string.groupdining_share_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 1.sp,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.card)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = link,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = {
                        onCopy()
                        copied = true
                    },
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(
                        imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                        contentDescription = if (copied) {
                            stringResource(R.string.groupdining_copied_content_description)
                        } else {
                            stringResource(R.string.groupdining_copy_link_content_description)
                        },
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                }
                IconButton(onClick = onShare, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Filled.Share,
                        contentDescription = stringResource(R.string.groupdining_share_link_content_description),
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun MemberListCard(members: List<GroupMember>) {
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(
                text = stringResource(R.string.groupdining_members_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 1.sp,
            )
            if (members.isEmpty()) {
                Text(
                    text = stringResource(R.string.groupdining_no_members_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                members.forEachIndexed { index, member ->
                    if (index > 0) HorizontalDivider()
                    MemberRow(member)
                }
            }
        }
    }
}

@Composable
private fun MemberRow(member: GroupMember) {
    Column(
        modifier = Modifier.padding(vertical = TappySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(text = member.name, style = MaterialTheme.typography.titleSmall)
        if (member.budget.isNotBlank()) {
            DetailLine(stringResource(R.string.groupdining_member_budget, member.budget))
        }
        if (member.foodPreferences.isNotBlank()) {
            DetailLine(stringResource(R.string.groupdining_member_likes, member.foodPreferences))
        }
        if (member.dietaryRestrictions.isNotBlank()) {
            DetailLine(stringResource(R.string.groupdining_member_avoids, member.dietaryRestrictions))
        }
        if (member.area.isNotBlank()) {
            DetailLine(stringResource(R.string.groupdining_member_area, member.area))
        }
    }
}

@Composable
private fun DetailLine(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun JoinFormCard(viewModel: GroupDetailViewModel) {
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
            Text(
                text = stringResource(R.string.groupdining_join_title),
                style = MaterialTheme.typography.titleMedium,
            )

            TappyTextField(
                value = viewModel.joinName,
                onValueChange = viewModel::onJoinNameChange,
                label = stringResource(R.string.groupdining_join_name_label),
                placeholder = stringResource(R.string.groupdining_join_name_placeholder),
                singleLine = true,
                enabled = !viewModel.joining,
            )

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(
                    text = stringResource(R.string.groupdining_join_budget_label),
                    style = MaterialTheme.typography.bodyMedium,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    BudgetOption.entries.forEach { option ->
                        BudgetChip(
                            label = option.label,
                            selected = viewModel.joinBudget == option,
                            enabled = !viewModel.joining,
                            onClick = { viewModel.onJoinBudgetChange(option) },
                        )
                    }
                }
            }

            TappyTextField(
                value = viewModel.joinFoodPrefs,
                onValueChange = viewModel::onJoinFoodPrefsChange,
                label = stringResource(R.string.groupdining_join_food_label),
                placeholder = stringResource(R.string.groupdining_join_food_placeholder),
                singleLine = true,
                enabled = !viewModel.joining,
            )

            TappyTextField(
                value = viewModel.joinDietary,
                onValueChange = viewModel::onJoinDietaryChange,
                label = stringResource(R.string.groupdining_join_dietary_label),
                placeholder = stringResource(R.string.groupdining_join_dietary_placeholder),
                singleLine = true,
                enabled = !viewModel.joining,
            )

            TappyTextField(
                value = viewModel.joinArea,
                onValueChange = viewModel::onJoinAreaChange,
                label = stringResource(R.string.groupdining_join_area_label),
                placeholder = stringResource(R.string.groupdining_join_area_placeholder),
                singleLine = true,
                enabled = !viewModel.joining,
                errorText = viewModel.joinError,
            )

            TappyButton(
                text = stringResource(R.string.groupdining_join_button),
                onClick = viewModel::join,
                enabled = viewModel.canSubmitJoin,
                loading = viewModel.joining,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun BudgetChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .clip(TappyShapes.input)
            .background(if (selected) colors.primary else colors.surfaceVariant)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (selected) colors.onPrimary else colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun JoinedWaitingCard() {
    TappyCard {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(text = "🎉", fontSize = 32.sp)
            Text(
                text = stringResource(R.string.groupdining_joined_title),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = stringResource(R.string.groupdining_joined_waiting_message),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SuggestionCard(suggestion: String) {
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = "🍽️", fontSize = 24.sp)
                Text(
                    text = stringResource(R.string.groupdining_suggestion_title),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Text(
                text = suggestion,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun copyLink(context: Context, link: String, clipLabel: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText(clipLabel, link))
}

private fun shareLink(context: Context, link: String, chooserTitle: String) {
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, link)
    }
    context.startActivity(Intent.createChooser(sendIntent, chooserTitle))
}
