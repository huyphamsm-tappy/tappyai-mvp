package com.tappyai.features.auth.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.core.common.UiState
import com.tappyai.features.auth.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

// Public terms/privacy pages (opened in the browser; the in-app Terms/Privacy screens live behind
// the post-auth Profile graph, unreachable from this pre-auth screen).
private const val TERMS_URL = "https://www.tappyai.com/terms"
private const val PRIVACY_URL = "https://www.tappyai.com/privacy"

// Feature bullets — the four "tags" from the web login's left column, in the same order (chat,
// explore, privacy, always-on). Emoji stand in for the web's lucide icons (the auth module has no
// icon pack); these are feature glyphs, not mascot art — the mascot hero above now uses the
// official /tappy/welcome.png artwork.
// tint = the feature's accent colour (web login uses violet / rose / emerald / amber tinted icon
// tiles). Applied at low alpha as the tile background so it reads as a subtle tint in both light
// and dark themes (web has per-theme tint variants; the alpha approach is theme-safe here).
private data class LoginFeature(val emoji: String, val titleRes: Int, val descRes: Int, val tint: Color)

private val LOGIN_FEATURES = listOf(
    LoginFeature("💬", R.string.auth_feature_1_title, R.string.auth_feature_1_desc, Color(0xFF7C3AED)),
    LoginFeature("🧭", R.string.auth_feature_2_title, R.string.auth_feature_2_desc, Color(0xFFE11D48)),
    LoginFeature("🔒", R.string.auth_feature_3_title, R.string.auth_feature_3_desc, Color(0xFF059669)),
    LoginFeature("⭐", R.string.auth_feature_4_title, R.string.auth_feature_4_desc, Color(0xFFD97706)),
)

