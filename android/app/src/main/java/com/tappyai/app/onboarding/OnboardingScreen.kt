package com.tappyai.app.onboarding

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Onboarding wizard — mirrors the web `/onboarding`: a 2-segment progress bar, an interests
 * multi-select (step 1) and a city single-select + free-text field (step 2), each with a Skip that
 * advances/finishes without a gate. The catalog (interests + cities) comes from `GET api/config`.
 * On finish it posts `{ interests, city }` and calls [onFinished] to leave for the app — the same
 * "navigate on completion regardless of the request" behavior the web has.
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

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(TappySpacing.xl),
        ) {
            ProgressBar(step = viewModel.step)
            Spacer(Modifier.height(TappySpacing.xl))

            when (val state = viewModel.catalogState) {
                is UiState.Loading, UiState.Idle -> Box(
                    modifier = Modifier.fillMaxWidth().padding(TappySpacing.xxxl),
                    contentAlignment = Alignment.Center,
                ) { TappyLoadingIndicator() }

                is UiState.Error, UiState.Empty -> TappyErrorState(
                    title = stringResource(R.string.onboarding_error_title),
                    message = stringResource(R.string.onboarding_error_message),
                    onRetry = viewModel::retry,
                )

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

@Composable
private fun ProgressBar(step: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs), modifier = Modifier.fillMaxWidth()) {
        (1..2).forEach { s ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(
                        if (s <= step) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceVariant,
                    ),
            )
        }
    }
}

@Composable
private fun InterestsStep(
    interests: List<OnboardingInterest>,
    selected: Set<String>,
    onToggle: (String) -> Unit,
    onNext: () -> Unit,
) {
    StepHeader(
        title = stringResource(R.string.onboarding_welcome_title),
        description = stringResource(R.string.onboarding_welcome_desc),
    )
    Spacer(Modifier.height(TappySpacing.lg))

    interests.chunked(2).forEach { rowItems ->
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = TappySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            rowItems.forEach { interest ->
                SelectableCard(
                    selected = interest.id in selected,
                    onClick = { onToggle(interest.id) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(text = interest.emoji, fontSize = 22.sp)
                    Text(
                        text = stringResource(interest.labelRes),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            // Keep a lone last item at half width, matching the 2-col grid.
            if (rowItems.size == 1) Spacer(Modifier.weight(1f))
        }
    }

    Spacer(Modifier.height(TappySpacing.md))
    TappyButton(
        text = stringResource(R.string.common_next),
        onClick = onNext,
        enabled = selected.isNotEmpty(),
        modifier = Modifier.fillMaxWidth(),
    )
    SkipButton(onClick = onNext)
}

@Composable
private fun LocationStep(
    cities: List<String>,
    city: String,
    isSubmitting: Boolean,
    onCityChange: (String) -> Unit,
    onFinish: () -> Unit,
) {
    StepHeader(
        title = stringResource(R.string.onboarding_location_title),
        description = stringResource(R.string.onboarding_location_desc),
    )
    Spacer(Modifier.height(TappySpacing.lg))

    cities.chunked(2).forEach { rowItems ->
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = TappySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            rowItems.forEach { c ->
                SelectableCard(
                    selected = city == c,
                    onClick = { onCityChange(c) },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        Icons.Filled.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.height(16.dp),
                        tint = if (city == c) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(text = c, style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (rowItems.size == 1) Spacer(Modifier.weight(1f))
        }
    }

    Spacer(Modifier.height(TappySpacing.xs))
    TappyTextField(
        // Matches the web: the field shows blank when a catalog chip is chosen, and holds free text
        // otherwise — so typing here is what "other city" means.
        value = if (city in cities) "" else city,
        onValueChange = onCityChange,
        placeholder = stringResource(R.string.onboarding_other_city),
        modifier = Modifier.fillMaxWidth(),
    )

    Spacer(Modifier.height(TappySpacing.lg))
    TappyButton(
        text = stringResource(R.string.onboarding_start),
        onClick = onFinish,
        loading = isSubmitting,
        modifier = Modifier.fillMaxWidth(),
    )
    SkipButton(onClick = onFinish)
}

@Composable
private fun StepHeader(title: String, description: String) {
    Text(text = title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(TappySpacing.xs))
    Text(
        text = description,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun SelectableCard(
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Row(
        modifier = modifier
            .clip(TappyShapes.card)
            .background(
                if (selected) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            )
            .border(
                width = 2.dp,
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                shape = TappyShapes.card,
            )
            .clickable(onClick = onClick)
            .padding(TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        content()
    }
}

@Composable
private fun SkipButton(onClick: () -> Unit) {
    Text(
        text = stringResource(R.string.common_skip),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(TappySpacing.md),
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
    )
}
