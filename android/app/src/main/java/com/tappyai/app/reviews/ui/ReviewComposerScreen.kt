package com.tappyai.app.reviews.ui

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing

private val ComposerBackground = Color(0xFF000000)
private val ComposerSurface = Color(0xFF1A1A1A)
private val ComposerTextPrimary = Color(0xFFFFFFFF)
private val ComposerTextSecondary = Color(0xB3FFFFFF)
private val ComposerTextPlaceholder = Color(0x66FFFFFF)
private val ComposerDivider = Color(0x33FFFFFF)
private val ComposerAccent = Color(0xFFFE2C55)
private val ComposerAccentDisabled = Color(0x66FE2C55)
private val MediaTabActive = Color(0xFF2A2A2A)
private val MediaTabInactive = Color.Transparent
private val MediaTabText = Color(0xFFFFFFFF)
private val MediaTabTextInactive = Color(0x80FFFFFF)
private val MediaPlaceholderBorder = Color(0x4DFFFFFF)
private val MediaPlaceholderIcon = Color(0x66FFFFFF)
private val ActionRowIcon = Color(0xFFFE2C55)
private val CharCountColor = Color(0x66FFFFFF)

enum class ComposerMediaMode { Photo, Video, Link }

@Composable
fun ReviewComposerScreen(
    body: String,
    onBodyChange: (String) -> Unit,
    rating: Int,
    onRatingChange: (Int) -> Unit,
    placeName: String,
    onPlaceNameChange: (String) -> Unit,
    mediaMode: ComposerMediaMode,
    onMediaModeChange: (ComposerMediaMode) -> Unit,
    showPlaceInput: Boolean,
    onTogglePlaceInput: () -> Unit,
    showRating: Boolean,
    onToggleRating: () -> Unit,
    onBack: () -> Unit,
    onPost: () -> Unit,
    modifier: Modifier = Modifier,
    attachedSoundTitle: String? = null,
    onRemoveSound: () -> Unit = {},
    linkUrl: String = "",
    onLinkUrlChange: (String) -> Unit = {},
    linkSourceType: String? = null,
    linkThumbnailUrl: String? = null,
    isFetchingLinkMeta: Boolean = false,
) {
    // A valid pasted link is postable on its own (no body needed), matching the web + backend
    // rule that a review needs body OR media.
    val hasValidLink = linkSourceType != null && linkUrl.isNotBlank()
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ComposerBackground),
    ) {
        ComposerHeader(onBack = onBack, onPost = onPost, canPost = body.isNotBlank() || hasValidLink)
        HorizontalDivider(color = ComposerDivider, thickness = 0.5.dp)

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Spacer(modifier = Modifier.height(TappySpacing.md))

            if (attachedSoundTitle != null) {
                AttachedSoundChip(title = attachedSoundTitle, onRemove = onRemoveSound)
            }

            MediaModeTabs(selected = mediaMode, onSelect = onMediaModeChange)

            when (mediaMode) {
                // Link is the wired media lane here; Photo/Video remain placeholders on this branch.
                ComposerMediaMode.Link -> ComposerLinkSection(
                    url = linkUrl,
                    onUrlChange = onLinkUrlChange,
                    sourceType = linkSourceType,
                    thumbnailUrl = linkThumbnailUrl,
                    isFetching = isFetchingLinkMeta,
                )
                else -> MediaPlaceholder(mediaMode = mediaMode)
            }

            ComposerBody(body = body, onBodyChange = onBodyChange)

            HorizontalDivider(color = ComposerDivider, thickness = 0.5.dp)

            ComposerActionRow(
                icon = Icons.Filled.LocationOn,
                label = stringResource(R.string.reviews_composer_add_location),
                isExpanded = showPlaceInput,
                onToggle = onTogglePlaceInput,
            ) {
                TextField(
                    value = placeName,
                    onValueChange = onPlaceNameChange,
                    placeholder = {
                        Text(
                            stringResource(R.string.reviews_composer_place_name_placeholder),
                            color = ComposerTextPlaceholder,
                            fontSize = 14.sp,
                        )
                    },
                    singleLine = true,
                    colors = composerTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            ComposerActionRow(
                icon = Icons.Filled.Star,
                label = stringResource(R.string.reviews_composer_add_rating),
                isExpanded = showRating,
                onToggle = onToggleRating,
            ) {
                ReviewStarRating(rating = rating, onRatingChange = onRatingChange)
            }

            Spacer(modifier = Modifier.height(TappySpacing.xl))
        }
    }
}

