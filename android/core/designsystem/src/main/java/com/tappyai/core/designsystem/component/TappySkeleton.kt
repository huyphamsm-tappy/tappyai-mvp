package com.tappyai.core.designsystem.component

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyMotion
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.rememberIsReducedMotionPreferred

/**
 * Shimmering placeholder for loading content (docs/UI_GUIDELINES.md §11/§14 loading states).
 * Skips the pulse animation entirely when the system's reduced-motion setting is on, showing
 * a static tone instead — same principle as the web guideline's `prefers-reduced-motion`.
 * Announced to TalkBack as "Loading" via [contentDescription] rather than left silent, since a
 * screen full of unlabeled shimmering boxes is otherwise invisible to a screen-reader user.
 */
@Composable
fun TappySkeleton(
    modifier: Modifier = Modifier,
    height: Dp = 16.dp,
    shape: androidx.compose.ui.graphics.Shape = TappyShapes.chip,
) {
    val reducedMotion = rememberIsReducedMotionPreferred()
    val baseColor = MaterialTheme.colorScheme.surfaceVariant

    val alpha = if (reducedMotion) {
        0.6f
    } else {
        val transition = rememberInfiniteTransition(label = "tappy-skeleton")
        transition.animateFloat(
            initialValue = 0.4f,
            targetValue = 0.9f,
            animationSpec = infiniteRepeatable(
                animation = tween(TappyMotion.LOOPING_MS),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "tappy-skeleton-alpha",
        ).value
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .background(baseColor.copy(alpha = alpha))
            .semantics { contentDescription = loadingLabel },
    )
}

private val loadingLabel = "Loading"

@TappyComponentPreviews
@Composable
private fun TappySkeletonPreview() {
    TappyAITheme(dynamicColor = false) {
        TappySkeleton(modifier = Modifier.padding(TappySpacing.xl))
    }
}
