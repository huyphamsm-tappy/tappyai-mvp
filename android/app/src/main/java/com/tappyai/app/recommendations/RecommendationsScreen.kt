package com.tappyai.app.recommendations

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import java.util.Locale

// "Gợi ý cho bạn" — D:/redesign Sep 22 01_41 = the web page (d97b261 / 1e11b32): hero with the
// accent "gần bạn", three highlights, mascot + bubble; "📍 Địa điểm nổi bật gần đây · Xem thêm";
// cards (photo + rank, name, address, rating / recently active / review count chips, "Hỏi Tappy về
// chỗ này" + chevron); the footer lines. Only facts the server sent are drawn.

private val Accent = Color(0xFF3391FF)
private val Pink = Color(0xFFEC4899)
private val Indigo = Color(0xFF818CF8)
private val Amber = Color(0xFFF59E0B)
private val Emerald = Color(0xFF10B981)

@Composable
fun RecommendationsScreen(
    onBack: () -> Unit,
    onAskAboutPlace: (prompt: String) -> Unit,
    onSeeMore: () -> Unit = {},
    viewModel: RecommendationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val ageState by viewModel.ageState.collectAsStateWithLifecycle()
    if (ageState == RecommendationsAgeState.Required) {
        // Full screen over the shell, like the web's standalone /age-check page; dismissing goes back.
        com.tappyai.app.age.AgeCheckDialog(guest = viewModel.isGuest, onEligible = viewModel::onAgeConfirmed, onDismiss = onBack)
        return
    }
    val colors = MaterialTheme.colorScheme
    val personalized = (state as? UiState.Success)?.data?.personalized == true

    Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        // Header: back disc + "Quay lại" · centred "✨ Gợi ý cho bạn".
        Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(
                modifier = Modifier.align(Alignment.CenterStart).clip(RoundedCornerShape(50)).clickable(onClick = onBack).padding(end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(colors.surfaceVariant), contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = Accent, modifier = Modifier.size(18.dp))
                }
                Text(stringResource(R.string.common_back), color = colors.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 8.dp))
            }
            Row(modifier = Modifier.align(Alignment.Center), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Amber, modifier = Modifier.size(18.dp))
                Text(stringResource(R.string.recommendations_header_title), color = colors.onSurface, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.padding(start = 6.dp))
            }
        }
        LazyColumn(
            modifier = Modifier.widthIn(max = TappyContainers.content).fillMaxWidth().fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "hero") { Hero() }
            item(key = "section") {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Place, contentDescription = null, tint = Accent, modifier = Modifier.size(18.dp))
                    Text(
                        stringResource(if (personalized) R.string.recommendations_subtitle_personalized else R.string.recommendations_subtitle_popular),
                        color = colors.onSurface, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(start = 8.dp).weight(1f),
                    )
                    Row(modifier = Modifier.clickable(onClick = onSeeMore), verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.recommendations_see_more), color = Accent, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Accent, modifier = Modifier.size(16.dp))
                    }
                }
            }
            when (val s = state) {
                UiState.Loading, UiState.Idle -> item(key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) { TappyLoadingIndicator() }
                }
                is UiState.Error -> item(key = "error") {
                    Text(
                        s.message, color = Color(0xFFFCA5A5), fontSize = 14.sp,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0x33B91C1C)).clickable(onClick = viewModel::retry).padding(14.dp),
                    )
                }
                UiState.Empty -> item(key = "empty") { NotEnough() }
                is UiState.Success -> {
                    val data = s.data
                    if (data.explanation.isNotEmpty()) item(key = "explanation") { Chips(data.explanation, Accent) }
                    if (data.items.isEmpty()) item(key = "empty") { NotEnough() }
                    itemsIndexed(items = data.items, key = { _, it -> it.placeId }) { index, item ->
                        val place = item.placeName.ifBlank { stringResource(R.string.recommendations_ask_prompt_fallback) }
                        val prompt = stringResource(R.string.recommendations_ask_prompt, place)
                        PlaceCard(rank = index + 1, item = item, onAsk = { onAskAboutPlace(prompt) })
                    }
                }
            }
            item(key = "footer") { Footer() }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Hero() {
    val colors = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    buildAnnotatedString {
                        append(stringResource(R.string.recommendations_hero_lead)); append(" ")
                        withStyle(SpanStyle(color = Accent)) { append(stringResource(R.string.recommendations_hero_accent)) }
                    },
                    color = colors.onSurface, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold,
                )
                Text(stringResource(R.string.recommendations_hero_subtitle), color = colors.onSurfaceVariant, fontSize = 14.sp, lineHeight = 19.sp, modifier = Modifier.padding(top = 6.dp))
            }
            // The mascot and its bubble (mockup right column).
            Box(modifier = Modifier.width(118.dp).height(130.dp)) {
                Image(painterResource(R.drawable.tappy_recommendation), contentDescription = null, modifier = Modifier.align(Alignment.BottomCenter).size(104.dp))
                Text(
                    stringResource(R.string.recommendations_mascot_bubble), color = Color.White, fontSize = 10.sp, lineHeight = 12.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.TopEnd).clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp, bottomEnd = 14.dp, bottomStart = 4.dp)).background(Accent).padding(horizontal = 8.dp, vertical = 5.dp),
                )
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Highlight(Icons.Filled.Place, Accent, stringResource(R.string.recommendations_highlight_discover))
            Highlight(Icons.Filled.Groups, Indigo, stringResource(R.string.recommendations_highlight_community))
            Highlight(Icons.Filled.FavoriteBorder, Pink, stringResource(R.string.recommendations_highlight_life))
        }
    }
}

