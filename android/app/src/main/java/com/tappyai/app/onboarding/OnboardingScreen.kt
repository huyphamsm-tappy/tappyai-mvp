package com.tappyai.app.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.theme.TappyContainers

/**
 * Onboarding wizard — the web `/onboarding` (owner redesign 2026-09-11): the dark TappyAI
 * composition shared by BOTH steps (so the flow never flashes from dark to white), a header with
 * the brand mark, a 2-segment progress bar with the real step counter ("Bước 1/2", owner
 * 2026-09-28), then the interests multi-select (step 1: glass tiles with a per-interest tint, a
 * one-line description and a check once chosen) or the city single-select + free-text field
 * (step 2), each with a Skip that advances/finishes without a gate. At phone width the web shows
 * the otter small and centred above the content — so does this.
 *
 * PRESENTATION ONLY — behaviour is unchanged: the catalog comes from `GET api/config`; on finish
 * it posts `{ interests, city }` and calls [onFinished] to leave for the app — the same "navigate
 * on completion regardless of the request" the web has.
 *
 * Shown once, right after a fresh login when the user isn't yet onboarded (see the post-login gate
 * in `AppNavHost`); a returning, already-onboarded session goes straight to the shell.
 */
@Composable
fun OnboardingScreen(
    onFinished: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                OnboardingEvent.Finished -> onFinished()
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Ob.Ground)
            .background(Brush.radialGradient(listOf(Color(0x401D4ED8), Color.Transparent), radius = 900f, center = androidx.compose.ui.geometry.Offset(0f, 0f)))
            .background(Brush.radialGradient(listOf(Color(0x406D28D9), Color.Transparent), radius = 900f, center = androidx.compose.ui.geometry.Offset(1400f, 900f))),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Header()
            Spacer(Modifier.height(16.dp))
            ProgressBar(step = viewModel.step)

            when (val state = viewModel.catalogState) {
                is UiState.Loading, UiState.Idle -> Box(
                    modifier = Modifier.fillMaxWidth().padding(48.dp),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator(color = Ob.Blue) }

                is UiState.Error, UiState.Empty -> Box(Modifier.padding(top = 24.dp)) {
                    TappyErrorState(
                        title = stringResource(R.string.onboarding_error_title),
                        message = stringResource(R.string.onboarding_error_message),
                        onRetry = viewModel::retry,
                    )
                }

                is UiState.Success -> {
                    val catalog = state.data
                    if (viewModel.step == 1) {
                        InterestsStep(
                            interests = catalog.interests,
                            selected = viewModel.selectedInterests,
                            onToggle = viewModel::toggleInterest,
                            onNext = viewModel::goToLocationStep,
                        )
                    } else {
                        LocationStep(
                            cities = catalog.cities,
                            city = viewModel.city,
                            isSubmitting = viewModel.isSubmitting,
                            onCityChange = viewModel::onCityChange,
                            onFinish = viewModel::finish,
                        )
                    }
                }
            }
        }
    }
}

/** The web's palette for this page (`bg-[#070B18]`, white/alpha text, blue-400 accent). */
private object Ob {
    val Ground = Color(0xFF070B18)
    val Text = Color.White
    val Muted = Color.White.copy(alpha = 0.60f)
    val Faint = Color.White.copy(alpha = 0.40f)
    val Blue = Color(0xFF60A5FA)
    val Glass = Color.White.copy(alpha = 0.04f)
    val GlassBorder = Color.White.copy(alpha = 0.10f)
    val OnBorder = Color(0x9960A5FA)
    val OnFill = Color(0x1A3B82F6)
    val Cta = Brush.horizontalGradient(listOf(Color(0xFF2563EB), Color(0xFF3B82F6)))
    val CtaFinish = Brush.horizontalGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)))
    val Segment = Brush.horizontalGradient(listOf(Color(0xFF3B82F6), Color(0xFF38BDF8)))
}

