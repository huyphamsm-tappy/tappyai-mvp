package com.tappyai.app.reviews.ui

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.app.explore.ExploreV3
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappySpacing

private val EditTextPrimary = Color(0xFFFFFFFF)
private val EditTextSecondary = Color(0xFF98A2C4)
private val EditError = Color(0xFFFF6B6B)

/**
 * Explore → My Profile → Sửa hồ sơ: the creator profile's own Edit screen (V3, mockup 05_17_48
 * — the avatar with its camera badge, the name, the bio), NOT the app's Tôi tab.
 *
 * Fields are exactly what `/api/profile` stores: display name, bio, avatar. The mockup's handle,
 * city and website have no field on any endpoint and are therefore not offered (see
 * [SelfProfileEditUiState]). The avatar uploads on pick, through the same multipart route and
 * limits the account screen uses; Save is one `PATCH`, then the caller pops back to the profile,
 * which re-reads everything from the server on resume.
 */
@Composable
internal fun SelfProfileEditScreen(
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: SelfProfileEditViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val savedToast = stringResource(R.string.reviews_self_edit_saved)
    val pickAvatar = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(viewModel::onAvatarPicked)
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                SelfProfileEditEvent.Saved -> {
                    Toast.makeText(context, savedToast, Toast.LENGTH_SHORT).show()
                    onSaved()
                }
                is SelfProfileEditEvent.SaveFailed -> Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                is SelfProfileEditEvent.AvatarUploadFailed -> Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ExploreV3.Background)
            // The shell hides the bottom bar while the IME is up; the screen consumes the inset
            // itself so the bio field stays above the keyboard (same contract as Chat / Detail).
            .imePadding(),
    ) {
        // Header: back, the title, and Save as the one primary action (mockup's "Chỉnh sửa" dress).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = TappySpacing.xs, end = TappySpacing.xl, top = TappySpacing.md, bottom = TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = EditTextPrimary)
            }
            Text(
                text = stringResource(R.string.reviews_self_edit_title),
                color = EditTextPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            SaveButton(enabled = uiState.canSave, saving = uiState.isSaving, onClick = viewModel::onSave)
        }

        when {
            uiState.isLoading -> TappyLoadingIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            uiState.loadError != null -> TappyErrorState(
                title = stringResource(R.string.reviews_profile_error_title),
                message = uiState.loadError,
                retryText = stringResource(R.string.common_try_again),
                onRetry = viewModel::load,
            )
            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // The avatar with the mockup's purple camera badge: tap either to pick a new image.
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .clickable(onClickLabel = stringResource(R.string.reviews_self_edit_change_avatar)) {
                            if (!uiState.isUploadingAvatar) {
                                pickAvatar.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            }
                        },
                ) {
                    Box(
                        modifier = Modifier
                            .size(112.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(listOf(ExploreV3.Purple, ExploreV3.Outline)))
                            .padding(2.dp),
                    ) {
                        TappyAvatar(
                            name = uiState.name,
                            imageUrl = uiState.avatarUrl,
                            size = TappyAvatarSize.ProfileHero,
                            modifier = Modifier.fillMaxSize().clip(CircleShape),
                        )
                        if (uiState.isUploadingAvatar) {
                            Box(
                                modifier = Modifier.fillMaxSize().clip(CircleShape).background(Color(0x99000000)),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(color = EditTextPrimary, modifier = Modifier.size(28.dp))
                            }
                        }
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(ExploreV3.Purple)
                            .border(3.dp, ExploreV3.Background, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.PhotoCamera,
                            contentDescription = stringResource(R.string.reviews_self_edit_change_avatar),
                            tint = EditTextPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(TappySpacing.huge))

                EditField(
                    label = stringResource(R.string.reviews_self_edit_name_label),
                    value = uiState.name,
                    onValueChange = viewModel::onNameChange,
                    placeholder = stringResource(R.string.reviews_self_edit_name_placeholder),
                    errorText = uiState.nameError?.let { stringResource(it) },
                    counter = "${uiState.name.length}/${SelfProfileEditUiState.NAME_MAX}",
                    singleLine = true,
                    imeAction = ImeAction.Next,
                )

                Spacer(modifier = Modifier.height(TappySpacing.xxl))

                EditField(
                    label = stringResource(R.string.reviews_self_edit_bio_label),
                    value = uiState.bio,
                    onValueChange = viewModel::onBioChange,
                    placeholder = stringResource(R.string.reviews_self_edit_bio_placeholder),
                    errorText = null,
                    counter = "${uiState.bio.length}/${SelfProfileEditUiState.BIO_MAX}",
                    singleLine = false,
                    imeAction = ImeAction.Default,
                )

                Spacer(modifier = Modifier.height(TappySpacing.xl))

                // What this screen deliberately does not offer, said once, in the user's language.
                Text(
                    text = stringResource(R.string.reviews_self_edit_scope_note),
                    color = EditTextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun SaveButton(enabled: Boolean, saving: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(if (enabled) ExploreV3.Purple else ExploreV3.Surface)
            .border(1.dp, if (enabled) ExploreV3.Purple else ExploreV3.Outline, RoundedCornerShape(20.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = TappySpacing.xxl),
        contentAlignment = Alignment.Center,
    ) {
        if (saving) {
            CircularProgressIndicator(color = EditTextPrimary, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        } else {
            Text(
                text = stringResource(R.string.reviews_self_edit_save),
                color = if (enabled) EditTextPrimary else EditTextSecondary,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** A labelled, rounded, night-palette text field with its counter under it. */
@Composable
private fun EditField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    errorText: String?,
    counter: String,
    singleLine: Boolean,
    imeAction: ImeAction,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            color = EditTextSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = TappySpacing.sm),
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(placeholder, color = EditTextSecondary.copy(alpha = 0.7f)) },
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 3,
            maxLines = if (singleLine) 1 else 5,
            isError = errorText != null,
            keyboardOptions = KeyboardOptions(imeAction = imeAction),
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = EditTextPrimary,
                unfocusedTextColor = EditTextPrimary,
                cursorColor = ExploreV3.Purple,
                focusedBorderColor = ExploreV3.Purple,
                unfocusedBorderColor = ExploreV3.Outline,
                errorBorderColor = EditError,
                focusedContainerColor = ExploreV3.Surface,
                unfocusedContainerColor = ExploreV3.Surface,
                errorContainerColor = ExploreV3.Surface,
                errorTextColor = EditTextPrimary,
                errorCursorColor = EditError,
            ),
        )
        Row(modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.xs), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(text = errorText ?: "", color = EditError, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Spacer(modifier = Modifier.width(TappySpacing.md))
            Text(text = counter, color = EditTextSecondary, fontSize = 12.sp)
        }
    }
}
