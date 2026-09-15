package com.tappyai.app.music

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.tools.ToolError
import com.tappyai.app.tools.ToolSegment
import com.tappyai.app.tools.ToolTextField
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyComingSoonSheet
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.launch

/**
 * Music Library — the web `/music` V3 page (design/v3-phase4 `src/app/music/page.tsx`), native:
 * the title row with the upload action, the search field, the blue→indigo→violet stage hero
 * (equaliser bars, "Âm nhạc / Cho mọi tâm trạng", the aitools pose with floating notes, the
 * "Khám phá ngay" jump and the capability pills), the category chips, then the two-up image-led
 * track grid (`MusicTrackCard`: square art, play badge, "Đang phát" tag, title · artist · time).
 *
 * Behaviour is exactly what it was: search (debounced, `GET /api/music/tracks/search`), category
 * chips (hidden while searching), a paginated, infinite-scrolling list (`GET /api/music/tracks`),
 * the split interaction (art → Sound Detail; title/meta and the play badge → preview through the
 * ExoPlayer-backed [AudioPlayer] seam) and the upload [TappyComingSoonSheet].
 *
 * Not ported: the web's "trending" rail. It is a second category fetch keyed on a category
 * *slug* the Android [MusicCategory] model does not carry — a data change, not a visual one.
 */
