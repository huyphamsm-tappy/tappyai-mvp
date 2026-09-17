package com.tappyai.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.ImageNotSupported
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.account.AccountProfile
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3AccentPill
import com.tappyai.app.personal.V3Avatar
import com.tappyai.app.personal.V3Chip
import com.tappyai.app.personal.V3EmptyPanel
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3OutlinePill
import com.tappyai.app.personal.V3Panel
import com.tappyai.app.personal.V3PanelHeader
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.app.saved.FavoritePlace
import com.tappyai.core.designsystem.component.TappyImage

/**
 * The signed-in hub's V3 pieces — the web `/profile` (`ProfileView.tsx`): the hero panel
 * (breadcrumb, gradient band, 76dp avatar overlapping it, name + Premium, bio, Edit + QR, the
 * three stats), the content panel — the self profile's PRIVATE collections (Bài viết / Đã thích /
 * Đã lưu / Đã ẩn, see [ProfileContentTab]) plus the saved places, one scrolling chip row like
 * the web's `ChipRow` — and the side panels the desktop puts in its right column — Personal information, Activity,
 * Following, QR — which stack under the content at phone width, as the web does below `xl`.
 *
 * 🚨 WHAT IS NOT HERE, AND WHY (the web's own audit, kept): no cover photo (no column), no
 * @handle (no username column), no location, no points/tiers, no highlights, no activity log,
 * no saved-deal counters. A stat renders only when
 * the server sent it. These collections are drawn ONLY for the signed-in user's own hub; the
 * creator profile (`ReviewProfileScreen`) is public-only and untouched.
 */
