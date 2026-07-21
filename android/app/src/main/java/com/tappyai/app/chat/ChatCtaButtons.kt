package com.tappyai.app.chat

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.launch

/** Save/remove-favorite callbacks (backed by the maps favorites API via ChatViewModel). */
typealias OnSaveFavorite = suspend (placeId: String, name: String, address: String, type: String) -> Boolean
typealias OnRemoveFavorite = suspend (placeId: String) -> Boolean

/**
 * Renders the assistant's `[CTA_BUTTONS]` block — the same buttons the web shows under a reply
 * (maps/call/zalo/website/booking/search/internal_booking). Primary buttons are filled, the rest
 * outlined, mirroring the web styling. Each opens its `url`; `internal_booking` uses a relative
 * app path, so it opens against the web app origin (native service-detail nav is a later step), and
 * gets a favorite (heart) toggle beside it — the web's FavoriteToggle.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChatCtaButtons(
    buttons: List<CtaButton>,
    onSaveFavorite: OnSaveFavorite,
    onRemoveFavorite: OnRemoveFavorite,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    FlowRow(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.lg), // web: mt-3 = 12px
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // web: gap-2 = 8px
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        buttons.forEach { button ->
            val place = if (button.ctaType == CtaType.InternalBooking) parsePlaceFromUrl(button.url) else null
            if (place != null && place.placeId.isNotBlank()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CtaChip(button = button, onClick = { openCta(context, button) })
                    FavoriteToggle(place = place, onSave = onSaveFavorite, onRemove = onRemoveFavorite)
                }
            } else {
                CtaChip(button = button, onClick = { openCta(context, button) })
            }
        }
    }
}

/**
 * The web SavePlaceButton — a 🔖 affordance under a reply that saves the first place it mentions to
 * favorites. Hidden when no place name is detectable. Simplified vs the web's inline rename input:
 * it saves the detected name directly (still POST /api/favorites, `manual_…` id, type `saved`).
 */
@Composable
fun SavePlaceButton(text: String, buttons: List<CtaButton>, onSaveFavorite: OnSaveFavorite) {
    val detected = remember(text, buttons) { detectFirstPlaceName(text, buttons) }
    if (detected.isBlank()) return
    var saved by remember(detected) { mutableStateOf(false) }
    var busy by remember(detected) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Row(
        modifier = Modifier
            .padding(top = TappySpacing.xs)
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = !busy && !saved) {
                busy = true
                scope.launch {
                    val ok = onSaveFavorite("manual_" + detected.hashCode().toString(), detected, "", "saved")
                    saved = ok
                    busy = false
                }
            }
            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (saved) {
                "✓ " + stringResource(R.string.chat_save_place_saved)
            } else {
                "🔖 " + stringResource(R.string.chat_save_place)
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun FavoriteToggle(place: CtaPlace, onSave: OnSaveFavorite, onRemove: OnRemoveFavorite) {
    var saved by remember(place.placeId) { mutableStateOf(false) }
    var busy by remember(place.placeId) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Icon(
        imageVector = if (saved) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
        contentDescription = stringResource(if (saved) R.string.chat_save_place_saved else R.string.chat_save_place),
        tint = if (saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .clickable(enabled = !busy) {
                busy = true
                val target = !saved
                saved = target // optimistic
                scope.launch {
                    val ok = if (target) {
                        onSave(place.placeId, place.name, place.address, place.type)
                    } else {
                        onRemove(place.placeId)
                    }
                    if (!ok) saved = !target // revert on failure
                    busy = false
                }
            }
            .padding(6.dp)
            .size(20.dp),
    )
}

@Composable
private fun CtaChip(button: CtaButton, onClick: () -> Unit) {
    // Web: inline-flex px-4 py-2 rounded-xl text-sm font-medium. Primary = filled + shadow-sm
    // shadow-primary-200; secondary = 1px primary border. (radius 12, padding 16/8, font 14/500)
    val shape = RoundedCornerShape(12.dp)
    if (button.primary) {
        val primary = MaterialTheme.colorScheme.primary
        Text(
            text = button.label,
            color = MaterialTheme.colorScheme.onPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .shadow(elevation = 3.dp, shape = shape, spotColor = primary, ambientColor = primary)
                .clip(shape)
                .background(primary)
                .clickable(onClick = onClick)
                .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        )
    } else {
        Text(
            text = button.label,
            color = MaterialTheme.colorScheme.primary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .clip(shape)
                .border(BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)), shape)
                .clickable(onClick = onClick)
                .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        )
    }
}

/** The place an `internal_booking` button points at (parsed from its URL query — web parsePlaceFromUrl). */
private data class CtaPlace(val placeId: String, val name: String, val address: String, val type: String)

private fun parsePlaceFromUrl(url: String): CtaPlace {
    val uri = runCatching { Uri.parse(url) }.getOrNull()
    return CtaPlace(
        placeId = uri?.getQueryParameter("placeId").orEmpty(),
        name = uri?.getQueryParameter("name").orEmpty(),
        address = uri?.getQueryParameter("address").orEmpty(),
        type = uri?.getQueryParameter("type").orEmpty(),
    )
}

/** Mirrors the web detectFirstPlaceName: an internal_booking button's name, else the first bold span. */
private fun detectFirstPlaceName(text: String, buttons: List<CtaButton>): String {
    val booking = buttons.firstOrNull { it.ctaType == CtaType.InternalBooking }
    if (booking != null) {
        val name = runCatching { Uri.parse(booking.url).getQueryParameter("name") }.getOrNull()
        if (!name.isNullOrBlank()) return name
    }
    return Regex("""\*\*([^*]{3,40})\*\*""").find(text)?.groupValues?.getOrNull(1).orEmpty()
}

private fun openCta(context: Context, button: CtaButton) {
    // internal_booking carries a relative app route (e.g. /service/slug?placeId=…). Resolve it
    // against the web origin so it still opens the place page; everything else is already absolute.
    val url = if (button.ctaType == CtaType.InternalBooking && button.url.startsWith("/")) {
        BuildConfig.WEB_APP_URL.trimEnd('/') + button.url
    } else {
        button.url
    }
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}
