package com.tappyai.app.share

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.chat.TappyPlan
import com.tappyai.app.share.card.PlanCardData
import com.tappyai.app.share.card.ShareCardFiles
import com.tappyai.app.share.card.ShareCardInput
import com.tappyai.app.share.card.ShareCardLayout
import com.tappyai.app.share.card.ShareCardLayouts
import com.tappyai.app.share.card.SharePostCard
import com.tappyai.app.share.card.ShareSheetVariant
import com.tappyai.app.share.card.planCardDataOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.util.Locale

/** The sheet's palette — sample #6 is the dark version; the sheet follows the app's light/dark. */
private data class SheetPalette(
    val bg: Color, val title: Color, val text: Color, val muted: Color, val border: Color, val tile: Color,
    val accent: Color, val link: Color, val chipOnBg: Color, val chipOffBg: Color, val chipOffText: Color,
    val copyBg: Color, val copyText: Color, val warn: Color, val error: Color,
)

private val DarkSheet = SheetPalette(
    bg = Color(0xFF111827), title = Color(0xFFF9FAFB), text = Color(0xFFF3F4F6), muted = Color(0xFF9CA3AF),
    border = Color(0x1AFFFFFF), tile = Color(0x08FFFFFF), accent = Color(0xFF7DD3FC), link = Color(0xFF7DD3FC),
    chipOnBg = Color(0xFF0EA5E9), chipOffBg = Color(0x0AFFFFFF), chipOffText = Color(0xFFF3F4F6),
    copyBg = Color(0x1AFFFFFF), copyText = Color(0xFFF9FAFB), warn = Color(0xFFFBBF24), error = Color(0xFFF87171),
)
private val LightSheet = SheetPalette(
    bg = Color(0xFFFFFFFF), title = Color(0xFF111827), text = Color(0xFF1F2937), muted = Color(0xFF6B7280),
    border = Color(0xFFE5E7EB), tile = Color(0xFFF9FAFB), accent = Color(0xFF2563EB), link = Color(0xFF2563EB),
    chipOnBg = Color(0xFF2563EB), chipOffBg = Color(0xFFFFFFFF), chipOffText = Color(0xFF374151),
    copyBg = Color(0xFFEFF6FF), copyText = Color(0xFF1D4ED8), warn = Color(0xFFD97706), error = Color(0xFFDC2626),
)

/** The link-mint state of a plan share (SL1): minting, or why there is no link. */
private enum class PlanLink { NONE, PENDING, READY, SIGN_IN, FAILED }

