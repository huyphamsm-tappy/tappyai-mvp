package com.tappyai.app.account

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyAppBar
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

@Composable
fun AccountEditScreen(
    viewModel: AccountViewModel,
    onBack: () -> Unit,
) {
    val context = LocalContext.current

    // Save outcome is a one-shot event: success → confirm + pop back; failure → Toast, stay put.
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                AccountEvent.Saved -> {
                    // Not stringResource() — this runs inside LaunchedEffect's suspend lambda,
                    // not a @Composable context; context.getString() resolves the same localized
                    // resource directly.
                    Toast.makeText(context, context.getString(R.string.account_saved_toast), Toast.LENGTH_SHORT).show()
                    onBack()
                }
                is AccountEvent.SaveFailed -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
                is AccountEvent.AvatarUploadFailed -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    val pickAvatar = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::onAvatarPicked) }

    Scaffold(
        topBar = { TappyAppBar(title = stringResource(R.string.account_edit_profile), onBackClick = onBack) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
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
                // Avatar with camera overlay — opens the system photo picker (no runtime
                // permission needed) and uploads the result via `viewModel.onAvatarPicked`.
                val changeAvatarLabel = stringResource(R.string.account_change_avatar)
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .clickable(
                            role = Role.Button,
                            onClickLabel = changeAvatarLabel,
                            enabled = !viewModel.isUploadingAvatar,
                            onClick = {
                                pickAvatar.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                )
                            },
                        ),
                ) {
                    TappyAvatar(
                        name = viewModel.profile?.fullName ?: "",
                        imageUrl = viewModel.profile?.avatarUrl,
                        size = TappyAvatarSize.ProfileCard,
                    )
                    if (viewModel.isUploadingAvatar) {
                        val loadingLabel = stringResource(com.tappyai.core.designsystem.R.string.tappy_cd_loading)
                        Box(
                            modifier = Modifier
                                .size(TappyAvatarSize.ProfileCard.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.4f))
                                .semantics { contentDescription = loadingLabel },
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(28.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                            )
                        }
                    }
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .align(Alignment.BottomEnd)
                            .offset(x = 2.dp, y = 2.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CameraAlt,
                            contentDescription = changeAvatarLabel,
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }

                // Email — read-only with badge
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    TappyTextField(
                        value = viewModel.profile?.email ?: "",
                        onValueChange = {},
                        label = stringResource(R.string.account_email_label),
                        enabled = false,
                    )
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            text = stringResource(R.string.account_cannot_change),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(
                                horizontal = TappySpacing.md,
                                vertical = TappySpacing.xs,
                            ),
                        )
                    }
                }

                // Full name — editable
                TappyTextField(
                    value = viewModel.editName,
                    onValueChange = { viewModel.onNameChange(it) },
                    label = stringResource(R.string.account_full_name_label),
                    placeholder = stringResource(R.string.account_full_name_placeholder),
                )

                // Bio — editable with char counter
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    TappyTextField(
                        value = viewModel.editBio,
                        onValueChange = { viewModel.onBioChange(it) },
                        label = stringResource(R.string.account_bio_label),
                        placeholder = stringResource(R.string.account_bio_placeholder),
                        singleLine = false,
                        minLines = 3,
                        maxLines = 5,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        Text(
                            text = stringResource(R.string.account_bio_counter, viewModel.editBio.length),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Save button
                TappyButton(
                    text = stringResource(R.string.account_save),
                    onClick = { viewModel.onSave() },
                    loading = viewModel.isSaving,
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(modifier = Modifier.height(TappySpacing.xl))
            }
        }
    }
}
