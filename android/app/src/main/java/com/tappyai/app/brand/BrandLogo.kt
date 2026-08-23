package com.tappyai.app.brand

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tappyai.core.common.brand.BrandBackground
import com.tappyai.core.common.brand.BrandDefinition
import com.tappyai.core.common.brand.resolveBrand
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import kotlin.math.min

/**
 * Renders a partner's official logo on a fixed square tile, or nothing at all when the partner is
 * not in the registry.
 *
 * The Android half of `src/components/ui/BrandLogo.tsx`, following the rendering contract spelled
 * out in `docs/architecture/BRAND_ASSETS.md` §13: fixed square tile, inner box = 72% of the tile ×
 * the brand's optical scale, `ContentScale.Fit`, content description "<displayName> logo".
 *
 * RETURNING NOTHING FOR AN UNKNOWN BRAND IS THE CONTRACT, not an oversight. §8 makes the registry
 * the first of three fallbacks, so the call site keeps its own placeholder for partners that are
 * not registered — exactly as the web's renderer returns `null` and `DealsView` falls through to
 * `deal.logoImage` and then the partner initial. Use [hasBrandLogo] to ask before composing.
 *
 * Lives in `:app` rather than `core:designsystem` because that module deliberately has no project
 * dependencies and this needs the registry in `core:common`; the package is shared
 * (`com.tappyai.app.brand`, not `…app.deals`) since the registry is a platform capability that
 * Explore and AI recommendations are expected to use next.
 */
@Composable
fun BrandLogo(
    partnerName: String?,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    decorative: Boolean = false,
) {
    val brand = resolveBrand(partnerName) ?: return
    val inner = size * (0.72f * min(brand.scale, MAX_SCALE).toFloat())

    Box(
        modifier = modifier
            .size(size)
            .clip(TappyShapes.input)
            .background(tileColor(brand.background)),
        contentAlignment = Alignment.Center,
    ) {
        TappyImage(
            url = assetUrl(brand.logo),
            // A logo next to the partner's own name would make a screen reader say the name twice.
            contentDescription = if (decorative) null else "${brand.displayName} logo",
            modifier = Modifier.size(inner),
            // Fit, never Crop: these are official marks with their own aspect ratios — wordmarks
            // fill the width, square marks the height. Cropping one would deface it.
            contentScale = ContentScale.Fit,
        )
    }
}

/** Whether [partnerName] has an official logo, i.e. whether [BrandLogo] would draw anything. */
fun hasBrandLogo(partnerName: String?): Boolean = resolveBrand(partnerName) != null

/**
 * `brands/shopee.png` → a URI Coil can open. A value already starting with `http` is passed
 * through, so a future admin-CMS entry pointing at a CDN renders identically to a bundled one —
 * the same "renderer treats both identically" rule the web follows.
 */
internal fun assetUrl(logo: String): String =
    if (logo.startsWith("http", ignoreCase = true)) logo else "file:///android_asset/$logo"

/**
 * The tile the mark was designed for. `DARK` exists for lockups that are white by brand standard
 * (TikTok Shop): the tile goes dark so the mark stays legible. The mark itself is never recoloured,
 * which is why this changes the background and nothing else.
 */
@Composable
private fun tileColor(background: BrandBackground): Color = when (background) {
    BrandBackground.LIGHT -> MaterialTheme.colorScheme.surfaceBright
    BrandBackground.DARK -> Color(0xFF111111)
}

/** Matches the web renderer's clamp; a larger optical nudge would overflow the tile's padding. */
private const val MAX_SCALE = 1.15