/** Per-interest tint (web `INTEREST_TINT`), keyed by the stable interest id. */
private fun tintOf(id: String): Color = when (id) {
    "food" -> Color(0xFFF97316)
    "spa" -> Color(0xFFEC4899)
    "travel" -> Color(0xFF0EA5E9)
    "shopping" -> Color(0xFFF59E0B)
    "entertainment" -> Color(0xFF8B5CF6)
    "hotel" -> Color(0xFF06B6D4)
    else -> Color.White
}

@Composable
private fun Header() {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(
            painter = painterResource(R.drawable.share_otter_mark),
            contentDescription = null,
            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(16.dp)),
        )
        Text(text = "TappyAI", color = Ob.Text, fontSize = 18.sp, fontWeight = FontWeight.Black)
    }
}

/** Owner 2026-09-28 (web `/onboarding`): the counter shows the steps this wizard really has — 1/2, 2/2. */
internal const val ONBOARDING_TOTAL_STEPS = 2

@Composable
private fun ProgressBar(step: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 448.dp).fillMaxWidth()) {
        StepSegments(step)
        Text(
            text = stringResource(R.string.onboarding_step_counter, step, ONBOARDING_TOTAL_STEPS),
            color = Color.White.copy(alpha = 0.55f),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 12.dp).testTag("onboarding_step_counter"),
        )
    }
}

@Composable
private fun StepSegments(step: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        (1..ONBOARDING_TOTAL_STEPS).forEach { s ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(6.dp)
                    .clip(CircleShape)
                    .then(if (s <= step) Modifier.background(Ob.Segment) else Modifier.background(Color.White.copy(alpha = 0.10f))),
            )
        }
    }
}

/** The compact otter the web shows below `lg`, small and centred above the content. */
@Composable
private fun Mascot() {
    Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(top = 20.dp)) {
        Box(Modifier.size(112.dp).background(Brush.radialGradient(listOf(Color(0x403B82F6), Color.Transparent)), CircleShape))
        Image(painter = painterResource(R.drawable.share_otter_mascot), contentDescription = null, modifier = Modifier.width(110.dp).heightIn(max = 150.dp))
    }
}

@Composable
private fun InterestsStep(
    interests: List<OnboardingInterest>,
    selected: Set<String>,
    onToggle: (String) -> Unit,
    onNext: () -> Unit,
) {
    Text(
        text = buildAnnotatedString {
            append(stringResource(R.string.onboarding_welcome_title_lead))
            withStyle(SpanStyle(color = Ob.Blue)) { append(stringResource(R.string.onboarding_welcome_title_accent)) }
            append(" 👋")
        },
        color = Ob.Text,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        fontWeight = FontWeight.Black,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = 24.dp),
    )
    Text(
        text = stringResource(R.string.onboarding_welcome_desc),
        color = Ob.Muted,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = 10.dp),
    )
    Mascot()
    Spacer(Modifier.height(24.dp))

    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        interests.forEach { interest ->
            InterestTile(interest = interest, on = interest.id in selected, onClick = { onToggle(interest.id) })
        }
    }

    Spacer(Modifier.height(28.dp))
    CtaButton(
        text = stringResource(R.string.common_next),
        brush = Ob.Cta,
        enabled = selected.isNotEmpty(),
        trailingArrow = true,
        onClick = onNext,
    )
    SkipButton(onClick = onNext)
}

