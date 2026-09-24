package com.tappyai.app.home

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Smart Tools — the catalogue page (web `/tools`, `ToolsView.tsx` on design/v3-phase4), native.
 *
 *   ←
 *   ┌ frame ──────────────────────────────────┐   `.v3-tools-frame`: one panel, 24dp radius,
 *   │ [▦]  Smart Tools                        │   1dp border, 16dp padding, 32dp between blocks
 *   │      Những công cụ hữu ích, …           │   header: 56dp accent badge, 26sp title, blurb
 *   │ [💡 Làm nhiều hơn cùng TappyAI]         │   the CTA pill (wraps under the title on a phone)
 *   │ [ 🔍 Tìm công cụ… ]                     │   (Android's local search — see below)
 *   │ HẰNG NGÀY ───────────────────────────── │   12.5sp tracked small caps + a hairline
 *   │ ┌ card ────────────────────────────── ┐ │   ONE column on a phone (`grid-cols-1` below
 *   │ └───────────────────────────────────── ┘ │   `sm`), 12dp apart — `SmartToolCard` full size
 *   │ …  KHÁM PHÁ …  GIẢI TRÍ …               │
 *   └─────────────────────────────────────────┘
 *
 * A nested Home-tab screen ([HomeTabRoute.SmartTools]) like Scan or Translate: it draws its own
 * back row (the shell steps aside for nested Home screens — see `ReportNestedScreen`) and the
 * existing bottom navigation stays. The V3 palette follows the system appearance as on Home; the
 * frame is the page's raised panel over the page ground, exactly the web's two surfaces.
 *
 * 🔑 THE REGISTRY IS THE ONLY DATA — [SMART_TOOLS] by [smartToolGroups], in the web's order;
 * every card opens the destination the Home tab already hosts, through [onOpen].
 *
 * 🔑 THE CTA IS THE WEB'S: "Làm nhiều hơn cùng TappyAI" links to Home — the assistant, "the one
 * surface that does more". Here Home is the screen under this one, so the pill pops back to it.
 *
 * 🔑 THE SEARCH IS LOCAL — and Android's own. The web page has no search (no endpoint, no
 * index); this field filters the cards by title and description as you type, UI only,
 * nothing invented behind it. It keeps its place under the header and wears the frame's tokens
 * so it reads as part of the page rather than a foreign control. An empty match says so in place
 * of the groups rather than showing nothing.
 *
 * 🔑 NO "XEM TẤT CẢ" ON THE SECTIONS: every group is already shown in full here, and the web page
 * carries no per-section destination — the hierarchy is kept, the dead action is not drawn.
 */
@Composable
internal fun SmartToolsScreen(
    onBack: () -> Unit,
    onOpen: (SmartToolId) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }

    V3HomeTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(HomeV3.Background)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth()
                    .padding(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                // The shell's quiet page chrome on the web is its top bar; here, the back row.
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.common_back),
                        tint = HomeV3.OnSurface,
                    )
                }

                // ── The frame ──────────────────────────────────────────────────────────
                val frameShape = RoundedCornerShape(24.dp)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(frameShape)
                        .background(HomeV3.Surface)
                        .border(1.dp, HomeV3.Outline, frameShape)
                        .padding(TappySpacing.xl),
                    verticalArrangement = Arrangement.spacedBy(32.dp),
                ) {
                    SmartToolsHeader(onOpenHome = onBack)

                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        placeholder = { Text(stringResource(R.string.smart_tools_search_hint), fontSize = 14.sp) },
                        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.size(20.dp)) },
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = HomeV3.SurfaceVariant,
                            unfocusedContainerColor = HomeV3.SurfaceVariant,
                            focusedBorderColor = HomeV3.Purple,
                            unfocusedBorderColor = HomeV3.Outline,
                            focusedLeadingIconColor = HomeV3.OnSurfaceVariant,
                            unfocusedLeadingIconColor = HomeV3.OnSurfaceVariant,
                            focusedPlaceholderColor = HomeV3.OnSurfaceVariant,
                            unfocusedPlaceholderColor = HomeV3.OnSurfaceVariant,
                            focusedTextColor = HomeV3.OnSurface,
                            unfocusedTextColor = HomeV3.OnSurface,
                            cursorColor = HomeV3.Purple,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    val groups = smartToolGroups(filterSmartTools(SMART_TOOLS, query))
                    if (groups.isEmpty()) {
                        Text(
                            text = stringResource(R.string.smart_tools_search_empty),
                            color = HomeV3.OnSurfaceVariant,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.fillMaxWidth().padding(vertical = TappySpacing.huge),
                        )
                    }
                    groups.forEach { (group, tools) ->
                        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xl)) {
                            SmartToolsGroupHeader(title = stringResource(group.titleRes))
                            SmartToolGrid(tools = tools, onOpen = onOpen, variant = SmartToolCardVariant.Full, columns = 1)
                        }
                    }
                }
            }
        }
    }
}

