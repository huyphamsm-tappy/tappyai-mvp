package com.tappyai.app.social

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3AccentPill
import com.tappyai.app.personal.V3Avatar
import com.tappyai.app.personal.V3ErrorLine
import com.tappyai.app.personal.V3GlyphTile
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3Panel
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.personal.V3UnderlineTabs
import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.app.social.data.ConnectionType
import com.tappyai.app.tools.ToolTextField
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Following / Followers — the web `/social` page (design/v3-phase4 `src/app/social/SocialView.tsx`
 * + `components/social/PersonCard.tsx`), native: the compact hero panel with its two real entry
 * points (find people → the search box, explore the community → Explore), the two underline tabs,
 * the person cards, then — stacked under the list at phone width, as the web does below `lg` —
 * the search panel, the quick actions and the connection counts.
 *
 * Signed-out (anonymous) sessions get the web's sign-in state instead of a page of buttons that
 * would each be refused.
 */
@Composable
fun SocialScreen(
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenExplore: () -> Unit,
    onSignIn: () -> Unit,
    viewModel: SocialViewModel = hiltViewModel(),
) {
    val focus = remember { FocusRequester() }
    var wantFocus by remember { mutableStateOf(false) }
    LaunchedEffect(wantFocus) { if (wantFocus) { runCatching { focus.requestFocus() }; wantFocus = false } }

    V3PersonalPage(
        title = stringResource(R.string.social_title),
        subtitle = stringResource(R.string.social_tagline),
        onBack = onBack,
    ) {
        when (viewModel.isSignedIn) {
            null -> V3Loading(height = 200.dp)
            false -> SignedOutState(onSignIn)
            true -> {
                // ── Hero: compact, two entry points that both do something ──
                V3Panel(padding = 20.dp) {
                    Text(text = stringResource(R.string.social_title), color = HomeV3.OnSurface, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Text(text = stringResource(R.string.social_tagline), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                    Column(modifier = Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        HeroEntry(Icons.Filled.PersonAdd, stringResource(R.string.social_hero_find), stringResource(R.string.social_hero_find_desc)) { wantFocus = true }
                        HeroEntry(Icons.Filled.Explore, stringResource(R.string.social_hero_explore), stringResource(R.string.social_hero_explore_desc), onOpenExplore)
                    }
                }

                // ── Tabs: two, because there are two directions in `user_follows` ──
                V3UnderlineTabs(
                    labels = listOf(stringResource(R.string.social_tab_following), stringResource(R.string.social_tab_followers)),
                    selected = if (viewModel.tab == ConnectionType.Following) 0 else 1,
                    onSelect = { viewModel.selectTab(if (it == 0) ConnectionType.Following else ConnectionType.Followers) },
                )

                // ── List ──
                val current = viewModel.current
                when {
                    viewModel.isLoading && current == null -> V3Loading()
                    viewModel.loadFailed && current == null -> V3ErrorLine(
                        message = stringResource(R.string.social_error),
                        retryText = stringResource(R.string.common_try_again),
                        onRetry = viewModel::retry,
                    )
                    current.isNullOrEmpty() -> Text(
                        text = stringResource(if (viewModel.tab == ConnectionType.Following) R.string.social_empty_following else R.string.social_empty_followers),
                        color = HomeV3.OnSurfaceVariant,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    )
                    else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        current.forEach { person ->
                            PersonCard(
                                person = person,
                                followsYou = viewModel.tab == ConnectionType.Followers,
                                busy = person.id in viewModel.busyIds,
                                failed = person.id in viewModel.failedIds,
                                onOpen = { onOpenProfile(person.id) },
                                onToggle = { viewModel.toggleFollow(person) },
                            )
                        }
                    }
                }

                // ── Search panel ──
                V3Panel {
                    Text(text = stringResource(R.string.social_search_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    ToolTextField(
                        value = viewModel.query,
                        onValueChange = viewModel::onQueryChange,
                        placeholder = stringResource(R.string.social_search_placeholder),
                        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp)) },
                        modifier = Modifier.padding(top = 12.dp).focusRequester(focus),
                        textSize = 13.sp,
                    )
                    Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val results = viewModel.results
                        when {
                            viewModel.query.trim().length < 2 -> Hint(stringResource(R.string.social_search_hint))
                            viewModel.isSearching -> V3Loading(height = 48.dp)
                            results.isNullOrEmpty() -> Hint(stringResource(R.string.social_search_empty))
                            else -> results.forEach { person ->
                                PersonCard(
                                    person = person,
                                    busy = person.id in viewModel.busyIds,
                                    failed = person.id in viewModel.failedIds,
                                    onOpen = { onOpenProfile(person.id) },
                                    onToggle = { viewModel.toggleFollow(person) },
                                )
                            }
                        }
                    }
                }

                // ── Quick actions: every row goes somewhere real ──
                V3Panel {
                    Text(text = stringResource(R.string.social_quick_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        QuickRow(Icons.Filled.Search, stringResource(R.string.social_quick_find), stringResource(R.string.social_quick_find_desc)) { wantFocus = true }
                        QuickRow(Icons.Filled.Group, stringResource(R.string.social_quick_followers), stringResource(R.string.social_quick_followers_desc)) { viewModel.selectTab(ConnectionType.Followers) }
                        QuickRow(Icons.Filled.PersonAdd, stringResource(R.string.social_quick_following), stringResource(R.string.social_quick_following_desc)) { viewModel.selectTab(ConnectionType.Following) }
                    }
                }

                // ── Counts: an em dash until the list has actually been read ──
                V3Panel {
                    Text(text = stringResource(R.string.social_stats_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatTile(viewModel.following?.size, stringResource(R.string.social_tab_following), Modifier.weight(1f))
                        StatTile(viewModel.followers?.size, stringResource(R.string.social_tab_followers), Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun SignedOutState(onSignIn: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(modifier = Modifier.size(56.dp).clip(CircleShape).background(HomeV3.SurfaceVariant), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Group, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(26.dp))
        }
        Text(text = stringResource(R.string.social_sign_in), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        V3AccentPill(text = stringResource(R.string.settings_sign_in), onClick = onSignIn)
    }
}

@Composable
private fun HeroEntry(icon: ImageVector, title: String, desc: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(HomeV3.SurfaceVariant)
            .border(1.dp, HomeV3.Outline, shape)
            .clickable(onClickLabel = title, onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        V3GlyphTile(icon, HomeV3.Purple, iconSize = 17.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(text = desc, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun QuickRow(icon: ImageVector, title: String, desc: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClickLabel = title, onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(HomeV3.SurfaceVariant), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = HomeV3.OnSurface, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            Text(text = desc, color = HomeV3.OnSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(15.dp))
    }
}

@Composable
private fun StatTile(value: Int?, label: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier.clip(shape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, shape).padding(12.dp),
    ) {
        Text(text = value?.toString() ?: "—", color = HomeV3.OnSurface, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        Text(text = label, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
    }
}

@Composable
private fun Hint(text: String) {
    Text(text = text, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
}

/**
 * One person, one consistent card (`PersonCard.tsx`): avatar or initial, the name, the real
 * follower count, "Theo dõi bạn" only in the Followers list, and the follow button whose label
 * is the server's answer. No handle — `profiles` has no username column. No mutual count.
 */
@Composable
internal fun PersonCard(
    person: UserSearchResult,
    onOpen: () -> Unit,
    onToggle: () -> Unit,
    followsYou: Boolean = false,
    busy: Boolean = false,
    failed: Boolean = false,
) {
    val name = person.fullName?.trim()?.takeIf { it.isNotEmpty() } ?: stringResource(R.string.social_unknown_user)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .border(1.dp, if (failed) V3Tone.Rose else HomeV3.Outline, V3PanelShape)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = stringResource(R.string.social_view_profile), onClick = onOpen),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            V3Avatar(url = person.avatarUrl, name = name, size = 44.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = name, color = HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(modifier = Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(text = stringResource(R.string.social_follower_count, person.followerCount), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
                    if (followsYou) {
                        Text(
                            text = stringResource(R.string.social_follows_you),
                            color = HomeV3.OnSurfaceVariant,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clip(CircleShape).background(HomeV3.SurfaceVariant).padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
            }
        }
        FollowButton(isFollowing = person.isFollowing, busy = busy, onClick = onToggle)
    }
}

@Composable
private fun FollowButton(isFollowing: Boolean, busy: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    val label = stringResource(if (isFollowing) R.string.social_following else R.string.social_follow)
    Row(
        modifier = Modifier
            .heightIn(min = 34.dp)
            .clip(shape)
            .background(if (isFollowing) HomeV3.SurfaceVariant else HomeV3.Purple)
            .then(if (isFollowing) Modifier.border(1.dp, HomeV3.Outline, shape) else Modifier)
            .clickable(enabled = !busy, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val fg = if (isFollowing) HomeV3.OnSurfaceVariant else Color.White
        when {
            busy -> CircularProgressIndicator(color = fg, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
            isFollowing -> Icon(Icons.Filled.Check, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
            else -> Icon(Icons.Filled.PersonAdd, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
        }
        Text(text = label, color = fg, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}