@Composable
private fun InterestTile(interest: OnboardingInterest, on: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    val tint = tintOf(interest.id)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (on) Ob.OnFill else Ob.Glass)
            .border(1.dp, if (on) Ob.OnBorder else Ob.GlassBorder, shape)
            .clickable(role = Role.Checkbox, onClick = onClick)
            .semantics { selected = on }
            .testTag("onboarding_interest_${interest.id}")
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(shape)
                .background(Brush.linearGradient(listOf(tint.copy(alpha = 0.25f), tint.copy(alpha = 0.10f))))
                .border(1.dp, Ob.GlassBorder, shape),
            contentAlignment = Alignment.Center,
        ) { Text(text = interest.emoji, fontSize = 28.sp) }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = stringResource(interest.labelRes), color = Ob.Text, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            interestDescResFor(interest.id)?.let {
                Text(text = stringResource(it), color = Ob.Muted, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
            }
        }
        // The design's chevron at rest; a filled check once chosen, so selection is not colour alone.
        if (on) {
            Box(
                modifier = Modifier.size(24.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)))),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp)) }
        } else {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Ob.Muted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun LocationStep(
    cities: List<String>,
    city: String,
    isSubmitting: Boolean,
    onCityChange: (String) -> Unit,
    onFinish: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) {
        Text(text = stringResource(R.string.onboarding_location_title), color = Ob.Text, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Black)
        Text(
            text = stringResource(R.string.onboarding_location_desc),
            color = Color.White.copy(alpha = 0.55f),
            fontSize = 15.sp,
            lineHeight = 22.sp,
            modifier = Modifier.padding(top = 10.dp),
        )
        Spacer(Modifier.height(24.dp))

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            cities.chunked(2).forEach { rowItems ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    rowItems.forEach { c -> CityTile(name = c, on = city == c, onClick = { onCityChange(c) }, modifier = Modifier.weight(1f)) }
                    // Keep a lone last item at half width, matching the 2-col grid.
                    if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }

        // Matches the web: the field shows blank when a catalog chip is chosen, and holds free text
        // otherwise — so typing here is what "other city" means.
        val shape = RoundedCornerShape(16.dp)
        val value = if (city in cities) "" else city
        BasicTextField(
            value = value,
            onValueChange = onCityChange,
            singleLine = true,
            textStyle = TextStyle(color = Ob.Text, fontSize = 14.sp),
            cursorBrush = SolidColor(Ob.Blue),
            modifier = Modifier
                .padding(top = 16.dp)
                .fillMaxWidth()
                .clip(shape)
                .background(Color.White.copy(alpha = 0.05f))
                .border(1.dp, Ob.GlassBorder, shape)
                .testTag("onboarding_other_city")
                .padding(horizontal = 16.dp, vertical = 14.dp),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) Text(text = stringResource(R.string.onboarding_other_city), color = Color.White.copy(alpha = 0.30f), fontSize = 14.sp)
                    inner()
                }
            },
        )
    }

    Spacer(Modifier.height(28.dp))
    CtaButton(text = stringResource(R.string.onboarding_start), brush = Ob.CtaFinish, enabled = !isSubmitting, loading = isSubmitting, onClick = onFinish)
    SkipButton(onClick = onFinish)
}

@Composable
private fun CityTile(name: String, on: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = modifier
            .clip(shape)
            .background(if (on) Ob.OnFill else Ob.Glass)
            .border(1.dp, if (on) Ob.OnBorder else Ob.GlassBorder, shape)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .semantics { selected = on }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = if (on) Color(0xFF93C5FD) else Ob.Faint, modifier = Modifier.size(15.dp))
        Text(text = name, color = if (on) Ob.Text else Color.White.copy(alpha = 0.85f), fontSize = 14.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun CtaButton(
    text: String,
    brush: Brush,
    enabled: Boolean,
    onClick: () -> Unit,
    loading: Boolean = false,
    trailingArrow: Boolean = false,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = Modifier
            .widthIn(max = 512.dp)
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .alpha(if (enabled || loading) 1f else 0.4f)
            .clip(shape)
            .background(brush)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        } else {
            Text(text = text, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            if (trailingArrow) Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.padding(start = 8.dp).size(20.dp))
        }
    }
}

@Composable
private fun SkipButton(onClick: () -> Unit) {
    Text(
        text = stringResource(R.string.common_skip),
        color = Ob.Faint,
        fontSize = 14.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(12.dp),
    )
}