@Composable
fun MusicLibraryScreen(
    onBack: () -> Unit,
    onOpenSound: (String) -> Unit,
    viewModel: MusicLibraryViewModel = hiltViewModel(),
) {
    val player = rememberAudioPlayer()
    var comingSoonFeature by remember { mutableStateOf<String?>(null) }
    val musicUploadFeatureName = stringResource(R.string.music_upload_feature_name)
    val gridState = rememberLazyGridState()
    val scope = rememberCoroutineScope()

    V3HomeTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(HomeV3.Background),
            contentAlignment = Alignment.TopCenter,
        ) {
            val state = viewModel.tracksState
            val tracks = (state as? UiState.Success)?.data.orEmpty()

            // Fires loadMore() once the last tile is within reach, so scrolling near the bottom
            // quietly appends the next page instead of needing a "Load more" tap.
            val shouldLoadMore by remember {
                derivedStateOf {
                    val lastVisible = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                    // Read the state here, not the captured `tracks`: this lambda is remembered once.
                    val count = (viewModel.tracksState as? UiState.Success)?.data?.size ?: 0
                    lastVisible >= HEADER_ITEMS + count - 3
                }
            }
            LaunchedEffect(shouldLoadMore, tracks.size) {
                if (shouldLoadMore && tracks.isNotEmpty()) viewModel.loadMore()
            }

            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                state = gridState,
                modifier = Modifier
                    .widthIn(max = TappyContainers.content)
                    .fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = TappySpacing.xl, end = TappySpacing.xl, top = TappySpacing.xl, bottom = TappySpacing.huge,
                ),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xxl),
            ) {
                // ── Title row: back, "Thư viện nhạc" with the note glyph, upload ──
                item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = HomeV3.OnSurface)
                        }
                        Icon(Icons.Filled.MusicNote, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(20.dp))
                        Text(
                            text = stringResource(R.string.music_library_title),
                            color = HomeV3.OnSurface,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                        )
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(HomeV3.SurfaceVariant)
                                .border(1.dp, HomeV3.Outline, RoundedCornerShape(12.dp))
                                .clickable(onClick = { comingSoonFeature = musicUploadFeatureName })
                                .semantics { contentDescription = musicUploadFeatureName },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Upload, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(18.dp))
                        }
                    }
                }

                // ── Search (`.v3-music-search`) ──
                item(key = "search", span = { GridItemSpan(maxLineSpan) }) {
                    ToolTextField(
                        value = viewModel.query,
                        onValueChange = viewModel::onQueryChange,
                        placeholder = stringResource(R.string.music_search_placeholder),
                        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = HomeV3.OnSurfaceVariant) },
                    )
                }

                // ── The stage hero ──
                item(key = "hero", span = { GridItemSpan(maxLineSpan) }) {
                    MusicHero(onExplore = { scope.launch { gridState.animateScrollToItem(HEADER_ITEMS - 1) } })
                }

                // ── Category chips (`.v3-chip`), hidden while searching ──
                item(key = "chips", span = { GridItemSpan(maxLineSpan) }) {
                    if (!viewModel.isSearching) {
                        CategoryTabs(
                            categories = viewModel.categories,
                            selectedCategoryId = viewModel.selectedCategoryId,
                            onSelect = viewModel::onSelectCategory,
                        )
                    }
                }

                // ── Section title ──
                item(key = "section", span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        text = stringResource(
                            if (viewModel.isSearching) R.string.tool_music_section_results
                            else R.string.tool_music_section_all,
                        ),
                        color = HomeV3.OnSurface,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }

                when (state) {
                    is UiState.Loading, UiState.Idle -> item(key = "loading", span = { GridItemSpan(maxLineSpan) }) {
                        Box(modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = HomeV3.Purple, modifier = Modifier.size(24.dp))
                        }
                    }

                    is UiState.Error -> item(key = "error", span = { GridItemSpan(maxLineSpan) }) {
                        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
                            ToolError(state.message)
                            ToolSegment(
                                text = stringResource(com.tappyai.core.designsystem.R.string.tappy_error_retry),
                                selected = false,
                                onClick = viewModel::retry,
                            )
                        }
                    }

                    UiState.Empty -> item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
                        ) {
                            Icon(Icons.Filled.MusicNote, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(22.dp))
                            Text(text = stringResource(R.string.music_empty_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Text(text = stringResource(R.string.music_empty_message), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp)
                        }
                    }

                    is UiState.Success -> {
                        items(items = tracks, key = { it.id }) { track ->
                            TrackCard(
                                track = track,
                                isPlaying = player.playingTrackId == track.id && player.isPlaying,
                                onOpenDetail = { onOpenSound(track.id) },
                                onTogglePreview = { player.toggle(track.id, track.previewUrl ?: track.audioUrl) },
                            )
                        }
                        if (viewModel.isLoadingMore) {
                            item(key = "loading-more", span = { GridItemSpan(maxLineSpan) }) {
                                val loadingLabel = stringResource(com.tappyai.core.designsystem.R.string.tappy_cd_loading)
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(TappySpacing.lg)
                                        .semantics { contentDescription = loadingLabel },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(color = HomeV3.Purple, modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    comingSoonFeature?.let { feature ->
        TappyComingSoonSheet(
            featureName = feature,
            description = stringResource(R.string.coming_soon_description, feature),
            onDismiss = { comingSoonFeature = null },
        )
    }
}

/** Full-span items before the first track tile: header, search, hero, chips, section title. */
private const val HEADER_ITEMS = 5

private class MusicPill(val icon: ImageVector, val tint: Color, val textRes: Int)

/** Four things the module really does; below `sm` the web shows the first two, so do we. */
private val HERO_PILLS = listOf(
    MusicPill(Icons.Filled.AutoAwesome, Color(0xFFF59E0B), R.string.tool_music_pill_moods),
    MusicPill(Icons.Filled.Headphones, Color(0xFFEC4899), R.string.tool_music_pill_preview),
    MusicPill(Icons.Filled.Mic, Color(0xFF3B82F6), R.string.tool_music_pill_soundtrack),
    MusicPill(Icons.Filled.Upload, Color(0xFF8B5CF6), R.string.tool_music_pill_upload),
)

/**
 * The stage (`.v3-music-hero`): 22dp radius, the 120° blue→indigo→violet sweep with a violet
 * bloom top-right, the equaliser bars along the bottom, then the copy column, the white CTA,
 * the character with floating notes, and the pills.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MusicHero(onExplore: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF1D4ED8), Color(0xFF4338CA), Color(0xFF6D28D9))))
            .drawBehind {
                // The violet bloom (radial, 78% / 30%) and the dark left wash.
                drawRect(
                    Brush.radialGradient(
                        listOf(Color(0x73A78BFA), Color.Transparent),
                        center = Offset(size.width * 0.78f, size.height * 0.30f),
                        radius = size.width * 0.6f,
                    ),
                )
                drawRect(Brush.horizontalGradient(listOf(Color(0x8C060C28), Color.Transparent), endX = size.width * 0.55f))
                // The equaliser bars: 6px on / 8px off, fading upward over the bottom 42%.
                val barH = size.height * 0.42f
                var x = 0f
                while (x < size.width) {
                    drawRect(
                        Brush.verticalGradient(listOf(Color.Transparent, Color(0x1AFFFFFF)), startY = size.height - barH, endY = size.height),
                        topLeft = Offset(x, size.height - barH),
                        size = androidx.compose.ui.geometry.Size(6.dp.toPx(), barH),
                    )
                    x += 14.dp.toPx()
                }
            }
            .border(1.dp, Color(0x24FFFFFF), shape)
            .padding(TappySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), verticalAlignment = Alignment.Bottom) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                Text(
                    text = stringResource(R.string.tool_music_title1),
                    color = Color.White,
                    fontSize = 28.sp,
                    lineHeight = 32.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.5).sp,
                )
                Text(
                    text = stringResource(R.string.tool_music_title2),
                    color = Color(0xFFBFDBFE),
                    fontSize = 28.sp,
                    lineHeight = 32.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.5).sp,
                )
                Text(
                    text = stringResource(R.string.tool_music_body),
                    color = Color(0xDBFFFFFF),
                    fontSize = 14.5.sp,
                    lineHeight = 22.sp,
                )
                Row(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .heightIn(min = 46.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                        .clickable(onClick = onExplore)
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(text = stringResource(R.string.tool_music_cta), color = Color(0xFF1D4ED8), fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color(0xFF1D4ED8), modifier = Modifier.size(18.dp))
                }
            }
            // The character: the aitools pose (laptop + music note) is the closest music pose in
            // the library — there is no headphones pose. Notes and a spark float around it.
            Box(modifier = Modifier.size(150.dp), contentAlignment = Alignment.BottomCenter) {
                Image(
                    painter = painterResource(R.drawable.tappy_aitools),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(140.dp),
                )
                HeroNote(Icons.Filled.MusicNote, Color(0xFFFFFFFF), 34.dp, Alignment.TopStart, Modifier.offset(x = (-4).dp, y = 0.dp))
                HeroNote(Icons.Filled.MusicNote, Color(0xBFF472B6), 26.dp, Alignment.TopEnd, Modifier.offset(x = 6.dp, y = 22.dp))
                HeroNote(Icons.Filled.AutoAwesome, Color(0xFFFDE68A), 22.dp, Alignment.BottomEnd, Modifier.offset(x = 10.dp, y = (-30).dp))
            }
        }

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            HERO_PILLS.take(2).forEach { pill ->
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0x8C090E28))
                        .border(1.dp, Color(0x24FFFFFF), RoundedCornerShape(16.dp))
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(
                        modifier = Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(pill.tint),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(pill.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                    Text(text = stringResource(pill.textRes), color = Color(0xEBFFFFFF), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun BoxScope.HeroNote(icon: ImageVector, tint: Color, size: Dp, alignment: Alignment, modifier: Modifier) {
    Icon(icon, contentDescription = null, tint = tint, modifier = modifier.align(alignment).size(size))
}

@Composable
private fun CategoryTabs(
    categories: List<MusicCategory>,
    selectedCategoryId: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            MusicChip(text = stringResource(R.string.music_category_all), selected = selectedCategoryId == null, onClick = { onSelect(null) })
        }
        items(items = categories, key = { it.id }) { category ->
            MusicChip(text = category.label, selected = selectedCategoryId == category.id, onClick = { onSelect(category.id) })
        }
    }
}

/** A `.v3-chip` pill: 40dp, full radius, bright accent when selected. */
@Composable
private fun MusicChip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .heightIn(min = 40.dp)
            .clip(CircleShape)
            .background(if (selected) HomeV3.Purple else HomeV3.SurfaceVariant)
            .border(1.dp, if (selected) HomeV3.Purple else HomeV3.Outline, CircleShape)
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, color = if (selected) Color.White else HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * One track as an image-led tile (`MusicTrackCard`): square art with the play badge in the corner
 * and the "Đang phát" tag while previewing, then title and artist · duration.
 *
 * Split interaction, matching the library's "quick listen" intent (browsing stays fast):
 *  - Artwork → Sound Detail (the deep-dive affordance).
 *  - Play badge, title/artist/duration → preview.
 * Detail is deliberately NOT the whole tile's default action.
 */
@Composable
private fun TrackCard(
    track: MusicTrack,
    isPlaying: Boolean,
    onOpenDetail: () -> Unit,
    onTogglePreview: () -> Unit,
) {
    val openDetailsContentDescription = stringResource(R.string.music_open_details_content_description, track.title)
    val stopPreviewContentDescription = stringResource(R.string.music_stop_preview_content_description, track.title)
    val playPreviewContentDescription = stringResource(R.string.music_play_preview_content_description, track.title)
    val artShape = RoundedCornerShape(14.dp)

    Column(modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(artShape)
                .background(HomeV3.SurfaceVariant)
                .border(1.dp, HomeV3.Outline, artShape),
        ) {
            MusicThumbnail(
                coverUrl = track.coverUrl,
                title = track.title,
                size = Dp.Unspecified,
                modifier = Modifier
                    .fillMaxSize()
                    .clickable(onClick = onOpenDetail)
                    .semantics { contentDescription = openDetailsContentDescription },
            )
            // The scrim earns its weight only over a real picture.
            if (track.coverUrl != null) {
                Box(modifier = Modifier.fillMaxSize().background(Color(0x73000000)))
            }
            if (isPlaying) {
                Text(
                    text = stringResource(R.string.tool_music_now_playing).uppercase(),
                    color = Color.White,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.8.sp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(10.dp)
                        .clip(CircleShape)
                        .background(HomeV3.Purple)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(10.dp)
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (isPlaying) HomeV3.Purple else Color(0xC70A0E1E))
                    .border(1.dp, if (isPlaying) HomeV3.Purple else Color(0x38FFFFFF), CircleShape)
                    .clickable(onClick = onTogglePreview)
                    .semantics {
                        contentDescription =
                            if (isPlaying) stopPreviewContentDescription else playPreviewContentDescription
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(if (isPlaying) 16.dp else 20.dp),
                )
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onTogglePreview)
                .padding(horizontal = 2.dp),
        ) {
            Text(
                text = track.title,
                color = HomeV3.OnSurface,
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = 19.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (track.artist != null) {
                    Text(
                        text = track.artist,
                        color = HomeV3.OnSurfaceVariant,
                        fontSize = 12.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Text(text = "·", color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp)
                }
                Text(text = formatDuration(track.durationSec), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp)
            }
        }
    }
}

/**
 * Track/sound cover — mirrors the web `MusicThumbnail`: the cover image, or a note-icon
 * placeholder on a tinted square when there's no cover (never a fake/broken image). Shared by the
 * library tiles and the Sound Detail hero. Pass [Dp.Unspecified] to fill the parent instead of
 * sizing itself.
 */
@Composable
internal fun MusicThumbnail(coverUrl: String?, title: String, size: Dp, modifier: Modifier = Modifier) {
    val sized = if (size == Dp.Unspecified) modifier else modifier.size(size)
    Box(
        modifier = sized
            .clip(TappyShapes.input)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (coverUrl != null) {
            TappyImage(
                url = coverUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize().clip(TappyShapes.input),
            )
        } else {
            Icon(
                imageVector = Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = if (size == Dp.Unspecified) Modifier.size(40.dp) else Modifier.size(size * 0.5f),
            )
        }
    }
}
