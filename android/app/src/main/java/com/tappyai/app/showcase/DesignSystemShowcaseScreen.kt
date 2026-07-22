package com.tappyai.app.showcase

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.core.designsystem.component.TappyAppBar
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyBottomNavBar
import com.tappyai.core.designsystem.component.TappyNavItem
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonSize
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyChatBubble
import com.tappyai.core.designsystem.component.TappyChatRole
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyHotelCard
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyMarkdown
import com.tappyai.core.designsystem.component.TappyRestaurantCard
import com.tappyai.core.designsystem.component.TappySearchBar
import com.tappyai.core.designsystem.component.TappySkeleton
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.component.TappyTravelCard
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyElevation
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.networkmonitor.NetworkStatus

/**
 * Renders every design token category and every component from core:designsystem, in one
 * scrollable screen. This is a Phase 0 visual-verification scaffold, not product UI — see the
 * plan's §4. Feature screens in later phases should look here for real usage examples before
 * inventing new component call patterns.
 */
@Composable
fun DesignSystemShowcaseScreen(
    isDarkTheme: Boolean,
    onToggleDarkTheme: () -> Unit,
) {
    val bottomNavItems = remember {
        listOf(
            TappyNavItem("Home", Icons.Filled.Home),
            TappyNavItem("Chat", Icons.AutoMirrored.Filled.Chat),
            TappyNavItem("Explore", Icons.Filled.Explore),
        )
    }
    var selectedNavIndex by remember { mutableIntStateOf(0) }
    var textFieldValue by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TappyAppBar(
                title = "Design System",
                actions = {
                    Text("Dark", modifier = Modifier.padding(end = TappySpacing.xs))
                    Switch(checked = isDarkTheme, onCheckedChange = { onToggleDarkTheme() })
                },
            )
        },
        bottomBar = {
            TappyBottomNavBar(
                items = bottomNavItems,
                selectedIndex = selectedNavIndex,
                onSelect = { selectedNavIndex = it },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xxxl),
        ) {
            ColorSection()
            TypographySection()
            SpacingSection()
            ShapeSection()
            ElevationSection()
            ButtonSection()
            InputSection(textFieldValue, { textFieldValue = it }, searchQuery, { searchQuery = it })
            AvatarSection()
            StateSection()
            ChatBubbleSection()
            MediaCardSection()
            DiagnosticsSection()
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.headlineSmall)
    HorizontalDivider(modifier = Modifier.padding(top = TappySpacing.xs))
}

@Composable
private fun ColorSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Color")
        val swatches = listOf(
            "Primary" to MaterialTheme.colorScheme.primary,
            "Secondary" to MaterialTheme.colorScheme.secondary,
            "Error" to MaterialTheme.colorScheme.error,
            "Surface" to MaterialTheme.colorScheme.surface,
            "SurfaceVariant" to MaterialTheme.colorScheme.surfaceVariant,
        )
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            swatches.forEach { (label, color) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(TappyShapes.card)
                            .background(color),
                    )
                    Text(label, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun TypographySection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionTitle("Typography")
        Text("Display", style = MaterialTheme.typography.displayLarge)
        Text("H1 / Headline", style = MaterialTheme.typography.headlineLarge)
        Text("H2 / Section", style = MaterialTheme.typography.headlineSmall)
        Text("H3 / Card title", style = MaterialTheme.typography.titleLarge)
        Text("Body large — chat messages, article body", style = MaterialTheme.typography.bodyLarge)
        Text("Body default", style = MaterialTheme.typography.bodyMedium)
        Text("Small — metadata, helper text", style = MaterialTheme.typography.bodySmall)
        Text("CAPTION — LABELS, TIMESTAMPS", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun SpacingSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
        SectionTitle("Spacing")
        val tokens = listOf(
            "xs" to TappySpacing.xs, "sm" to TappySpacing.sm, "md" to TappySpacing.md,
            "lg" to TappySpacing.lg, "xl" to TappySpacing.xl, "xxl" to TappySpacing.xxl,
            "xxxl" to TappySpacing.xxxl, "huge" to TappySpacing.huge,
        )
        tokens.forEach { (label, spacing) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, modifier = Modifier.width(48.dp), style = MaterialTheme.typography.labelSmall)
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .height(12.dp)
                        .width(spacing)
                        .background(MaterialTheme.colorScheme.primary, TappyShapes.chip),
                )
            }
        }
    }
}

