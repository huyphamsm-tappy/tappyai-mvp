package com.tappyai.app.age

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.chat.data.GuestAgeStore
import com.tappyai.core.common.StringProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.PATCH
import java.time.LocalDate
import javax.inject.Inject

// ── The 18+ gate: D:/redesign "Xác nhận bạn đủ 18 tuổi" = web /age-check (AgeCheckView.tsx) ──────
//
// ONE screen for both audiences, like the web: a GUEST's answer is a self-declaration stored on this
// device (GuestAgeStore → `x-tappy-age-declared` on every request, the web's cookie); an ACCOUNT's
// answer is `PATCH /api/profile {dateOfBirth}` and the server's `ageStatus` decides.

/** `YYYY-MM-DD` from the three fields, or null — the web's checks (`^\d{1,2}$`, `^\d{4}$`, pad) plus a real calendar date. */
internal fun ageCheckIso(day: String, month: String, year: String): String? {
    val d = day.trim(); val m = month.trim(); val y = year.trim()
    if (!Regex("^\\d{4}$").matches(y) || !Regex("^\\d{1,2}$").matches(m) || !Regex("^\\d{1,2}$").matches(d)) return null
    val iso = "$y-${m.padStart(2, '0')}-${d.padStart(2, '0')}"
    return runCatching { LocalDate.parse(iso) }.getOrNull()?.let { iso }
}

enum class AgeStatus { Eligible, Ineligible, Unknown }

@Serializable
private data class DobRequestDto(val dateOfBirth: String)

@Serializable
private data class DobResponseDto(
    val ageStatus: String? = null,
    val canCorrectAge: Boolean? = null,
    val error: String? = null,
    val message: String? = null,
)

private interface AgeApi {
    @PATCH("api/profile")
    suspend fun submitDateOfBirth(@Body body: DobRequestDto): Response<ResponseBody>
}

@HiltViewModel
class AgeCheckViewModel @Inject constructor(
    retrofit: Retrofit,
    private val guestAgeStore: GuestAgeStore,
    private val strings: StringProvider,
    private val authRepository: com.tappyai.features.auth.data.AuthRepository,
    private val languageManager: com.tappyai.app.language.LanguageManager,
) : ViewModel() {
    val language: com.tappyai.app.language.AppLanguage get() = languageManager.effective

    fun toggleLanguage() {
        val next = if (language == com.tappyai.app.language.AppLanguage.Vietnamese) com.tappyai.app.language.AppLanguage.English else com.tappyai.app.language.AppLanguage.Vietnamese
        viewModelScope.launch { languageManager.setLanguage(next) }
    }
    private val api = retrofit.create(AgeApi::class.java)
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    var saving by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var blocked by mutableStateOf(false); private set

    fun submit(day: String, month: String, year: String, guest: Boolean, onEligible: () -> Unit) {
        error = null
        val iso = ageCheckIso(day, month, year) ?: run { error = strings.get(R.string.age_error_invalid); return }
        viewModelScope.launch {
            saving = true
            val status: AgeStatus? = if (guest) {
                guestAgeStore.declare(iso)
                when (GuestAgeStore.statusOf(iso)) {
                    GuestAgeStore.Status.Eligible -> AgeStatus.Eligible
                    GuestAgeStore.Status.Ineligible -> AgeStatus.Ineligible
                    GuestAgeStore.Status.Unknown -> null.also { error = strings.get(R.string.age_error_invalid) }
                }
            } else {
                runCatching { api.submitDateOfBirth(DobRequestDto(iso)) }.fold(
                    onSuccess = { res ->
                        val body = runCatching { json.decodeFromString<DobResponseDto>((if (res.isSuccessful) res.body() else res.errorBody())?.string().orEmpty()) }.getOrNull()
                        if (!res.isSuccessful) {
                            // The server owns the sentence for every refusal it can explain (the web does the same).
                            error = body?.message?.takeIf { it.isNotBlank() } ?: strings.get(R.string.age_error_failed)
                            null
                        } else when (body?.ageStatus) {
                            "eligible" -> AgeStatus.Eligible
                            else -> AgeStatus.Ineligible
                        }
                    },
                    onFailure = { error = strings.get(R.string.age_error_failed); null },
                )
            }
            // 🚨 UAT 2026-09-28: after `PATCH /api/profile {dateOfBirth}` answers "eligible", the
            // SAME bearer token still gets 403 age_verification_required from gated routes, while a
            // fresh token gets 200 (measured with the API; ANDROID-REQUESTS R5). The web's cookie
            // session renews itself; a bearer does not — so refresh it before going back.
            if (status == AgeStatus.Eligible && !guest) runCatching { authRepository.refreshSession() }
            saving = false
            when (status) {
                AgeStatus.Eligible -> onEligible()
                AgeStatus.Ineligible -> blocked = true
                else -> Unit
            }
        }
    }
}

