package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.core.designsystem.theme.TappySpacing

private val SheetBackground = Color(0xFF1A1A1A)
private val SheetScrim = Color(0x99000000)
private val SheetDragHandle = Color(0xFF666666)
private val SheetTitle = Color(0xFFFFFFFF)
private val ActionCircleBackground = Color(0xFF2A2A2A)
private val ActionIconColor = Color(0xFFFFFFFF)
private val ActionLabelColor = Color(0xFFFFFFFF)
private val CopiedIconColor = Color(0xFF4ADE80)
private val UrlPreviewBackground = Color(0xFF2A2A2A)
private val UrlPreviewText = Color(0xFF9CA3AF)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReviewShareSheet(
    shareUrl: String,
    isCopied: Boolean,
    onCopyLink: () -> Unit,
    onShareExternal: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
        containerColor = SheetBackground,
        scrimColor = SheetScrim,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = TappySpacing.md)
                    .size(width = 32.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(SheetDragHandle),
            )
        },
    ) {
        ShareSheetContent(
            shareUrl = shareUrl,
            isCopied = isCopied,
            onCopyLink = onCopyLink,
            onShareExternal = onShareExternal,
        )
    }
}

@Composable
private fun ShareSheetContent(
    shareUrl: String,
    isCopied: Boolean,
    onCopyLink: () -> Unit,
    onShareExternal: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl)
            .padding(bottom = TappySpacing.huge),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
    ) {
        Text(
            text = stringResource(R.string.reviews_share_sheet_title),
            color = SheetTitle,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.huge),
        ) {
            ShareActionCircle(
                icon = if (isCopied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                label = if (isCopied) {
                    stringResource(R.string.reviews_share_copied_label)
                } else {
                    stringResource(R.string.reviews_share_copy_label)
                },
                iconTint = if (isCopied) CopiedIconColor else ActionIconColor,
                onClick = onCopyLink,
            )
            ShareActionCircle(
                icon = Icons.Filled.Share,
                label = stringResource(R.string.reviews_action_share),
                iconTint = ActionIconColor,
                onClick = onShareExternal,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(UrlPreviewBackground)
                .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        ) {
            Text(
                text = shareUrl,
                color = UrlPreviewText,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ShareActionCircle(
    icon: ImageVector,
    label: String,
    iconTint: Color,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(ActionCircleBackground)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = iconTint,
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            text = label,
            color = ActionLabelColor,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF1A1A1A, widthDp = 390)
@Composable
private fun ShareSheetContentPreview() {
    ShareSheetContent(
        shareUrl = "https://tappyai.com/reviews/${SEED_REVIEWS.first().id}",
        isCopied = false,
        onCopyLink = {},
        onShareExternal = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF1A1A1A, widthDp = 390)
@Composable
private fun ShareSheetContentCopiedPreview() {
    ShareSheetContent(
        shareUrl = "https://tappyai.com/reviews/${SEED_REVIEWS.first().id}",
        isCopied = true,
        onCopyLink = {},
        onShareExternal = {},
    )
}
