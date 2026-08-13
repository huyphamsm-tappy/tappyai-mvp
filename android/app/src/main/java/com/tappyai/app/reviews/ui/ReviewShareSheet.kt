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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.MoreHoriz
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.app.share.TappyShare
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

// Brand circles rather than brand logos: shipping Facebook/TikTok/Zalo marks would mean vendoring
// trademarked assets. A monogram in the network's own colour reads correctly next to its label.
private val FacebookBlue = Color(0xFF1877F2)
private val TikTokRed = Color(0xFFEE1D52)
private val ZaloBlue = Color(0xFF0068FF)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReviewShareSheet(
    shareUrl: String,
    isCopied: Boolean,
    onTarget: (TappyShare.Target) -> Unit,
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
            onTarget = onTarget,
        )
    }
}

@Composable
private fun ShareSheetContent(
    shareUrl: String,
    isCopied: Boolean,
    onTarget: (TappyShare.Target) -> Unit,
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

        // Order comes from the shared contract, so web, Android and iOS cannot drift apart.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            for (target in TappyShare.targets) {
                ShareTargetCircle(
                    target = target,
                    isCopied = isCopied,
                    onClick = { onTarget(target) },
                )
            }
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
private fun ShareTargetCircle(
    target: TappyShare.Target,
    isCopied: Boolean,
    onClick: () -> Unit,
) {
    val copied = target == TappyShare.Target.COPY && isCopied
    val label = when (target) {
        TappyShare.Target.FACEBOOK -> stringResource(R.string.reviews_share_facebook)
        TappyShare.Target.TIKTOK -> stringResource(R.string.reviews_share_tiktok)
        TappyShare.Target.ZALO -> stringResource(R.string.reviews_share_zalo)
        TappyShare.Target.COPY ->
            if (copied) {
                stringResource(R.string.reviews_share_copied_label)
            } else {
                stringResource(R.string.reviews_share_copy_link)
            }
        TappyShare.Target.NATIVE -> stringResource(R.string.reviews_share_more_apps)
    }

    Column(
        modifier = Modifier.width(64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Box(
            modifier = Modifier
                // 56dp clears the 48dp minimum touch target with room to spare.
                .size(56.dp)
                .clip(CircleShape)
                .background(circleColor(target))
                .clickable(onClick = onClick)
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            when (target) {
                TappyShare.Target.FACEBOOK -> Monogram("f")
                TappyShare.Target.TIKTOK -> Monogram("♪")
                TappyShare.Target.ZALO -> Monogram("Z")
                TappyShare.Target.COPY -> TargetIcon(
                    if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    if (copied) CopiedIconColor else ActionIconColor,
                )
                TappyShare.Target.NATIVE -> TargetIcon(Icons.Filled.MoreHoriz, ActionIconColor)
            }
        }
        Text(
            text = label,
            color = ActionLabelColor,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

// Copy and the system-share circle stay neutral — the copied state is carried by the tick and the
// label, not by recolouring the circle.
private fun circleColor(target: TappyShare.Target): Color = when (target) {
    TappyShare.Target.FACEBOOK -> FacebookBlue
    TappyShare.Target.TIKTOK -> TikTokRed
    TappyShare.Target.ZALO -> ZaloBlue
    TappyShare.Target.COPY, TappyShare.Target.NATIVE -> ActionCircleBackground
}

@Composable
private fun Monogram(text: String) {
    Text(
        text = text,
        color = Color.White,
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun TargetIcon(icon: ImageVector, tint: Color) {
    Icon(
        imageVector = icon,
        // The circle already carries a contentDescription; this would only repeat it.
        contentDescription = null,
        tint = tint,
        modifier = Modifier.size(24.dp),
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF1A1A1A, widthDp = 390)
@Composable
private fun ShareSheetContentPreview() {
    ShareSheetContent(
        shareUrl = TappyShare.reviewUrl(SEED_REVIEWS.first().id),
        isCopied = false,
        onTarget = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF1A1A1A, widthDp = 390)
@Composable
private fun ShareSheetContentCopiedPreview() {
    ShareSheetContent(
        shareUrl = TappyShare.reviewUrl(SEED_REVIEWS.first().id),
        isCopied = true,
        onTarget = {},
    )
}