@Composable
private fun ComposerHeader(onBack: () -> Unit, onPost: () -> Unit, canPost: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xs, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.common_back),
                tint = ComposerTextPrimary,
            )
        }
        Text(
            text = stringResource(R.string.reviews_new_post_label),
            color = ComposerTextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f),
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (canPost) ComposerAccent else ComposerAccentDisabled)
                .clickable(enabled = canPost, onClick = onPost)
                .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.reviews_composer_post_button),
                color = ComposerTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun MediaModeTabs(
    selected: ComposerMediaMode,
    onSelect: (ComposerMediaMode) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(ComposerSurface)
            .padding(TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        MediaTab(
            icon = Icons.Filled.CameraAlt,
            label = stringResource(R.string.reviews_composer_tab_photo),
            isSelected = selected == ComposerMediaMode.Photo,
            onClick = { onSelect(ComposerMediaMode.Photo) },
            modifier = Modifier.weight(1f),
        )
        MediaTab(
            icon = Icons.Filled.Videocam,
            label = stringResource(R.string.reviews_composer_tab_video),
            isSelected = selected == ComposerMediaMode.Video,
            onClick = { onSelect(ComposerMediaMode.Video) },
            modifier = Modifier.weight(1f),
        )
        MediaTab(
            icon = Icons.Filled.Link,
            label = stringResource(R.string.reviews_composer_tab_link),
            isSelected = selected == ComposerMediaMode.Link,
            onClick = { onSelect(ComposerMediaMode.Link) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun MediaTab(
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (isSelected) MediaTabActive else MediaTabInactive)
            .clickable(onClick = onClick)
            .padding(vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spacer(modifier = Modifier.weight(1f))
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (isSelected) MediaTabText else MediaTabTextInactive,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            color = if (isSelected) MediaTabText else MediaTabTextInactive,
            fontSize = 13.sp,
            fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
        )
        Spacer(modifier = Modifier.weight(1f))
    }
}

/** "Using: {title}" bar — mirrors TikTok/the web's attached-sound indicator on the composer,
 *  shown when this session was reached via Sound Detail's "Use this sound". */
@Composable
private fun AttachedSoundChip(title: String, onRemove: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(ComposerSurface)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.MusicNote,
            contentDescription = null,
            tint = ActionRowIcon,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(R.string.reviews_composer_using_sound, title),
            color = ComposerTextPrimary,
            fontSize = 13.sp,
            modifier = Modifier.weight(1f).padding(start = TappySpacing.sm),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.reviews_composer_remove_sound),
                tint = ComposerTextSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun MediaPlaceholder(mediaMode: ComposerMediaMode) {
    val (icon, label) = when (mediaMode) {
        ComposerMediaMode.Photo -> Icons.Filled.CameraAlt to stringResource(R.string.reviews_composer_placeholder_photo)
        ComposerMediaMode.Video -> Icons.Filled.Videocam to stringResource(R.string.reviews_composer_placeholder_video)
        ComposerMediaMode.Link -> Icons.Filled.Link to stringResource(R.string.reviews_composer_placeholder_link)
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(
                width = 1.5.dp,
                color = MediaPlaceholderBorder,
                shape = RoundedCornerShape(12.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MediaPlaceholderIcon,
                modifier = Modifier.size(40.dp),
            )
            Text(
                text = label,
                color = ComposerTextSecondary,
                fontSize = 14.sp,
            )
        }
    }
}

/**
 * Link lane of the composer: a URL field plus a live preview. As the user types, the ViewModel
 * detects the provider and resolves a poster frame — this composable renders one of three states:
 * a spinner while a TikTok/Facebook thumbnail loads, the thumbnail once available, or a plain
 * "attached" confirmation when the provider is recognized but exposes no poster frame.
 */
@Composable
private fun ComposerLinkSection(
    url: String,
    onUrlChange: (String) -> Unit,
    sourceType: String?,
    thumbnailUrl: String?,
    isFetching: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        TextField(
            value = url,
            onValueChange = onUrlChange,
            placeholder = {
                Text(
                    stringResource(R.string.reviews_composer_placeholder_link),
                    color = ComposerTextPlaceholder,
                    fontSize = 14.sp,
                )
            },
            singleLine = true,
            colors = composerTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
        )
        when {
            isFetching -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                CircularProgressIndicator(color = ComposerAccent, modifier = Modifier.size(18.dp))
                Text(
                    text = stringResource(R.string.reviews_composer_link_loading),
                    color = ComposerTextSecondary,
                    fontSize = 13.sp,
                )
            }
            thumbnailUrl != null -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(ComposerSurface),
            ) {
                TappyImage(
                    url = thumbnailUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            sourceType != null -> Text(
                // Recognized provider but no poster frame (e.g. a login-gated Facebook page).
                text = stringResource(R.string.reviews_composer_link_attached, sourceType),
                color = ComposerTextSecondary,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun ComposerBody(body: String, onBodyChange: (String) -> Unit) {
    Column {
        TextField(
            value = body,
            onValueChange = { if (it.length <= 1000) onBodyChange(it) },
            placeholder = {
                Text(
                    stringResource(R.string.reviews_composer_body_placeholder),
                    color = ComposerTextPlaceholder,
                    fontSize = 15.sp,
                )
            },
            minLines = 4,
            colors = composerTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = "${body.length}/1000",
            color = CharCountColor,
            fontSize = 11.sp,
            textAlign = TextAlign.End,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ComposerActionRow(
    icon: ImageVector,
    label: String,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    expandedContent: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = ActionRowIcon,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = label,
                color = ActionRowIcon,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        if (isExpanded) {
            expandedContent()
        }
    }
}

@Composable
private fun composerTextFieldColors() = TextFieldDefaults.colors(
    focusedTextColor = ComposerTextPrimary,
    unfocusedTextColor = ComposerTextPrimary,
    cursorColor = ComposerAccent,
    focusedContainerColor = Color.Transparent,
    unfocusedContainerColor = Color.Transparent,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
)

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ComposerEmptyPreview() {
    ReviewComposerScreen(
        body = "",
        onBodyChange = {},
        rating = 0,
        onRatingChange = {},
        placeName = "",
        onPlaceNameChange = {},
        mediaMode = ComposerMediaMode.Photo,
        onMediaModeChange = {},
        showPlaceInput = false,
        onTogglePlaceInput = {},
        showRating = false,
        onToggleRating = {},
        onBack = {},
        onPost = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ComposerFilledPreview() {
    ReviewComposerScreen(
        body = "Quán cà phê này view đẹp lắm, đồ uống cũng ngon. Recommend mọi người ghé thử!",
        onBodyChange = {},
        rating = 4,
        onRatingChange = {},
        placeName = "The Coffee House",
        onPlaceNameChange = {},
        mediaMode = ComposerMediaMode.Photo,
        onMediaModeChange = {},
        showPlaceInput = true,
        onTogglePlaceInput = {},
        showRating = true,
        onToggleRating = {},
        onBack = {},
        onPost = {},
    )
}