/**
 * THE share sheet — sample #6 "Chia sẻ với mọi người" (owner picks 29/09; web `ShareMenu`'s approved
 * sheet). Used for the profile, an Explore post, a chat suggestion and a chat plan (SL1).
 *
 * 🔑 ONE FILE. The "Ảnh chia sẻ" preview is the rendered card FILE of the chosen layout; "Lưu về
 * máy" saves that same file and TikTok receives it ([ShareCardFiles]). Exception (28/09): an
 * UPLOADED clip goes to TikTok as its own video ([clipVideo]); no video → the chosen card.
 *
 * 🔑 A PLAN SHARES ITS PUBLISHED PAGE. The sheet mints `/plan/<id>` on open; while it mints every
 * target waits; if it cannot (sign-in / failure) the sheet says so, offers a retry, keeps the text
 * shares and disables only the apps that need the link (Facebook, Zalo, Messenger, TikTok) — web
 * `needsLink`.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TappyShareSheet(
    artifact: ShareArtifact,
    onDismiss: () -> Unit,
    /** G1: when provided, a "Public link" row opens the sanitized-preview flow for a /r/<slug> page. */
    onPublicLink: (() -> Unit)? = null,
    variant: ShareSheetVariant = defaultVariantOf(artifact),
    /** The name on the link card ("Huy Pham · TappyAI") and on the TappyAI QR card. */
    displayName: String? = null,
    /** An Explore post's public fields (POST variant). */
    post: SharePostCard? = null,
    /** The plan being shared (PLAN variant) — drawn as the sample #7 image. */
    plan: TappyPlan? = null,
    /** An uploaded clip's own video for TikTok (POST variant); null → the card. */
    clipVideo: (suspend () -> Uri?)? = null,
    /** "Ứng dụng khác": the caller's system share (an Explore post shares its media); null → the card + text. */
    onNativeShare: (() -> Unit)? = null,
    /** A completed share through `channel` (web `onShared`) — e.g. the profile's "Đã share" history. */
    onShared: ((channel: String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lang = Locale.getDefault().language
    val pal = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) DarkSheet else LightSheet

    // ── Plan link (SL1) ──
    val isPlan = artifact.kind == ShareArtifact.Kind.PLAN
    val planVm: PlanShareViewModel? = if (isPlan) hiltViewModel() else null
    val planState by (planVm?.state ?: remember { MutableStateFlow<PlanShareState>(PlanShareState.Idle) }).collectAsState()
    LaunchedEffect(artifact.planJson) { planVm?.publish(artifact.planJson) }
    DisposableEffect(planVm) { onDispose { planVm?.reset() } }
    val ready = (planState as? PlanShareState.Ready)?.link
    val failed = planState as? PlanShareState.Failed
    val planLink = when {
        !isPlan -> PlanLink.NONE
        ready != null -> PlanLink.READY
        failed?.outcome == PlanShareOutcome.SignInRequired -> PlanLink.SIGN_IN
        failed != null -> PlanLink.FAILED
        else -> PlanLink.PENDING
    }
    // What actually leaves: the link artifact for a published plan, the artifact as built otherwise.
    val a: ShareArtifact = if (isPlan && ready != null) ShareArtifactBuilder.planLinkArtifact(artifact, ready.url) else artifact
    val linkPending = planLink == PlanLink.PENDING
    val planUnlinked = planLink == PlanLink.SIGN_IN || planLink == PlanLink.FAILED
    fun needsLink(t: TappyShare.Target) = planUnlinked && t in LINK_ONLY_TARGETS

    // ── The card file (ONE file per layout + link) ──
    val planData: PlanCardData? = remember(plan) { plan?.let(::planCardDataOf) }
    val layouts = remember(variant, artifact, post, planData) { ShareCardLayouts.of(variant, artifact, post, planData) }
    var layout by remember(layouts) { mutableStateOf(layouts.first()) }
    val files = remember { ShareCardFiles(context.applicationContext, BuildConfig.WEB_APP_URL) }
    var card by remember { mutableStateOf<ShareCardFiles.Card?>(null) }
    var cardFailed by remember { mutableStateOf(false) }
    LaunchedEffect(layout, a.url, linkPending) {
        card = null
        cardFailed = false
        // A plan's card carries its link: wait for the mint (or its failure).
        if (linkPending) return@LaunchedEffect
        val got = files.get(ShareCardInput(a, layout, displayName ?: a.subject, post, planData))
        card = got
        cardFailed = got == null
    }

    fun toast(msg: String) = Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
    fun label(t: TappyShare.Target) = context.getString(labelRes(t))
    fun report(r: ShareDelivery.Result, channel: String) {
        val msg = when (r) {
            is ShareDelivery.Result.OpenedApp -> context.getString(R.string.share_opened_with_text, label(r.target))
            is ShareDelivery.Result.NotInstalledCopied -> context.getString(R.string.share_app_not_opened, label(r.target))
            is ShareDelivery.Result.CopiedAndOpenedDialog -> context.getString(R.string.share_copied_and_opened, label(r.target))
            is ShareDelivery.Result.OpenedEmail -> if (r.ok) context.getString(R.string.share_email_opened) else context.getString(R.string.share_copied_content)
            ShareDelivery.Result.Copied -> context.getString(if (copiesLink(variant, a)) R.string.share_copied_link else R.string.share_copied_content)
            ShareDelivery.Result.CopyFailed -> context.getString(R.string.share_copy_failed)
            is ShareDelivery.Result.Saved -> context.getString(if (r.image) R.string.share_v6_saved_card else R.string.share_saved_text)
            ShareDelivery.Result.SaveFailed -> context.getString(R.string.share_save_failed)
            ShareDelivery.Result.OpenedInbox -> context.getString(R.string.share_inbox_opened)
            ShareDelivery.Result.OpenedSystemSheet -> null
        }
        val completed = r !is ShareDelivery.Result.CopyFailed && r !is ShareDelivery.Result.SaveFailed && r !is ShareDelivery.Result.NotInstalledCopied
        if (completed) onShared?.invoke(channel)
        msg?.let(::toast)
    }
    fun cardUri(): Uri? = card?.file?.let { runCatching { FileProvider.getUriForFile(context, "${context.packageName}.share", it) }.getOrNull() }

    fun handle(t: TappyShare.Target) {
        if (linkPending || needsLink(t)) return
        // A published plan is a LINK: the page carries the photos, so no rendered image rides along.
        val imageUri = if (a.isPlanLink) null else cardUri()
        val r = when (t) {
            TappyShare.Target.MESSENGER, TappyShare.Target.ZALO, TappyShare.Target.WHATSAPP,
            TappyShare.Target.TELEGRAM, TappyShare.Target.VIBER, TappyShare.Target.LINE ->
                ShareDelivery.toApp(context, t, a, imageUri, lang)
            TappyShare.Target.FACEBOOK -> ShareDelivery.toDialog(context, t, a)
            TappyShare.Target.TIKTOK -> {
                scope.launch {
                    // An uploaded clip's own video first; else THE card file of the chosen layout.
                    val video = clipVideo?.invoke()
                    val caption = TikTokHandoff.caption(a.subject, a.url)
                    if (video != null) {
                        report(ShareDelivery.toTikTok(context, video, "video/mp4", caption, context.getString(R.string.share_title)), "tiktok")
                        return@launch
                    }
                    val uri = cardUri()
                    if (uri == null) {
                        toast(context.getString(if (cardFailed) R.string.share_v6_card_failed else R.string.share_image_preparing))
                        return@launch
                    }
                    report(ShareDelivery.toTikTok(context, uri, "image/png", caption, context.getString(R.string.share_title)), "tiktok")
                }
                return
            }
            TappyShare.Target.EMAIL -> ShareDelivery.toEmail(context, a, lang)
            TappyShare.Target.INBOX -> ShareDelivery.toInbox(context, a, lang)
            // THE card file, byte for byte; no card → the text file as before.
            TappyShare.Target.SAVE -> card?.let { saveCardFile(context, it.file, ShareCardLayouts.fileName(it.layout)) } ?: ShareDelivery.save(context, a, null)
            // A profile / post copies its link; a published plan its canonical URL; a suggestion its content.
            TappyShare.Target.COPY -> ShareDelivery.copy(context, if (variant == ShareSheetVariant.PROFILE || variant == ShareSheetVariant.POST) a.url else if (a.isPlanLink) a.url else a.text)
            TappyShare.Target.NATIVE -> onNativeShare?.let { it(); ShareDelivery.Result.OpenedSystemSheet }
                ?: ShareDelivery.toSystem(context, a, imageUri, context.getString(R.string.share_title))
        }
        report(r, t.id)
        if (t == TappyShare.Target.NATIVE) onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = pal.bg,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp)
                .testTag("share-sheet-v6"),
        ) {
            // ── Header ──
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.share_v6_title), color = pal.title, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                    Text(stringResource(R.string.share_v6_subtitle), color = pal.link, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
                }
                Icon(
                    Icons.Filled.Close, contentDescription = stringResource(R.string.share_v6_close), tint = pal.muted,
                    modifier = Modifier.clip(CircleShape).clickable(onClick = onDismiss).padding(6.dp).size(20.dp),
                )
            }
            Spacer(Modifier.height(16.dp))

            // ── The TappyAI card over the link card — one bordered block ──
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, pal.border, RoundedCornerShape(16.dp))) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.share_otter_mark), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(48.dp).clip(CircleShape))
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text("TappyAI", color = pal.title, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text(stringResource(R.string.share_card_tagline), color = pal.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = pal.muted)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(pal.border))
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        val name = displayName ?: a.subject.takeIf { variant == ShareSheetVariant.SUGGESTION || variant == ShareSheetVariant.PLAN }
                        Text(if (!name.isNullOrBlank()) "$name · TappyAI" else "TappyAI", color = pal.title, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(stringResource(lineRes(variant)), color = pal.muted, fontSize = 13.sp)
                        Text(a.url, color = pal.link, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.testTag("share-link-url"))
                    }
                    Row(
                        Modifier.padding(start = 8.dp).clip(RoundedCornerShape(50)).background(pal.copyBg)
                            .clickable(enabled = !linkPending) { handle(TappyShare.Target.COPY) }
                            .alpha(if (linkPending) 0.5f else 1f)
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                            .testTag("share-copy"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = null, tint = pal.copyText, modifier = Modifier.size(16.dp))
                        Text(
                            stringResource(if (copiesLink(variant, a)) R.string.share_v6_copy_link else R.string.share_v6_copy_content),
                            color = pal.copyText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
                // SL1: the chat plan's link states live here, under the link card.
                val statusMod = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp)
                when (planLink) {
                    PlanLink.PENDING -> Text(stringResource(R.string.share_v6_plan_link_pending), color = pal.muted, fontSize = 12.sp, modifier = statusMod.testTag("share-plan-preparing"))
                    PlanLink.SIGN_IN -> Text(stringResource(R.string.share_v6_plan_link_sign_in), color = pal.warn, fontSize = 12.sp, modifier = statusMod.testTag("share-plan-sign-in"))
                    PlanLink.FAILED -> Row(statusMod.testTag("share-plan-failed"), verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.share_v6_plan_link_failed), color = pal.error, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(
                            stringResource(R.string.share_plan_retry), color = pal.error, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(start = 8.dp).border(1.dp, pal.error, RoundedCornerShape(6.dp)).clickable { planVm?.retry() }
                                .padding(horizontal = 8.dp, vertical = 2.dp).testTag("share-plan-retry"),
                        )
                    }
                    else -> Unit
                }
            }
            Spacer(Modifier.height(20.dp))

            // ── "Ảnh chia sẻ": layout selector + THE rendered file ──
            Text(stringResource(R.string.share_v6_card_title), color = pal.title, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            if (layouts.size > 1) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 10.dp)) {
                    layouts.forEach { l ->
                        val on = l == layout
                        Text(
                            stringResource(layoutRes(l)), color = if (on) Color.White else pal.chipOffText, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) pal.chipOnBg else pal.chipOffBg)
                                .border(1.dp, if (on) pal.chipOnBg else pal.border, RoundedCornerShape(50))
                                .semantics { selected = on }
                                .clickable(role = Role.RadioButton) { layout = l }
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                                .testTag("share-layout-${l.fileTag}"),
                        )
                    }
                }
            }
            Box(
                Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, pal.border, RoundedCornerShape(16.dp)).background(pal.tile),
                contentAlignment = Alignment.Center,
            ) {
                val c = card
                if (c != null) {
                    Image(
                        c.bitmap.asImageBitmap(), contentDescription = stringResource(layoutRes(c.layout)), contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxHeight().testTag("share-card-preview-${c.layout.fileTag}"),
                    )
                } else {
                    Text(
                        stringResource(if (cardFailed) R.string.share_v6_card_failed else R.string.share_v6_card_loading),
                        color = pal.muted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(16.dp),
                    )
                }
            }
            Text(stringResource(R.string.share_v6_card_hint), color = pal.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(20.dp))

            // ── Quick apps: 4 columns, web order ──
            Text(stringResource(R.string.share_v6_quick), color = pal.title, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            SHEET_APPS.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { t ->
                        val disabled = linkPending || needsLink(t)
                        Column(
                            Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).border(1.dp, pal.border, RoundedCornerShape(16.dp)).background(pal.tile)
                                .clickable(enabled = !disabled) { handle(t) }.alpha(if (disabled) 0.6f else 1f)
                                .padding(horizontal = 4.dp, vertical = 12.dp).testTag("share-target-${t.id}"),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            val logo = brandLogo(t)
                            if (logo != null) {
                                Image(painterResource(logo), contentDescription = null, modifier = Modifier.size(40.dp))
                            } else {
                                Box(Modifier.size(40.dp).clip(CircleShape).background(pal.copyBg), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Filled.Email, contentDescription = null, tint = pal.text, modifier = Modifier.size(18.dp))
                                }
                            }
                            val lbl = if (t == TappyShare.Target.TIKTOK) stringResource(if (clipVideo != null) R.string.share_v6_tiktok_video else R.string.share_v6_tiktok_image) else label(t)
                            Text(lbl, color = pal.text, fontSize = 12.sp, textAlign = TextAlign.Center, lineHeight = 14.sp, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            if (planUnlinked) Text(stringResource(R.string.share_v6_plan_link_required), color = pal.muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
            Spacer(Modifier.height(12.dp))

            // ── More options ──
            Text(stringResource(R.string.share_v6_other), color = pal.title, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            OptionRow(pal, Icons.Filled.Inbox, Color(0xFFF97316), stringResource(R.string.share_v6_inbox), stringResource(R.string.share_v6_inbox_desc), !linkPending, "share-target-inbox") { handle(TappyShare.Target.INBOX) }
            if (onPublicLink != null) {
                OptionRow(pal, Icons.Filled.Link, pal.accent, stringResource(R.string.chat_share_public_link), stringResource(R.string.share_v6_public_desc), !linkPending, "share-public-link") { onPublicLink() }
            }
            OptionRow(pal, Icons.Filled.Download, pal.text, stringResource(R.string.share_v6_save), stringResource(R.string.share_v6_save_desc), !linkPending, "share-target-save") { handle(TappyShare.Target.SAVE) }
            OptionRow(pal, Icons.Filled.Share, pal.text, stringResource(R.string.share_v6_more), stringResource(R.string.share_v6_more_desc), !linkPending, "share-target-native") { handle(TappyShare.Target.NATIVE) }
            Spacer(Modifier.height(12.dp))

            // ── Banner ──
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(Brush.horizontalGradient(listOf(Color(0xFF1D4ED8), Color(0xFF2563EB), Color(0xFF0EA5E9))))
                    .padding(start = 8.dp, top = 8.dp, bottom = 8.dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(painterResource(R.drawable.tappy_wave), contentDescription = null, modifier = Modifier.size(84.dp))
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(stringResource(R.string.share_v6_banner_title), color = Color.White, fontSize = 14.5.sp, fontWeight = FontWeight.Bold, lineHeight = 18.sp)
                    Text(stringResource(R.string.share_v6_banner_sub), color = Color(0xFFE0F2FE), fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                }
                Box(Modifier.size(36.dp).clip(CircleShape).background(Color(0x33FFFFFF)), contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun OptionRow(pal: SheetPalette, icon: ImageVector, iconTint: Color, label: String, desc: String, enabled: Boolean, tag: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, pal.border, RoundedCornerShape(16.dp)).background(pal.tile)
            .clickable(enabled = enabled, onClick = onClick).alpha(if (enabled) 1f else 0.6f).padding(horizontal = 16.dp, vertical = 12.dp).testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) { Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(24.dp)) }
        Column(Modifier.weight(1f).padding(horizontal = 16.dp)) {
            Text(label, color = pal.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(desc, color = pal.muted, fontSize = 13.sp)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = pal.muted)
    }
}

/** The quick-app grid, in the web's mobile order. */
internal val SHEET_APPS = listOf(
    TappyShare.Target.FACEBOOK, TappyShare.Target.MESSENGER, TappyShare.Target.ZALO, TappyShare.Target.WHATSAPP,
    TappyShare.Target.TELEGRAM, TappyShare.Target.VIBER, TappyShare.Target.LINE, TappyShare.Target.TIKTOK, TappyShare.Target.EMAIL,
)

/** Web `needsLink`: without the plan's link these apps have nothing to carry. */
internal val LINK_ONLY_TARGETS = setOf(TappyShare.Target.FACEBOOK, TappyShare.Target.ZALO, TappyShare.Target.MESSENGER, TappyShare.Target.TIKTOK)

/** Web: a recommendation opens the approved sheet with its own card; a plan with the plan image. */
fun defaultVariantOf(a: ShareArtifact): ShareSheetVariant = when {
    a.kind == ShareArtifact.Kind.PLACES && a.places.isNotEmpty() -> ShareSheetVariant.SUGGESTION
    a.kind == ShareArtifact.Kind.PLAN -> ShareSheetVariant.PLAN
    else -> ShareSheetVariant.DEFAULT
}

/** The copy button copies the LINK for a profile / post / published plan, the CONTENT otherwise. */
internal fun copiesLink(variant: ShareSheetVariant, a: ShareArtifact): Boolean =
    a.isPlanLink || variant == ShareSheetVariant.PROFILE || variant == ShareSheetVariant.POST

private fun lineRes(v: ShareSheetVariant) = when (v) {
    ShareSheetVariant.POST -> R.string.share_v6_line_post
    ShareSheetVariant.SUGGESTION -> R.string.share_v6_line_suggestion
    ShareSheetVariant.PLAN -> R.string.share_v6_line_plan
    else -> R.string.share_v6_line_profile
}

private fun layoutRes(l: ShareCardLayout) = when (l) {
    ShareCardLayout.REVIEW -> R.string.share_v6_layout_review
    ShareCardLayout.CLIP -> R.string.share_v6_layout_clip
    ShareCardLayout.POST -> R.string.share_v6_layout_post
    ShareCardLayout.PROFILE -> R.string.share_v6_layout_profile
    ShareCardLayout.SUGGESTION -> R.string.share_v6_layout_suggestion
    ShareCardLayout.PLAN -> R.string.share_v6_layout_plan
    ShareCardLayout.DEFAULT -> R.string.share_v6_layout_default
}

private fun brandLogo(t: TappyShare.Target): Int? = when (t) {
    TappyShare.Target.FACEBOOK -> R.drawable.share_brand_facebook
    TappyShare.Target.MESSENGER -> R.drawable.share_brand_messenger
    TappyShare.Target.ZALO -> R.drawable.share_brand_zalo
    TappyShare.Target.WHATSAPP -> R.drawable.share_brand_whatsapp
    TappyShare.Target.TELEGRAM -> R.drawable.share_brand_telegram
    TappyShare.Target.VIBER -> R.drawable.share_brand_viber
    TappyShare.Target.LINE -> R.drawable.share_brand_line
    TappyShare.Target.TIKTOK -> R.drawable.share_brand_tiktok
    else -> null
}

internal fun labelRes(t: TappyShare.Target): Int = when (t) {
    TappyShare.Target.FACEBOOK -> R.string.share_facebook
    TappyShare.Target.MESSENGER -> R.string.share_messenger
    TappyShare.Target.ZALO -> R.string.share_zalo
    TappyShare.Target.WHATSAPP -> R.string.share_whatsapp
    TappyShare.Target.TELEGRAM -> R.string.share_telegram
    TappyShare.Target.VIBER -> R.string.share_viber
    TappyShare.Target.LINE -> R.string.share_line
    TappyShare.Target.TIKTOK -> R.string.share_tiktok
    TappyShare.Target.EMAIL -> R.string.share_email
    TappyShare.Target.INBOX -> R.string.share_inbox
    TappyShare.Target.SAVE -> R.string.share_save
    TappyShare.Target.COPY -> R.string.share_copy_content
    TappyShare.Target.NATIVE -> R.string.share_more
}

/** "Lưu về máy": THE card file, byte for byte, into Pictures/TappyAI under its layout's name. */
private fun saveCardFile(context: Context, file: File, displayName: String): ShareDelivery.Result = try {
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/TappyAI")
    }
    val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
    if (uri == null) {
        ShareDelivery.Result.SaveFailed
    } else {
        context.contentResolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
        ShareDelivery.Result.Saved(image = true, uri = uri)
    }
} catch (_: Exception) {
    ShareDelivery.Result.SaveFailed
}