@Composable
internal fun ProfileHeroV3(
    profile: AccountProfile?,
    stats: ReviewProfile?,
    likes: Int?,
    isPremium: Boolean,
    onEditProfile: () -> Unit,
    onShowQr: () -> Unit,
) {
    val displayName = profile?.fullName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.profile_header_title)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, V3PanelShape),
    ) {
        Text(
            text = stringResource(R.string.profile_v3_breadcrumb).uppercase(),
            color = HomeV3.OnSurfaceVariant,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 1.3.sp,
            modifier = Modifier.padding(start = 20.dp, top = 16.dp),
        )
        // 🚨 A gradient, and it is not pretending to be a photo — there is no cover column.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
                .height(96.dp)
                .background(Brush.linearGradient(listOf(V3Tone.Violet.copy(alpha = 0.5f), HomeV3.Purple.copy(alpha = 0.5f), HomeV3.SurfaceVariant.copy(alpha = 0.5f)))),
        )
        Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp)) {
            Box(
                modifier = Modifier
                    .offset(y = (-40).dp)
                    .size(84.dp)
                    .clip(CircleShape)
                    .background(HomeV3.Surface),
                contentAlignment = Alignment.Center,
            ) {
                V3Avatar(url = profile?.avatarUrl, name = displayName, size = 76.dp)
            }
            Column(modifier = Modifier.offset(y = (-28).dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = displayName,
                        color = HomeV3.OnSurface,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    // Only on a real active subscription.
                    if (isPremium) {
                        Row(
                            modifier = Modifier.clip(CircleShape).background(V3Tone.Violet.copy(alpha = 0.18f)).padding(horizontal = 8.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = V3Tone.Violet, modifier = Modifier.size(10.dp))
                            Text(text = stringResource(R.string.profile_v3_premium), color = V3Tone.Violet, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                val bio = profile?.bio?.trim().orEmpty()
                val email = profile?.email?.takeIf { it.isNotBlank() }
                when {
                    bio.isNotEmpty() -> Text(text = bio, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 19.sp)
                    email != null -> Text(text = email, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    profile == null -> Text(text = stringResource(R.string.profile_header_subtitle), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    V3OutlinePill(text = stringResource(R.string.profile_v3_edit_profile), icon = Icons.Filled.Edit, onClick = onEditProfile)
                    // The existing share affordance, reused: the on-device QR of /users/{id}.
                    IconButton(
                        onClick = onShowQr,
                        modifier = Modifier.size(36.dp).clip(CircleShape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, CircleShape),
                    ) {
                        Icon(Icons.Filled.QrCode2, contentDescription = stringResource(R.string.profile_qr_button_content_description), tint = HomeV3.OnSurface, modifier = Modifier.size(18.dp))
                    }
                }
                // Statistics render only when the server actually sent them.
                if (stats != null || likes != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        stats?.let { HeroStat(it.followingCount, stringResource(R.string.profile_v3_stat_following)) }
                        stats?.let { HeroStat(it.followerCount, stringResource(R.string.profile_v3_stat_followers)) }
                        likes?.let { HeroStat(it, stringResource(R.string.profile_v3_stat_likes)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroStat(value: Int, label: String) {
    Column {
        Text(text = value.toString(), color = HomeV3.OnSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Text(text = label, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
    }
}

/** The tabbed content panel: three chips, the "Đăng bài mới" action, then grid / list / empty / loading / failed. */
@Composable
internal fun ProfileContentV3(
    tab: ProfileContentTab,
    onSelectTab: (ProfileContentTab) -> Unit,
    posts: List<Review>?,
    liked: List<Review>?,
    saved: List<Review>?,
    hidden: List<Review>?,
    shared: List<Review>?,
    places: List<FavoritePlace>?,
    loading: Boolean,
    failed: Boolean,
    onCompose: () -> Unit,
    /** A tile → the clip, in ITS collection's pager (own posts / hidden page `/mine`; saved pages `/saved`; liked opens the detail). */
    onOpenReview: (ProfileContentTab, String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, V3PanelShape),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // The web's `ChipRow`: one scrolling row, never a cramped five-way split.
            Row(
                modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ProfileContentTab.entries.forEach { t ->
                    V3Chip(stringResource(t.labelRes), tab == t, { onSelectTab(t) })
                }
            }
            V3AccentPill(text = stringResource(R.string.profile_v3_post_action), onClick = onCompose, minHeight = 32.dp)
        }
        HorizontalDivider(color = HomeV3.Outline)
        Box(modifier = Modifier.padding(16.dp)) {
            val rows: List<Any>? = when (tab) {
                ProfileContentTab.Posts -> posts
                ProfileContentTab.Liked -> liked
                ProfileContentTab.Saved -> saved
                ProfileContentTab.Hidden -> hidden
                ProfileContentTab.Shared -> shared
                ProfileContentTab.Places -> places
            }
            when {
                loading && rows == null -> V3Loading(height = 120.dp)
                failed -> ContentEmpty(stringResource(R.string.profile_v3_load_failed))
                rows != null && rows.isEmpty() -> ContentEmpty(stringResource(tab.emptyRes))
                rows != null -> if (tab == ProfileContentTab.Places) {
                    @Suppress("UNCHECKED_CAST")
                    PlaceList(rows as List<FavoritePlace>)
                } else {
                    @Suppress("UNCHECKED_CAST")
                    ReviewGrid(rows as List<Review>, hiddenBadge = tab == ProfileContentTab.Hidden) { onOpenReview(tab, it) }
                }
                else -> V3Loading(height = 120.dp)
            }
        }
    }
}

/** The chip label and the empty copy of each collection — the web's `v3.profile.tab*` / `empty*` plus the two private ones. */
private val ProfileContentTab.labelRes: Int
    get() = when (this) {
        ProfileContentTab.Posts -> R.string.profile_v3_tab_posts
        ProfileContentTab.Liked -> R.string.profile_v3_tab_liked
        ProfileContentTab.Saved -> R.string.profile_v3_tab_saved
        ProfileContentTab.Hidden -> R.string.profile_v3_tab_hidden
        ProfileContentTab.Shared -> R.string.profile_v3_tab_shared
        ProfileContentTab.Places -> R.string.profile_v3_tab_places
    }

private val ProfileContentTab.emptyRes: Int
    get() = when (this) {
        ProfileContentTab.Posts -> R.string.profile_v3_empty_posts
        ProfileContentTab.Liked -> R.string.profile_v3_empty_liked
        ProfileContentTab.Saved -> R.string.profile_v3_empty_saved
        ProfileContentTab.Hidden -> R.string.profile_v3_empty_hidden
        ProfileContentTab.Shared -> R.string.profile_v3_empty_shared
        ProfileContentTab.Places -> R.string.profile_v3_empty_places
    }

@Composable
private fun ContentEmpty(text: String) {
    V3EmptyPanel(text = text)
}

/**
 * The content grid — two across on a phone (the web's `grid-cols-2`), each tile a 4:5 picture
 * with the real engagement bottom-left and the place name + rating below. Every badge is a real
 * column: the play badge only on video posts, counts only when the row carries them.
 */
@Composable
private fun ReviewGrid(reviews: List<Review>, hiddenBadge: Boolean = false, onOpen: (String) -> Unit) {
    // Two columns as rows of weighted cells, NOT a FlowRow: FlowRow breaks lines by asking each
    // tile's intrinsic width, and that query reaches the Coil `SubcomposeAsyncImage` inside the
    // tile — "asking for intrinsic measurements of SubcomposeLayout layouts is not supported" —
    // which crashed the Tôi tab the moment a collection had a row with a thumbnail
    // (Pixel 8, 2026-09-17). `Row` + `weight` never measures intrinsics.
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        reviews.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { r -> ReviewTile(r, hiddenBadge, onOpen, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ReviewTile(r: Review, hiddenBadge: Boolean, onOpen: (String) -> Unit, modifier: Modifier) {
    run {
        run {
            val image = r.thumbnail ?: r.photos?.firstOrNull()
            val isVideo = r.contentType == ReviewContentType.Video
            val shape = RoundedCornerShape(14.dp)
            Column(
                modifier = modifier
                    .clip(shape)
                    .background(HomeV3.SurfaceVariant)
                    .border(1.dp, HomeV3.Outline, shape)
                    .clickable { onOpen(r.id) },
            ) {
                Box(modifier = Modifier.fillMaxWidth().aspectRatio(4f / 5f).background(HomeV3.SurfaceVariant)) {
                    if (image != null) {
                        TappyImage(url = image, contentDescription = null, modifier = Modifier.fillMaxSize())
                    } else {
                        Icon(Icons.Filled.ImageNotSupported, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.align(Alignment.Center).size(20.dp))
                    }
                    // The web's own-profile grid marks a hidden post with the eye-off glyph.
                    if (hiddenBadge) {
                        Icon(
                            Icons.Filled.VisibilityOff,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(20.dp).clip(CircleShape).background(Color(0x99000000)).padding(4.dp),
                        )
                    }
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xB3000000))))
                            .padding(start = 10.dp, end = 10.dp, top = 24.dp, bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (isVideo && r.viewCount != null) Badge(Icons.Filled.PlayArrow, compact(r.viewCount))
                        Badge(Icons.Filled.Favorite, compact(r.likeCount))
                        Badge(Icons.Filled.ChatBubble, compact(r.commentCount))
                    }
                }
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(text = r.placeName, color = HomeV3.OnSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (r.rating > 0) {
                        Icon(Icons.Filled.Star, contentDescription = null, tint = V3Tone.Amber, modifier = Modifier.size(10.dp))
                        Text(text = r.rating.toString(), color = V3Tone.Amber, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun Badge(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp))
        Text(text = text, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun compact(n: Int): String = if (n < 1000) n.toString() else String.format(java.util.Locale.US, if (n < 10000) "%.1fK" else "%.0fK", n / 1000.0)

@Composable
private fun PlaceList(places: List<FavoritePlace>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        places.forEach { p ->
            val shape = RoundedCornerShape(12.dp)
            Row(
                modifier = Modifier.fillMaxWidth().clip(shape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, shape).padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(Icons.Filled.Place, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.padding(top = 2.dp).size(14.dp))
                Column {
                    Text(text = p.name, color = HomeV3.OnSurface, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (p.address.isNotBlank()) Text(text = p.address, color = HomeV3.OnSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** "Thông tin cá nhân": name and email; the join date only when the profile read carried one. */
@Composable
internal fun ProfileInfoCard(profile: AccountProfile?, onEdit: () -> Unit) {
    V3Panel(padding = 0.dp) {
        V3PanelHeader(title = stringResource(R.string.profile_v3_info_title), action = stringResource(R.string.profile_v3_info_edit), onAction = onEdit, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
        HorizontalDivider(color = HomeV3.Outline)
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            InfoRow(stringResource(R.string.profile_v3_info_name), profile?.fullName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.profile_header_title))
            profile?.email?.takeIf { it.isNotBlank() }?.let { InfoRow(stringResource(R.string.profile_v3_info_email), it) }
            profile?.joinDate?.takeIf { it.isNotBlank() }?.let { InfoRow(stringResource(R.string.profile_v3_info_joined), it) }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
        Text(text = label, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
        Text(text = value, color = HomeV3.OnSurface, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

/** "Thành tích": six rows, each a real count — rendered only once known. */
@Composable
internal fun ProfileStatsCard(posts: Int?, videos: Int?, likes: Int?, savedPosts: Int?, savedPlaces: Int?, conversations: Int?) {
    V3Panel(padding = 0.dp) {
        V3PanelHeader(title = stringResource(R.string.profile_v3_stats_title), modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
        HorizontalDivider(color = HomeV3.Outline)
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatRow(stringResource(R.string.profile_v3_stat_posts), posts)
            StatRow(stringResource(R.string.profile_v3_stat_videos), videos)
            StatRow(stringResource(R.string.profile_v3_stat_likes), likes)
            StatRow(stringResource(R.string.profile_v3_stat_saved_posts), savedPosts)
            StatRow(stringResource(R.string.profile_v3_stat_saved_places), savedPlaces)
            StatRow(stringResource(R.string.profile_v3_stat_conversations), conversations)
        }
    }
}

@Composable
private fun StatRow(label: String, value: Int?) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
        Text(text = label, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
        Text(text = value?.toString() ?: "—", color = HomeV3.OnSurface, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** "Đang theo dõi": the first five people, each a row into their profile; "Xem tất cả" opens the Following page. */
@Composable
internal fun ProfileFollowingCard(following: List<UserSearchResult>?, onOpenPerson: (String) -> Unit, onSeeAll: () -> Unit) {
    V3Panel(padding = 0.dp) {
        V3PanelHeader(title = stringResource(R.string.profile_v3_following_title), action = stringResource(R.string.smart_tools_see_all), onAction = onSeeAll, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
        HorizontalDivider(color = HomeV3.Outline)
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when {
                following == null -> V3Loading(height = 40.dp)
                following.isEmpty() -> Text(text = stringResource(R.string.profile_v3_following_empty), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
                else -> following.forEach { f ->
                    val name = f.fullName?.trim().orEmpty()
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOpenPerson(f.id) }.padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        V3Avatar(url = f.avatarUrl, name = name, size = 30.dp)
                        Text(text = name, color = HomeV3.OnSurface, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/** "QR Profile": the hint and the same QR action the hero carries. */
@Composable
internal fun ProfileQrCard(onShowQr: () -> Unit) {
    V3Panel(padding = 0.dp) {
        V3PanelHeader(title = stringResource(R.string.profile_v3_qr_title), icon = Icons.Filled.QrCode2, tint = V3Tone.Violet, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
        HorizontalDivider(color = HomeV3.Outline)
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = stringResource(R.string.profile_v3_qr_hint), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, modifier = Modifier.weight(1f))
            V3OutlinePill(text = stringResource(R.string.profile_v3_qr_title), icon = Icons.Filled.QrCode2, onClick = onShowQr)
        }
    }
}