/**
 * The page's own header, at the size the web reference gives it: the accent grid badge (56dp,
 * 18dp radius, the accent fading to 55 % black), the title reusing the nav's own name, the
 * blurb — then the CTA pill, which on a phone wraps under the title block as it does on the web.
 */
@Composable
private fun SmartToolsHeader(onOpenHome: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xl)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.xl)) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(HomeV3.Purple, Color.Black.copy(alpha = 0.45f).compositeOver(HomeV3.Purple)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.GridView, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.home_v3_smart_tools_title),
                    color = HomeV3.OnSurface,
                    fontSize = 26.sp,
                    lineHeight = 28.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.5).sp,
                )
                Text(
                    text = stringResource(R.string.smart_tools_blurb),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 13.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = TappySpacing.md),
                )
            }
        }
        // The web's `data-tools-cta`: a bordered pill on the elevated panel, an amber bulb tile.
        val pill = RoundedCornerShape(16.dp)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            modifier = Modifier
                .clip(pill)
                .background(HomeV3.SurfaceVariant)
                .border(1.dp, HomeV3.Outline, pill)
                .clickable(onClick = onOpenHome)
                .padding(horizontal = TappySpacing.xl, vertical = 10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(HomeV3.Purple.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Lightbulb, contentDescription = null, tint = HomeV3.BrandSpark, modifier = Modifier.size(16.dp))
            }
            Text(
                text = stringResource(R.string.smart_tools_cta),
                color = HomeV3.OnSurface,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

/**
 * The web group header: `text-[12.5px] font-bold uppercase tracking-[0.14em]`, muted, with the
 * reference's hairline running off the label.
 */
@Composable
internal fun SmartToolsGroupHeader(title: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xl),
    ) {
        Text(
            text = title.uppercase(),
            color = HomeV3.OnSurfaceVariant,
            fontSize = 12.5.sp,
            letterSpacing = 1.75.sp,
            fontWeight = FontWeight.Bold,
        )
        HorizontalDivider(color = HomeV3.Outline, modifier = Modifier.weight(1f))
    }
}

/**
 * The local search: a tool matches when its title or description contains [query], ignoring
 * case; a blank query is every tool. The rule itself is [matchesSmartToolQuery], pure and tested;
 * this wrapper only resolves the strings.
 */
@Composable
private fun filterSmartTools(tools: List<SmartTool>, query: String): List<SmartTool> {
    val q = query.trim()
    if (q.isEmpty()) return tools
    return tools.filter { tool ->
        matchesSmartToolQuery(q, stringResource(tool.titleRes), stringResource(tool.descRes))
    }
}

/** Case-insensitive containment over the title and the description. */
internal fun matchesSmartToolQuery(query: String, title: String, description: String): Boolean {
    val q = query.trim()
    return q.isEmpty() || title.contains(q, ignoreCase = true) || description.contains(q, ignoreCase = true)
}
