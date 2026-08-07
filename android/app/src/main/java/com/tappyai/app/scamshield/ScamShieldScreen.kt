package com.tappyai.app.scamshield

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * Scam Shield — a port of the web's `/scam-shield` page (`ScamShieldView.tsx`, main @ 11453de).
 *
 * Same two tabs, same single image picker, same submit rules, same error copy. All analysis is
 * server-side; this screen posts and renders.
 */
@Composable
fun ScamShieldScreen(
    onBack: () -> Unit,
    viewModel: ScamShieldViewModel = hiltViewModel(),
) {
    // ACTION_GET_CONTENT, matching the web's single `<input type="file" accept="image/*"
    // capture="environment">`: one affordance, and the OS decides whether that means camera or
    // gallery. A separate in-app camera scanner would be a capability the web does not have.
    val pickImage = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let(viewModel::onQrImagePicked) }

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
                        contentDescription = stringResource(R.string.scam_shield_cd_back),
                    )
                }
                Text(
                    text = stringResource(R.string.scam_shield_title),
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            Header()

            TabSwitcher(
                selected = viewModel.tab,
                onSelect = viewModel::onTabSelected,
            )

            when (viewModel.tab) {
                ScamShieldTab.URL -> UrlTab(
                    url = viewModel.url,
                    loading = viewModel.loading,
                    onUrlChange = viewModel::onUrlChange,
                    onSubmit = viewModel::onCheckUrl,
                )
                ScamShieldTab.QR -> QrTab(
                    loading = viewModel.loading,
                    onPick = { pickImage.launch("image/*") },
                )
            }

            viewModel.errorMessage?.let { ErrorBanner(it) }
            viewModel.result?.let { ScamShieldResultCard(it) }
        }
    }
}

@Composable
private fun Header() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.VerifiedUser,
                contentDescription = stringResource(R.string.scam_shield_cd_shield),
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = stringResource(R.string.scam_shield_title),
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.scam_shield_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** The web's segmented control. Selecting a tab clears the previous result and error. */
@Composable
private fun TabSwitcher(selected: ScamShieldTab, onSelect: (ScamShieldTab) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        TabButton(
            label = "URL",
            icon = Icons.Filled.Search,
            active = selected == ScamShieldTab.URL,
            modifier = Modifier.weight(1f),
        ) { onSelect(ScamShieldTab.URL) }
        TabButton(
            label = "QR",
            icon = Icons.Filled.QrCode,
            active = selected == ScamShieldTab.QR,
            modifier = Modifier.weight(1f),
        ) { onSelect(ScamShieldTab.QR) }
    }
}

@Composable
private fun TabButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    active: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .background(
                if (active) MaterialTheme.colorScheme.surface else androidx.compose.ui.graphics.Color.Transparent,
                RoundedCornerShape(8.dp),
            )
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun UrlTab(
    url: String,
    loading: Boolean,
    onUrlChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        OutlinedTextField(
            value = url,
            onValueChange = onUrlChange,
            placeholder = { Text(stringResource(R.string.scam_shield_url_placeholder)) },
            enabled = !loading,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            // Web submits on Enter in the field.
            keyboardActions = KeyboardActions(onGo = { onSubmit() }),
            trailingIcon = {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                }
            },
        )
        Button(
            onClick = onSubmit,
            // Web: `disabled={!url.trim() || loading}`.
            enabled = url.trim().isNotEmpty() && !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                stringResource(
                    if (loading) R.string.scam_shield_checking else R.string.scam_shield_check,
                ),
            )
        }
    }
}

@Composable
private fun QrTab(loading: Boolean, onPick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant,
                RoundedCornerShape(12.dp),
            )
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .clickable(enabled = !loading, onClick = onPick)
            .padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(32.dp), strokeWidth = 3.dp)
        } else {
            Icon(
                Icons.Filled.Upload,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = stringResource(
                if (loading) R.string.scam_shield_checking else R.string.scam_shield_qr_upload,
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ErrorBanner(message: String) {
    val cat = tappyCategoryColors
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = cat.red.onContainer,
        modifier = Modifier
            .fillMaxWidth()
            .background(cat.red.container, RoundedCornerShape(12.dp))
            .border(1.dp, cat.red.accent.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(TappySpacing.md),
    )
}