@Composable
private fun Highlight(icon: ImageVector, tint: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(tint.copy(alpha = 0.12f)).border(1.dp, tint.copy(alpha = 0.3f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Text(text, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, lineHeight = 16.sp, modifier = Modifier.padding(start = 8.dp).widthIn(max = 130.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlaceCard(rank: Int, item: Recommendation, onAsk: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.surface).border(1.dp, colors.outlineVariant, RoundedCornerShape(18.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(84.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(Accent.copy(alpha = 0.15f), Color(0x26A855F7)))),
                contentAlignment = Alignment.Center,
            ) {
                if (item.photoUrl != null) TappyImage(url = item.photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
                else Icon(Icons.Filled.Place, contentDescription = null, tint = Accent, modifier = Modifier.size(28.dp))
                Box(
                    Modifier.align(Alignment.TopStart).padding(6.dp).size(24.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Accent, Color(0xFFA855F7)))),
                    contentAlignment = Alignment.Center,
                ) { Text(rank.toString(), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(item.placeName.ifBlank { stringResource(R.string.recommendations_place_fallback) }, color = colors.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                item.address?.let { address ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                        Icon(Icons.Filled.Place, contentDescription = null, tint = Accent, modifier = Modifier.size(12.dp))
                        Text(address, color = colors.onSurfaceVariant, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp))
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                    item.averageRating?.let { r ->
                        FactChip(Amber) {
                            Text(String.format(Locale.US, "%.1f", r), color = Amber, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Icon(Icons.Filled.Star, contentDescription = null, tint = Amber, modifier = Modifier.padding(start = 3.dp).size(11.dp))
                        }
                    }
                    if (isRecentlyActive(item.latestReviewAt)) {
                        FactChip(Emerald) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(Emerald))
                            Text(stringResource(R.string.recommendations_recently_active), color = Emerald, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                    if (item.reviewCount > 0) {
                        FactChip(colors.onSurfaceVariant) {
                            Icon(Icons.Filled.Group, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(11.dp))
                            Text(stringResource(R.string.recommendations_review_count, item.reviewCount), color = colors.onSurface, fontSize = 12.sp, modifier = Modifier.padding(start = 4.dp))
                        }
                    }
                    if (item.showEngineSignals) item.matchedSignals.take(4).forEach { s -> FactChip(colors.onSurfaceVariant) { Text(s, color = colors.onSurface, fontSize = 12.sp) } }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(50)).background(Accent).clickable(onClick = onAsk).padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.recommendations_ask_tappy), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp))
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp).size(20.dp))
        }
    }
}

@Composable
private fun FactChip(tint: Color, content: @Composable () -> Unit) {
    Row(
        modifier = Modifier.clip(RoundedCornerShape(50)).background(tint.copy(alpha = 0.10f)).border(1.dp, tint.copy(alpha = 0.3f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Chips(values: List<String>, tint: Color) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        values.forEach { v -> FactChip(tint) { Text(v, color = tint, fontSize = 12.sp) } }
    }
}

@Composable
private fun NotEnough() {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Image(painterResource(R.drawable.tappy_recommendation), contentDescription = null, modifier = Modifier.size(56.dp))
        Text(stringResource(R.string.recommendations_empty_title), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, textAlign = TextAlign.Center)
        Text(stringResource(R.string.recommendations_empty_message), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Footer() {
    val colors = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(100.dp).height(1.dp).background(colors.outlineVariant))
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Accent, modifier = Modifier.padding(horizontal = 12.dp).size(16.dp))
            Box(Modifier.width(100.dp).height(1.dp).background(colors.outlineVariant))
        }
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.recommendations_footer_line), color = colors.onSurface, fontSize = 16.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 300.dp))
        Icon(Icons.Filled.Favorite, contentDescription = null, tint = Accent, modifier = Modifier.padding(vertical = 10.dp).size(16.dp))
        Text(stringResource(R.string.recommendations_footer_cta), color = colors.onSurfaceVariant, fontSize = 13.sp)
    }
}
