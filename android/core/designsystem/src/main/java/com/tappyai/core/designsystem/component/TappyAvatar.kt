package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.core.designsystem.R
import com.tappyai.core.designsystem.theme.TappyAITheme

enum class TappyAvatarSize(val dp: Dp, val fontSp: androidx.compose.ui.unit.TextUnit) {
    Inline(24.dp, 10.sp),
    ListRow(32.dp, 13.sp),
    HeaderUser(40.dp, 16.sp),
    ProfileCard(64.dp, 24.sp),
    ProfileHero(96.dp, 36.sp),
}

/**
 * Circular avatar (docs/UI_GUIDELINES.md §13). Falls back to initials on a tinted background
 * when [imageUrl] is null or fails to load — never an empty/broken image. When [name] is blank
 * (no signed-in user), renders a neutral person icon rather than initials — the honest
 * "not signed in" identity placeholder shared with the Profile header (UI Consistency Baseline
 * v1: never fabricate a "Guest" user).
 */
@Composable
fun TappyAvatar(
    name: String,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    size: TappyAvatarSize = TappyAvatarSize.ListRow,
) {
    val initials = remember(name) { initialsFor(name) }
    // TalkBack reads this, so it is user-facing text and belongs in resources like any other.
    // It used to be two Kotlin literals, which meant a Vietnamese user heard "Huy Phạm's avatar"
    // no matter what language the app was in (V2-UAT-010). Building it with stringResource lets
    // Android's own resource qualifiers resolve it against the app locale, exactly like every
    // visible string — and lets Vietnamese put the possessive the other way round, which a
    // concatenated "$name's avatar" could never express.
    val description =
        if (name.isBlank()) stringResource(R.string.tappy_cd_avatar_generic)
        else stringResource(R.string.tappy_cd_avatar_named, name)

    Box(
        modifier = modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        when {
            imageUrl != null -> TappyImage(
                url = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size.dp).clip(CircleShape),
            )
            name.isBlank() -> Icon(
                imageVector = Icons.Filled.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(size.dp.times(0.6f)),
            )
            else -> Text(
                text = initials,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                fontSize = size.fontSp,
            )
        }
    }
}

private fun initialsFor(name: String): String =
    name.trim()
        .split(Regex("\\s+"))
        .filter { it.isNotEmpty() }
        .take(2)
        .joinToString("") { it.first().uppercaseChar().toString() }
        .ifEmpty { "?" }

@TappyComponentPreviews
@Composable
private fun TappyAvatarPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyAvatar(name = "Huy Phạm", size = TappyAvatarSize.ProfileCard)
    }
}