@Composable
fun LoginScreen(
    /** "Tạo tài khoản" — the web /register page on this build's own web origin. */
    onCreateAccount: () -> Unit = {},
    /** Pops back to the app; false when Login is the only destination (cold start, no session). */
    popBack: () -> Boolean = { false },
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val onContinueAsGuest = { viewModel.onContinueAsGuest(popBack) }
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val isLoading = uiState is UiState.Loading

    // The screen paints its own theme background and content colour. Before 2026-09-28 it had
    // neither, so in dark mode the page stayed light and every Text without an explicit colour
    // (the card title, the wordmark, the feature titles) rendered black on the dark card.
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground,
    ) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.compact)
                .padding(TappySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xxl),
        ) {
            // ─── Mascot hero (P1-5) ──────────────────────────────────────────────────────
            // The official Tappy mascot in its "welcome" pose — the same artwork and the same
            // position the web login uses (`/tappy/welcome.png`, canonical pose #01 "onboarding /
            // welcome hero"). Rendered at the 160dp the parity note specified.
            // ─────────────────────────────────────────────────────────────────────────────
            Image(
                painter = painterResource(R.drawable.tappy_welcome),
                contentDescription = null,
                modifier = Modifier.size(160.dp),
            )

            // Brand + tagline (web login's welcome/hero copy).
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                Text(
                    text = stringResource(R.string.auth_welcome_to),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                // Brand wordmark with the web's violet ✦ accent (web: "tappyai✦").
                Text(
                    text = buildAnnotatedString {
                        append(stringResource(R.string.auth_brand_name))
                        withStyle(SpanStyle(color = Color(0xFFA78BFA))) { append(" ✦") }
                    },
                    style = MaterialTheme.typography.displaySmall,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.auth_tagline),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.auth_personal_agent),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            // Feature bullets ("tags").
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                LOGIN_FEATURES.forEach { feature ->
                    LoginFeatureRow(
                        emoji = feature.emoji,
                        title = stringResource(feature.titleRes),
                        description = stringResource(feature.descRes),
                        tint = feature.tint,
                    )
                }
            }

            // Sign-in card.
            TappyCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
                ) {
                    Text(
                        text = stringResource(R.string.auth_signin_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = stringResource(R.string.auth_signin_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )

                    // MVP login methods: Google + Zalo. Facebook and Email are intentionally hidden
                    // from the UI (their ViewModel/AuthRepository implementations are retained for
                    // future use; email sign-in below is the web card's email + password form).
                    // Web parity intent: both providers read as EQUAL-WEIGHT options rather than a
                    // primary and a fallback. The web draws them white with a border; the shared
                    // TappyButton has no outlined variant and adding one to a component used across
                    // the whole app for a single screen is not worth it, so both use the tonal
                    // Secondary. What matters — neither provider is presented as the lesser one — is
                    // kept; main previously had Google solid and Zalo tonal.
                    TappyButton(
                        text = stringResource(R.string.auth_continue_with_google),
                        onClick = { viewModel.onGoogleSignInClick(context) },
                        modifier = Modifier.fillMaxWidth(),
                        variant = TappyButtonVariant.Secondary,
                        enabled = !isLoading,
                        // The brand marks the web /login buttons draw: the four-colour "G"…
                        leadingIcon = {
                            Image(painter = painterResource(R.drawable.ic_brand_google), contentDescription = null, modifier = Modifier.size(20.dp))
                        },
                    )
                    TappyButton(
                        text = stringResource(R.string.auth_continue_with_zalo),
                        onClick = { viewModel.onZaloSignInClick(context) },
                        modifier = Modifier.fillMaxWidth(),
                        variant = TappyButtonVariant.Secondary,
                        enabled = !isLoading,
                        // …and Zalo's blue tile with the wordmark (web: 24px, #0068FF, 10px black).
                        leadingIcon = { ZaloMark() },
                    )
                    // Web /login card, 2026-09-28 parity: "hoặc", Email + Mật khẩu + "Đăng nhập",
                    // "Tạo tài khoản", then "Tiếp tục với tư cách Khách" — in that order. (The old
                    // hidden magic-link form and the debug-only guest button are gone; the magic-link
                    // repository path stays for EmailOtpVerification.)
                    Text(
                        text = stringResource(R.string.auth_or_divider),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TappyTextField(
                        value = viewModel.email,
                        onValueChange = viewModel::onEmailChange,
                        label = stringResource(R.string.auth_email_label),
                        placeholder = stringResource(R.string.auth_email_placeholder),
                        enabled = !isLoading,
                        keyboardType = KeyboardType.Email,
                        modifier = Modifier.testTag("auth-email"),
                    )
                    TappyTextField(
                        value = viewModel.password,
                        onValueChange = viewModel::onPasswordChange,
                        label = stringResource(R.string.auth_password_label),
                        placeholder = stringResource(R.string.auth_password_placeholder),
                        enabled = !isLoading,
                        keyboardType = KeyboardType.Password,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.testTag("auth-password"),
                    )
                    TappyButton(
                        text = stringResource(R.string.auth_password_submit),
                        onClick = viewModel::onPasswordSignInClick,
                        modifier = Modifier.fillMaxWidth().testTag("auth-password-submit"),
                        variant = TappyButtonVariant.Primary,
                        enabled = !isLoading && viewModel.email.isNotBlank() && viewModel.password.isNotEmpty(),
                    )
                    Text(
                        text = stringResource(R.string.auth_create_account),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable(onClick = onCreateAccount),
                    )
                    TappyButton(
                        text = stringResource(R.string.auth_continue_guest),
                        onClick = onContinueAsGuest,
                        modifier = Modifier.fillMaxWidth().testTag("auth-guest"),
                        variant = TappyButtonVariant.Secondary,
                        enabled = !isLoading,
                    )

                    // Trust line.
                    Text(
                        text = "🛡 " + stringResource(R.string.auth_trust_line),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )

                    // Terms / Privacy.
                    Text(
                        text = stringResource(R.string.auth_agree_prefix),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = stringResource(R.string.auth_terms),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { uriHandler.openUri(TERMS_URL) },
                        )
                        Text(
                            text = stringResource(R.string.auth_and),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = stringResource(R.string.auth_privacy),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { uriHandler.openUri(PRIVACY_URL) },
                        )
                    }
                }
            }

            if (isLoading) {
                TappyLoadingIndicator()
            }

            val errorState = uiState
            if (errorState is UiState.Error) {
                Text(
                    text = errorState.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }

            // Footer copyright — web login closes with a centered rights line.
            Text(
                text = stringResource(R.string.auth_footer_rights),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
    }
}

@Composable
private fun LoginFeatureRow(emoji: String, title: String, description: String, tint: Color) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(tint.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = emoji, fontSize = 20.sp)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Zalo's mark as the web /login draws it: a 24dp #0068FF rounded tile with the white "Zalo" wordmark. */
@Composable
private fun ZaloMark() {
    Box(
        modifier = Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).background(Color(0xFF0068FF)),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Text(text = "Zalo", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Black, maxLines = 1)
    }
}
