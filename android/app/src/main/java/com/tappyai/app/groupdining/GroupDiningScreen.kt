package com.tappyai.app.groupdining

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolBubble
import com.tappyai.app.tools.ToolCta
import com.tappyai.app.tools.ToolError
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolOrbit
import com.tappyai.app.tools.ToolSegment
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Group Dining — **create** screen, matching the web `/group/new` (design/v3-phase4
 * `GroupNewForm`): the blue hero ("Đi đâu ăn gì cả team?", the thinking pose, plate + orbit +
 * two member bubbles), then the single `.v3-group-card` — Users tile, form title/subtitle, the
 * group-name field and the 60dp CTA.
 *
 * Behaviour is unchanged: one group-name input, a submit that calls `POST /api/group`, then the
 * hand-off to the group's detail page (creator view) via the app navigator. Reached from Smart
 * Tools → "Nhóm ăn" and Profile → "Group dining". The real group (share link, members, AI
 * suggestion) lives on [GroupDetailScreen].
 */
@Composable
fun GroupDiningScreen(
    onBack: () -> Unit,
    viewModel: GroupDiningViewModel = hiltViewModel(),
) {
    ToolV3Page(onBack = onBack) {
        ToolHero(
            hue = ToolHue.Blue,
            eyebrow = stringResource(R.string.tool_group_eyebrow),
            title1 = stringResource(R.string.tool_group_title1),
            title2 = stringResource(R.string.tool_group_title2),
            body = stringResource(R.string.tool_group_body),
            mascotRes = R.drawable.tappy_thinking,
            scene = { GroupScene(bubble = stringResource(R.string.tool_group_bubble)) },
        )

        // The three feature tiles (`.v3-group-feat`): what the group flow does, nothing more.
        GroupFeatures()

        CreateGroupCard(
            groupName = viewModel.groupName,
            onGroupNameChange = viewModel::onGroupNameChange,
            onCreateGroup = viewModel::createGroup,
            isCreating = viewModel.isCreating,
            errorMessage = viewModel.errorMessage,
        )
    }
}

/** The hero scene: an orbit ring, a plate disc and two "member" bubbles, as on the web. */
@Composable
private fun BoxScope.GroupScene(bubble: String) {
    ToolOrbit(size = 220.dp, alignment = Alignment.Center, color = Color(0x4793C5FD), modifier = Modifier.offset(y = 6.dp))
    GroupOrb(icon = Icons.Filled.Restaurant, a = Color(0xFF0EA5E9), b = Color(0xFF2F6BFF), alignment = Alignment.TopStart, modifier = Modifier.offset(x = 12.dp, y = 4.dp))
    GroupOrb(icon = Icons.Filled.Place, a = Color(0xFFF43F5E), b = Color(0xFFFB7185), alignment = Alignment.TopStart, modifier = Modifier.offset(x = 66.dp, y = 30.dp))
    GroupOrb(icon = Icons.Filled.Group, a = Color(0xFF06B6D4), b = Color(0xFF22D3EE), alignment = Alignment.CenterEnd, modifier = Modifier.offset(x = (-4).dp, y = 8.dp))
    Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color(0xFFFDE68A), modifier = Modifier.align(Alignment.CenterStart).offset(x = 4.dp, y = 30.dp).size(20.dp))
    Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color(0xFFFDE68A), modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-2).dp, y = 60.dp).size(16.dp))
    ToolBubble(text = bubble, a = Color(0xFF0EA5E9), b = Color(0xFF2F6BFF), alignment = Alignment.TopEnd, modifier = Modifier.offset(x = (-4).dp, y = (-6).dp))
}

/** One floating orb (`.v3-group-orb`): a 44dp gradient disc with a 20dp glyph. */
@Composable
private fun BoxScope.GroupOrb(icon: ImageVector, a: Color, b: Color, alignment: Alignment, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .align(alignment)
            .size(44.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(a, b))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
    }
}

private val GROUP_PRESETS = listOf(
    R.string.tool_group_preset1, R.string.tool_group_preset2, R.string.tool_group_preset3,
    R.string.tool_group_preset4, R.string.tool_group_preset5,
)

private class GroupFeature(val icon: ImageVector, val tint: Color, val titleRes: Int, val descRes: Int)

private val GROUP_FEATURES = listOf(
    GroupFeature(Icons.Filled.Checklist, Color(0xFF60A5FA), R.string.tool_group_feat_plan, R.string.tool_group_feat_plan_desc),
    GroupFeature(Icons.Filled.Link, Color(0xFF22D3EE), R.string.tool_group_feat_share, R.string.tool_group_feat_share_desc),
    GroupFeature(Icons.Filled.AutoAwesome, Color(0xFFFB923C), R.string.tool_group_feat_suggest, R.string.tool_group_feat_suggest_desc),
)

/** The three tiles under the hero: icon disc, bold title, one-line description. */
@Composable
private fun GroupFeatures() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        GROUP_FEATURES.forEach { f ->
            val shape = RoundedCornerShape(16.dp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(HomeV3.Surface)
                    .border(1.dp, HomeV3.Outline, shape)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(f.tint.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(f.icon, contentDescription = null, tint = f.tint, modifier = Modifier.size(17.dp))
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = stringResource(f.titleRes), color = HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                    Text(text = stringResource(f.descRes), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
        }
    }
}

/** The create card (`.v3-group-card`): Users tile + title/subtitle, the name field, the CTA. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CreateGroupCard(
    groupName: String,
    onGroupNameChange: (String) -> Unit,
    onCreateGroup: () -> Unit,
    isCreating: Boolean,
    errorMessage: String?,
) {
    val shape = RoundedCornerShape(24.dp)
    Column(
        modifier = Modifier
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, shape)
            .padding(TappySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF0EA5E9), Color(0xFF2F6BFF)))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Group, contentDescription = null, tint = Color.White, modifier = Modifier.size(26.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = stringResource(R.string.tool_group_form_title),
                    color = HomeV3.OnSurface,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.tool_group_form_subtitle),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Text(
                text = stringResource(R.string.groupdining_name_label),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.6.sp,
            )
            ToolTextField(
                value = groupName,
                onValueChange = onGroupNameChange,
                placeholder = stringResource(R.string.groupdining_name_placeholder),
                enabled = !isCreating,
                leadingIcon = { Icon(Icons.Filled.Group, contentDescription = null, tint = HomeV3.OnSurfaceVariant) },
                trailingIcon = {
                    val full = groupName.length >= GroupDiningViewModel.MAX_NAME
                    Text(
                        text = stringResource(R.string.tool_group_counter, groupName.length, GroupDiningViewModel.MAX_NAME),
                        color = if (full) Color(0xFFFB923C) else HomeV3.OnSurfaceVariant,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(end = 4.dp),
                    )
                },
            )
        }

        // Static quick picks (`.v3-group-pick`): shortcuts that fill the field. Not generated.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(
                modifier = Modifier.heightIn(min = 36.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Filled.GridView, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
                Text(text = stringResource(R.string.tool_group_quick_label), color = HomeV3.OnSurfaceVariant, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            }
            GROUP_PRESETS.forEach { res ->
                val label = stringResource(res)
                ToolSegment(text = label, selected = groupName == label, onClick = { onGroupNameChange(label) }, minHeight = 36.dp)
            }
        }

        errorMessage?.let { ToolError(it) }

        ToolCta(
            text = stringResource(R.string.groupdining_create_button),
            hue = ToolHue.Blue,
            icon = Icons.Filled.Group,
            onClick = onCreateGroup,
            enabled = groupName.isNotBlank(),
            loading = isCreating,
        )
    }
}