@Composable
private fun ShapeSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Shape")
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            listOf(
                "chip" to TappyShapes.chip, "input" to TappyShapes.input,
                "card" to TappyShapes.card, "large" to TappyShapes.large,
            ).forEach { (label, shape) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(shape)
                            .background(MaterialTheme.colorScheme.secondaryContainer),
                    )
                    Text(label, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun ElevationSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Elevation")
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
            listOf("low" to TappyElevation.low, "medium" to TappyElevation.medium, "high" to TappyElevation.high)
                .forEach { (label, elevation) ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        androidx.compose.foundation.layout.Box(
                            modifier = Modifier
                                .size(56.dp)
                                .shadow(elevation, TappyShapes.card, clip = false)
                                .clip(TappyShapes.card)
                                .background(MaterialTheme.colorScheme.surface),
                        )
                        Text(label, style = MaterialTheme.typography.labelSmall)
                    }
                }
        }
    }
}

@Composable
private fun ButtonSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Buttons")
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            TappyButton("Primary", onClick = {}, variant = TappyButtonVariant.Primary)
            TappyButton("Secondary", onClick = {}, variant = TappyButtonVariant.Secondary)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            TappyButton("Ghost", onClick = {}, variant = TappyButtonVariant.Ghost)
            TappyButton("Destructive", onClick = {}, variant = TappyButtonVariant.Destructive)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            TappyButton("Small", onClick = {}, size = TappyButtonSize.Small)
            TappyButton("Base", onClick = {}, size = TappyButtonSize.Base)
            TappyButton("Large", onClick = {}, size = TappyButtonSize.Large)
        }
        TappyButton("Loading…", onClick = {}, loading = true)
        TappyButton("Disabled", onClick = {}, enabled = false)
    }
}

@Composable
private fun InputSection(
    textFieldValue: String,
    onTextFieldValueChange: (String) -> Unit,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Inputs")
        TappyTextField(value = textFieldValue, onValueChange = onTextFieldValueChange, label = "Label")
        TappyTextField(value = "", onValueChange = {}, label = "With error", errorText = "This field is required")
        TappyTextField(value = "Disabled", onValueChange = {}, label = "Disabled", enabled = false)
        TappySearchBar(query = searchQuery, onQueryChange = onSearchQueryChange)
    }
}

@Composable
private fun AvatarSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Avatar")
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.Bottom,
        ) {
            TappyAvatar(name = "Huy Phạm", size = TappyAvatarSize.Inline)
            TappyAvatar(name = "Huy Phạm", size = TappyAvatarSize.ListRow)
            TappyAvatar(name = "Huy Phạm", size = TappyAvatarSize.HeaderUser)
            TappyAvatar(name = "Huy Phạm", size = TappyAvatarSize.ProfileCard)
            TappyAvatar(name = "Huy Phạm", size = TappyAvatarSize.ProfileHero)
        }
    }
}

@Composable
private fun StateSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Loading / Empty / Error")
        TappySkeleton()
        TappySkeleton(modifier = Modifier.fillMaxWidth(0.6f))
        TappyLoadingIndicator()
        TappyEmptyState(
            icon = Icons.Filled.SearchOff,
            title = "No results yet",
            message = "Try a different search term.",
        )
        TappyErrorState(
            title = "Something went wrong",
            message = "Check your connection and try again.",
            onRetry = {},
        )
    }
}

@Composable
private fun ChatBubbleSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionTitle("Chat Bubble")
        TappyChatBubble(role = TappyChatRole.User) {
            Text("Quán phở nào ngon gần đây?")
        }
        TappyChatBubble(role = TappyChatRole.Assistant) {
            TappyMarkdown("Gợi ý cho bạn vài **quán phở** được đánh giá cao gần vị trí hiện tại…")
        }
    }
}