private val Bg = Color(0xFF070B18)
private val Card = Color(0x0BFFFFFF)
private val Line = Color(0x1AFFFFFF)
private val Muted = Color(0x8CFFFFFF)
private val Blue = Color(0xFF3B82F6)
private val Violet = Color(0xFF8B5CF6)
private val Accent = Brush.horizontalGradient(listOf(Color(0xFF60A5FA), Color(0xFFA78BFA)))

/** Full-screen 18+ gate over whatever asked for it (chat, recommendations). */
@Composable
fun AgeCheckDialog(guest: Boolean, onEligible: () -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        AgeCheckScreen(guest = guest, onEligible = onEligible)
    }
}

@Composable
fun AgeCheckScreen(guest: Boolean, onEligible: () -> Unit, viewModel: AgeCheckViewModel = hiltViewModel()) {
    var day by rememberSaveable { mutableStateOf("") }
    var month by rememberSaveable { mutableStateOf("") }
    var year by rememberSaveable { mutableStateOf("") }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .background(Brush.radialGradient(listOf(Color(0x401D4ED8), Color.Transparent), radius = 900f))
            .testTag("age-check"),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Header: the official lockup + the language chip (mockup top row).
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.tappyai_logo), contentDescription = "TappyAI", modifier = Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)))
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(buildAnnotatedString { append("Tappy"); withStyle(SpanStyle(color = Color(0xFF60A5FA))) { append("AI") } }, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black)
                    Text(stringResource(R.string.age_brand_tagline), color = Color(0x73FFFFFF), fontSize = 11.sp)
                }
                Row(
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Color(0x0DFFFFFF)).border(1.dp, Line, RoundedCornerShape(50))
                        .clickable(onClick = viewModel::toggleLanguage).padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Language, contentDescription = null, tint = Color(0x99FFFFFF), modifier = Modifier.size(16.dp))
                    Text(viewModel.language.displayName, color = Color(0xCCFFFFFF), fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 6.dp))
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Color(0x99FFFFFF), modifier = Modifier.size(16.dp))
                }
            }
            Spacer(Modifier.height(22.dp))

            // The card — the only interaction on the page.
            Column(
                modifier = Modifier
                    .widthIn(max = 560.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(28.dp))
                    .background(Card)
                    .border(1.dp, Line, RoundedCornerShape(28.dp))
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier.size(48.dp).clip(RoundedCornerShape(16.dp))
                        .background(Brush.linearGradient(listOf(Color(0x403B82F6), Color(0x337C3AED))))
                        .border(1.dp, Color(0x4060A5FA), RoundedCornerShape(16.dp)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Shield, contentDescription = null, tint = Color(0xFF93C5FD), modifier = Modifier.size(24.dp)) }
                Spacer(Modifier.height(14.dp))
                if (viewModel.blocked) {
                    Text(stringResource(R.string.age_blocked_title), color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(10.dp))
                    Text(stringResource(R.string.age_blocked_desc), color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 20.sp)
                } else {
                    Text(
                        buildAnnotatedString {
                            append(stringResource(R.string.age_ask_title_lead)); append(" ")
                            withStyle(SpanStyle(brush = Accent)) { append(stringResource(R.string.age_ask_title_accent)) }
                        },
                        color = Color.White, fontSize = 26.sp, lineHeight = 31.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(stringResource(R.string.age_ask_desc), color = Muted, fontSize = 14.sp, lineHeight = 20.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(20.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        val thisYear = LocalDate.now().year
                        DateField(stringResource(R.string.age_field_day), day, "DD", (1..31).map { it.toString().padStart(2, '0') }, Modifier.weight(1f).testTag("age-day")) { day = it }
                        DateField(stringResource(R.string.age_field_month), month, "MM", (1..12).map { it.toString().padStart(2, '0') }, Modifier.weight(1f).testTag("age-month")) { month = it }
                        DateField(stringResource(R.string.age_field_year), year, "YYYY", (thisYear downTo thisYear - 100).map { it.toString() }, Modifier.weight(1.25f).testTag("age-year")) { year = it }
                    }
                    viewModel.error?.let { Text(it, color = Color(0xFFF87171), fontSize = 13.sp, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) }
                    Spacer(Modifier.height(16.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(Brush.horizontalGradient(listOf(Blue, Violet)))
                            .clickable(enabled = !viewModel.saving) { viewModel.submit(day, month, year, guest, onEligible) }
                            .padding(vertical = 14.dp)
                            .testTag("age-submit"),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (viewModel.saving) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                            Text("  " + stringResource(R.string.age_submitting), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        } else {
                            Text(stringResource(R.string.age_submit), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.padding(start = 8.dp).size(18.dp))
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0x08FFFFFF)).border(1.dp, Line, RoundedCornerShape(16.dp)).padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x1A3B82F6)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.Lock, contentDescription = null, tint = Color(0xFF93C5FD), modifier = Modifier.size(16.dp))
                        }
                        Column {
                            Text(stringResource(R.string.age_privacy_title), color = Color(0xD9FFFFFF), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Text(stringResource(R.string.age_privacy), color = Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }

            // "CỘNG ĐỒNG TAPPYAI" — who this is for (web shows it under the card on a phone).
            Column(modifier = Modifier.fillMaxWidth().padding(top = 26.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(stringResource(R.string.age_intro_eyebrow), color = Color(0xE660A5FA), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                Text(
                    buildAnnotatedString {
                        append(stringResource(R.string.age_intro_title_lead)); append("\n")
                        withStyle(SpanStyle(brush = Brush.horizontalGradient(listOf(Color(0xFF38BDF8), Color(0xFFA78BFA))))) { append(stringResource(R.string.age_intro_title_accent)) }
                    },
                    color = Color.White, fontSize = 28.sp, lineHeight = 33.sp, fontWeight = FontWeight.Black,
                )
                Text(stringResource(R.string.age_intro_desc), color = Muted, fontSize = 15.sp, lineHeight = 22.sp)
                Feature(Icons.Filled.ChatBubbleOutline, Color(0xFF93C5FD), stringResource(R.string.age_feature_discover_title), stringResource(R.string.age_feature_discover_desc))
                Feature(Icons.Filled.ShoppingBag, Color(0xFFC4B5FD), stringResource(R.string.age_feature_shop_title), stringResource(R.string.age_feature_shop_desc))
                Feature(Icons.Filled.Groups, Color(0xFF6EE7B7), stringResource(R.string.age_feature_together_title), stringResource(R.string.age_feature_together_desc))
            }

            // Mascot under the card on a phone (the web's "MASCOT (COMPACT)").
            Image(painterResource(R.drawable.tappy_wave), contentDescription = null, modifier = Modifier.padding(top = 18.dp).size(160.dp))

            // The three trust promises.
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(24.dp)).background(Color(0x05FFFFFF)).border(1.dp, Color(0x14FFFFFF), RoundedCornerShape(24.dp)).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Trust(Icons.Filled.Lock, Color(0xFF6EE7B7), stringResource(R.string.age_trust_privacy_title), stringResource(R.string.age_trust_privacy_desc))
                Trust(Icons.Filled.VisibilityOff, Color(0xFF93C5FD), stringResource(R.string.age_trust_age_only_title), stringResource(R.string.age_trust_age_only_desc))
                Trust(Icons.Filled.VerifiedUser, Color(0xFFC4B5FD), stringResource(R.string.age_trust_better_title), stringResource(R.string.age_trust_better_desc))
            }
            Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(48.dp).height(1.dp).background(Line))
                Icon(Icons.Filled.Favorite, contentDescription = null, tint = Color(0xB360A5FA), modifier = Modifier.padding(horizontal = 10.dp).size(13.dp))
                Box(Modifier.width(48.dp).height(1.dp).background(Line))
            }
            Text(stringResource(R.string.age_footer_tagline), color = Color(0x59FFFFFF), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

/** One of the three date dropdowns — the mockup's "DD ▾ / MM ▾ / YYYY ▾" (web: a <select> each). */
@Composable
private fun DateField(label: String, value: String, placeholder: String, options: List<String>, modifier: Modifier, onChange: (String) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = Color(0xB3FFFFFF), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Box {
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0x0DFFFFFF)).border(1.dp, Line, RoundedCornerShape(16.dp))
                    .clickable { open = true }.padding(horizontal = 14.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(value.ifEmpty { placeholder }, color = if (value.isEmpty()) Color(0x59FFFFFF) else Color.White, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Color(0x99FFFFFF), modifier = Modifier.size(18.dp))
            }
            androidx.compose.material3.DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.height(320.dp)) {
                options.forEach { o ->
                    androidx.compose.material3.DropdownMenuItem(text = { Text(o) }, onClick = { onChange(o); open = false })
                }
            }
        }
    }
}

@Composable
private fun Feature(icon: ImageVector, tint: Color, title: String, desc: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(16.dp)).background(tint.copy(alpha = 0.16f)).border(1.dp, Line, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(19.dp))
        }
        Column {
            Text(title, color = Color(0xE6FFFFFF), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(desc, color = Color(0x80FFFFFF), fontSize = 13.sp)
        }
    }
}

@Composable
private fun Trust(icon: ImageVector, tint: Color, title: String, desc: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(tint.copy(alpha = 0.12f)).border(1.dp, tint.copy(alpha = 0.25f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(17.dp))
        }
        Column {
            Text(title, color = Color(0xD9FFFFFF), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(desc, color = Color(0x73FFFFFF), fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}
