package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import coil.compose.SubcomposeAsyncImage
import coil.compose.SubcomposeAsyncImageContent
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes

/**
 * The single image-loading call site for the whole app — no other component should call
 * Coil's `AsyncImage`/`SubcomposeAsyncImage` directly (only one implementation should exist,
 * per the design-system convention). Coil is an internal detail; swapping loaders later means
 * changing this one function, not every call site.
 *
 * [placeholder] and [onError] are real today. Documented, not-yet-built extension points on
 * this same function for later: retry-on-error affordance, blur-up progressive loading, video
 * thumbnail frames, and crossfade/animated transitions — all belong here when needed, not as
 * a second image component.
 */
@Composable
fun TappyImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    placeholder: (@Composable () -> Unit)? = null,
    onError: (@Composable () -> Unit)? = null,
    /**
     * Fired once when the load fails, for callers that need to react rather than render something
     * in place — e.g. the plan-timeline photo, which removes its whole slot so a dead URL leaves no
     * blank band (the web's `onError={e => e.currentTarget.style.display = 'none'}`).
     *
     * Deliberately a plain callback, not a composable slot: supplying [onError] switches this
     * component onto `SubcomposeAsyncImage`, and that is the path the planner render bug came from.
     * This one keeps every caller on plain `AsyncImage`.
     */
    onLoadFailed: (() -> Unit)? = null,
) {
    // Plain AsyncImage whenever no slot is supplied. This started as a suspected fix for the
    // planner timeline's narrow-wrap bug, on the theory that SubcomposeAsyncImage's nested
    // subcomposition left a sibling Text measured against a stale constraint. That theory is
    // DISPROVEN — 24 consecutive on-device renders of the same item wrapped identically, so the
    // wrap is deterministic layout, not a subcomposition race (the real cause is in
    // TripPlanCard's PlanItemRow, see its name/price row). The branch stays because it is still
    // correct on its own terms: no real call site supplies [placeholder]/[onError] (only this
    // file's @Preview does), so every caller gets a plain layout instead of paying for
    // SubcomposeLayout, and [onLoadFailed] below needs no subcomposition to work.
    if (placeholder == null && onError == null) {
        AsyncImage(
            model = url,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
            onError = { onLoadFailed?.invoke() },
        )
        return
    }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
    ) {
        when (painter.state) {
            is AsyncImagePainter.State.Loading -> placeholder?.invoke()
            is AsyncImagePainter.State.Error -> {
                // Reported as an effect, not inline: this branch runs during composition and
                // [onLoadFailed] typically flips caller state, which must not happen mid-compose.
                LaunchedEffect(url) { onLoadFailed?.invoke() }
                onError?.invoke()
            }
            else -> SubcomposeAsyncImageContent()
        }
    }
}

/**
 * Static Preview rendering never resolves a real network fetch, and Coil treats a `null`
 * `url` as an immediate failure (not a loading state) — so both [placeholder] and [onError]
 * are wired to the same neutral box here, since which one actually renders depends on Coil's
 * internal handling rather than anything this preview controls.
 */
@TappyComponentPreviews
@Composable
private fun TappyImagePreview() {
    TappyAITheme(dynamicColor = false) {
        val neutralBox: @Composable () -> Unit = {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, TappyShapes.card),
            )
        }
        TappyImage(
            url = null,
            contentDescription = null,
            modifier = Modifier.size(96.dp),
            placeholder = neutralBox,
            onError = neutralBox,
        )
    }
}