@Composable
private fun MediaCardSection() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Media Cards")
        Column(
            modifier = Modifier.widthIn(max = 320.dp),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            TappyRestaurantCard(
                imageUrl = null,
                name = "Phở Hòa",
                cuisineOrArea = "Phở · Bình Thạnh",
                ratingText = "4.6",
                priceLevel = "$$",
            )
            TappyHotelCard(
                imageUrl = null,
                name = "Ocean View Hotel",
                location = "Đà Nẵng",
                ratingText = "4.8",
                pricePerNight = "1.200.000₫/đêm",
            )
            TappyTravelCard(
                imageUrl = null,
                destination = "Đà Lạt 3N2Đ",
                dateRangeOrDuration = "3 ngày 2 đêm",
                tagText = "Núi rừng",
                priceText = "Từ 2.500.000₫",
            )
        }
    }
}

/**
 * Phase 1A verification aid, not product UI — proves the Hilt graph resolves the four
 * Phase 0.5 provider interfaces end-to-end via [DiagnosticsViewModel]. Not business logic:
 * no feature reads this screen's output, it exists purely so a real signal exists that DI
 * wiring works, since this environment has no device/emulator to check it any other way.
 *
 * Guarded by [LocalInspectionMode]: `hiltViewModel()` has no Hilt-enabled owner to resolve
 * against inside Compose Preview's layoutlib environment, so this renders static placeholder
 * content instead of touching Hilt/`ConnectivityManager` when running inside a preview tool
 * rather than a real device — same reasoning as the Phase 0.5 guard this replaces.
 */
@Composable
private fun DiagnosticsSection() {
    if (LocalInspectionMode.current) {
        DiagnosticsSectionContent(
            networkStatus = NetworkStatus.Online,
            featureFlagEnabled = true,
            onLogTest = {},
            onTrackTest = {},
        )
        return
    }

    val viewModel: DiagnosticsViewModel = hiltViewModel()
    val networkStatus by viewModel.networkStatus.collectAsStateWithLifecycle()

    DiagnosticsSectionContent(
        networkStatus = networkStatus,
        featureFlagEnabled = viewModel.featureFlags.isEnabled("phase1a_diagnostics", default = true),
        onLogTest = { viewModel.logger.d("Diagnostics", "Test log message from showcase") },
        onTrackTest = { viewModel.analytics.track("diagnostics_test_event", mapOf("source" to "showcase")) },
    )
}

@Composable
private fun DiagnosticsSectionContent(
    networkStatus: NetworkStatus,
    featureFlagEnabled: Boolean,
    onLogTest: () -> Unit,
    onTrackTest: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionTitle("Diagnostics")
        Text(
            text = "Network status: ${networkStatus::class.simpleName}",
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            text = "Feature flag 'phase1a_diagnostics': $featureFlagEnabled",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            TappyButton(
                text = "Log test message",
                onClick = onLogTest,
                size = TappyButtonSize.Small,
            )
            TappyButton(
                text = "Track test event",
                onClick = onTrackTest,
                size = TappyButtonSize.Small,
                variant = TappyButtonVariant.Secondary,
            )
        }
    }
}

@Preview(name = "Light", showBackground = true)
@Composable
private fun DesignSystemShowcaseLightPreview() {
    TappyAITheme(darkTheme = false, dynamicColor = false) {
        DesignSystemShowcaseScreen(isDarkTheme = false, onToggleDarkTheme = {})
    }
}

@Preview(name = "Dark", showBackground = true, uiMode = 0x20)
@Composable
private fun DesignSystemShowcaseDarkPreview() {
    TappyAITheme(darkTheme = true, dynamicColor = false) {
        DesignSystemShowcaseScreen(isDarkTheme = true, onToggleDarkTheme = {})
    }
}

@Preview(name = "Large font scale (200%)", showBackground = true, fontScale = 2f)
@Composable
private fun DesignSystemShowcaseLargeFontPreview() {
    TappyAITheme(darkTheme = false, dynamicColor = false) {
        DesignSystemShowcaseScreen(isDarkTheme = false, onToggleDarkTheme = {})
    }
}

@Preview(name = "Expanded width (tablet/ChromeOS)", showBackground = true, widthDp = 900, heightDp = 700)
@Composable
private fun DesignSystemShowcaseExpandedWidthPreview() {
    TappyAITheme(darkTheme = false, dynamicColor = false) {
        DesignSystemShowcaseScreen(isDarkTheme = false, onToggleDarkTheme = {})
    }
}
