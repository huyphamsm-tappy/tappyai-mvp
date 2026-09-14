package com.tappyai.app.share

import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Image
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing
import androidx.compose.ui.platform.testTag
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext
import java.util.Locale

private val SheetBackground = Color(0xFF1A1A1A)
private val SheetTitle = Color(0xFFFFFFFF)
private val Muted = Color(0xFF9CA3AF)
private val Panel = Color(0xFF2A2A2A)
private val LinkBlue = Color(0xFF8FB8FF)
private val Warn = Color(0xFFFBBF24)

/**
 * The TappyAI share sheet for a recommendation or plan — the generalisation of
 * `ReviewShareSheet`, which stays as-is for reviews.
 *
 * One [ShareArtifact] in; the preview at the top is rendered FROM it, so the user
 * sees exactly what leaves. Each target's toast says what actually happened
 * (see [ShareDelivery.Result]); nothing here says "sent".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TappyShareSheet(
    artifact: ShareArtifact,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val lang = Locale.getDefault().language
    var bitmap by remember(artifact) { mutableStateOf<Bitmap?>(null) }
    // Rendered off the main thread; a failure leaves it null and every target still works.
    LaunchedEffect(artifact) {
        bitmap = withContext(Dispatchers.Default) { ShareImageRenderer.render(context, artifact) }
    }

    // ── A PLAN SHARES ITS PUBLISHED PAGE, NEVER THE TEXT ──────────────────────────────
    //
    // The sheet publishes the plan block on open (POST /api/plans/share, under the session)
    // and, once the server answers with the id, every target delivers the canonical
    // `/plan/<shareId>` — the same Tappy Plan brochure a web share opens. Until then the
    // targets wait behind "preparing"; if publishing fails the sheet says why and offers a
    // retry. It never quietly sends the text brochure instead: that would tell the recipient
    // a page exists when it does not, or give them a homepage where a plan was promised.
    val isPlan = artifact.kind == ShareArtifact.Kind.PLAN
    val planVm: PlanShareViewModel? = if (isPlan) hiltViewModel() else null
    val planState by (planVm?.state ?: remember { MutableStateFlow<PlanShareState>(PlanShareState.Idle) }).collectAsState()
    LaunchedEffect(artifact.planJson) { planVm?.publish(artifact.planJson) }
    DisposableEffect(planVm) { onDispose { planVm?.reset() } }
    val ready = (planState as? PlanShareState.Ready)?.link
    // What actually leaves: the link artifact for a published plan, the artifact as built otherwise.
    val a: ShareArtifact = if (isPlan && ready != null) ShareArtifactBuilder.planLinkArtifact(artifact, ready.url) else artifact
    val targetsEnabled = !isPlan || ready != null

    fun toast(msg: String) = Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
    fun label(t: TappyShare.Target) = context.getString(labelRes(t))
    fun report(r: ShareDelivery.Result) {
        val msg = when (r) {
            is ShareDelivery.Result.OpenedApp -> context.getString(R.string.share_opened_with_text, label(r.target))
            is ShareDelivery.Result.NotInstalledCopied -> context.getString(R.string.share_app_not_opened, label(r.target))
            is ShareDelivery.Result.CopiedAndOpenedDialog -> context.getString(R.string.share_copied_and_opened, label(r.target))
            is ShareDelivery.Result.OpenedEmail -> if (r.ok) context.getString(R.string.share_email_opened) else context.getString(R.string.share_copied_content)
            ShareDelivery.Result.Copied -> context.getString(if (a.isPlanLink) R.string.share_copied_link else R.string.share_copied_content)
            ShareDelivery.Result.CopyFailed -> context.getString(R.string.share_copy_failed)
            is ShareDelivery.Result.Saved -> if (r.image) context.getString(R.string.share_saved_image) else context.getString(R.string.share_saved_text)
            ShareDelivery.Result.SaveFailed -> context.getString(R.string.share_save_failed)
            ShareDelivery.Result.OpenedInbox -> context.getString(R.string.share_inbox_opened)
            ShareDelivery.Result.OpenedSystemSheet -> return
        }
        toast(msg)
    }

    fun handle(t: TappyShare.Target) {
        if (!targetsEnabled) return
        // A published plan is a LINK: the page carries the photos, so no rendered image rides along.
        val imageUri = if (a.isPlanLink) null else bitmap?.let { ShareDelivery.imageUriFor(context, it) }
        val r = when (t) {
            // Direct handoff: the brochure (or the plan link) lands inside the app's own compose UI.
            TappyShare.Target.MESSENGER, TappyShare.Target.ZALO, TappyShare.Target.WHATSAPP,
            TappyShare.Target.TELEGRAM, TappyShare.Target.VIBER, TappyShare.Target.LINE ->
                ShareDelivery.toApp(context, t, a, imageUri, lang)
            // Facebook is the sharer dialog with the artifact's url — the brand url for a
            // recommendation, the plan's own page for a published plan — same as web.
            TappyShare.Target.FACEBOOK -> ShareDelivery.toDialog(context, t, a)
            TappyShare.Target.TIKTOK -> ShareDelivery.copy(context, a.text).let { ShareDelivery.Result.NotInstalledCopied(t) }
            TappyShare.Target.EMAIL -> ShareDelivery.toEmail(context, a, lang)
            TappyShare.Target.INBOX -> ShareDelivery.toInbox(context, a, lang)
            TappyShare.Target.SAVE -> ShareDelivery.save(context, a, bitmap)
            // Copy link for a published plan — the exact canonical URL, nothing around it.
            TappyShare.Target.COPY -> ShareDelivery.copy(context, if (a.isPlanLink) a.url else a.text)
            TappyShare.Target.NATIVE -> ShareDelivery.toSystem(context, a, imageUri, context.getString(R.string.share_title))
        }
        report(r)
        if (t == TappyShare.Target.NATIVE) onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = SheetBackground,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = TappySpacing.xl)
                .padding(bottom = TappySpacing.huge),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Text(stringResource(R.string.share_title), color = SheetTitle, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)

            // Preview — from the artifact, and the rendered image when it exists.
            Column(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Panel).padding(TappySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    // The launcher icon is an ADAPTIVE icon (XML): Compose's painterResource
                    // rejects it at runtime (UAT crash), so it is rasterised the same way
                    // ShareImageRenderer does. Null (should never happen) simply drops the mark.
                    val logo = remember {
                        runCatching { ContextCompat.getDrawable(context, R.mipmap.ic_launcher)?.toBitmap(96, 96)?.asImageBitmap() }.getOrNull()
                    }
                    logo?.let { Image(bitmap = it, contentDescription = null, modifier = Modifier.size(22.dp).clip(RoundedCornerShape(6.dp))) }
                    Text("TappyAI", color = SheetTitle, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text("· " + stringResource(R.string.share_preview_from), color = Muted, fontSize = 12.sp)
                }
                Text(artifact.subject, color = SheetTitle, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                bitmap?.let {
                    Image(bitmap = it.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp).clip(RoundedCornerShape(8.dp)))
                }
                artifact.places.take(3).forEachIndexed { i, p ->
                    Text(
                        buildString {
                            append("${i + 1}. ${p.name}")
                            p.rating?.let { append("  ★ $it") }
                            p.address?.let { append("  ·  $it") }
                        },
                        color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                if (artifact.places.size > 3) {
                    Text(context.getString(R.string.share_more_places, artifact.places.size - 3), color = Muted, fontSize = 12.sp)
                }
                // The plan's link, once it exists: this is what every target below carries.
                ready?.let { link ->
                    Text(link.url.removePrefix("https://"), color = LinkBlue, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.testTag("share-plan-link"))
                }
            }

            // Plan link status: preparing, or a truthful reason there is no link yet.
            if (isPlan) PlanLinkStatus(planState, onRetry = { planVm?.retry() })

            // The messaging apps, in the contract's order; the actions follow as rows.
            val apps = TappyShare.targets.takeWhile { it != TappyShare.Target.INBOX }
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                items(apps) { t -> TargetTile(t, enabled = targetsEnabled, onClick = { handle(t) }) }
            }

            RowAction(Icons.Filled.Inbox, stringResource(R.string.share_inbox), enabled = targetsEnabled) { handle(TappyShare.Target.INBOX) }
            // A published plan lives on its page; there is nothing to save to the device.
            if (!a.isPlanLink) RowAction(Icons.Filled.Download, stringResource(R.string.share_save), enabled = targetsEnabled) { handle(TappyShare.Target.SAVE) }
            RowAction(
                Icons.Filled.ContentCopy,
                stringResource(if (a.isPlanLink) R.string.share_copy_link else R.string.share_copy_content),
                enabled = targetsEnabled,
                tag = "share-copy",
            ) { handle(TappyShare.Target.COPY) }
            RowAction(Icons.Filled.Share, stringResource(R.string.share_more), enabled = targetsEnabled) { handle(TappyShare.Target.NATIVE) }
        }
    }
}

/**
 * The plan link's state, said plainly. Preparing keeps the targets waiting; a failure names
 * its reason and offers a retry (sign-in has its own line and no retry — it would fail again).
 */
@Composable
private fun PlanLinkStatus(state: PlanShareState, onRetry: () -> Unit) {
    when (state) {
        PlanShareState.Idle, is PlanShareState.Preparing -> Row(
            modifier = Modifier.fillMaxWidth().testTag("share-plan-preparing"),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = LinkBlue)
            Text(stringResource(R.string.share_plan_preparing), color = Muted, fontSize = 12.sp)
        }
        is PlanShareState.Ready -> Unit
        is PlanShareState.Failed -> {
            val (msgRes, retryable) = when (state.outcome) {
                PlanShareOutcome.SignInRequired -> R.string.share_plan_sign_in to false
                PlanShareOutcome.Offline -> R.string.share_plan_offline to true
                PlanShareOutcome.NotShareable -> R.string.share_plan_not_shareable to false
                PlanShareOutcome.NoPlanPayload -> R.string.share_plan_no_payload to false
                PlanShareOutcome.Failed, is PlanShareOutcome.Link -> R.string.share_plan_failed to true
            }
            Column(modifier = Modifier.fillMaxWidth().testTag("share-plan-failed"), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                Text(stringResource(msgRes), color = Warn, fontSize = 12.sp)
                if (retryable) {
                    Text(
                        stringResource(R.string.share_plan_retry), color = LinkBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onRetry).padding(vertical = TappySpacing.xs).testTag("share-plan-retry"),
                    )
                }
            }
        }
    }
}

private fun labelRes(t: TappyShare.Target): Int = when (t) {
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

private fun tint(t: TappyShare.Target): Color = when (t) {
    TappyShare.Target.FACEBOOK -> Color(0xFF1877F2)
    TappyShare.Target.MESSENGER -> Color(0xFF0084FF)
    TappyShare.Target.ZALO -> Color(0xFF0068FF)
    TappyShare.Target.WHATSAPP -> Color(0xFF25D366)
    TappyShare.Target.TELEGRAM -> Color(0xFF26A5E4)
    TappyShare.Target.VIBER -> Color(0xFF7360F2)
    TappyShare.Target.LINE -> Color(0xFF06C755)
    TappyShare.Target.TIKTOK -> Color(0xFF010101)
    TappyShare.Target.EMAIL -> Color(0xFFEA4335)
    else -> Color(0xFF6B7280)
}

@Composable
private fun TargetTile(t: TappyShare.Target, enabled: Boolean = true, onClick: () -> Unit) {
    val label = stringResource(labelRes(t))
    Column(
        modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled, onClick = onClick).padding(vertical = TappySpacing.md).alpha(if (enabled) 1f else 0.4f).testTag("share-target-${t.id}"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Box(modifier = Modifier.size(44.dp).clip(CircleShape).background(tint(t)), contentAlignment = Alignment.Center) {
            if (t == TappyShare.Target.EMAIL) Icon(Icons.Filled.Email, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            else Text(label.take(1), color = Color.White, fontWeight = FontWeight.Bold)
        }
        Text(label, color = SheetTitle, fontSize = 11.sp, textAlign = TextAlign.Center, maxLines = 2)
    }
}

@Composable
private fun RowAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, enabled: Boolean = true, tag: String? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Panel).clickable(enabled = enabled, onClick = onClick).padding(TappySpacing.lg)
            .alpha(if (enabled) 1f else 0.4f).then(if (tag != null) Modifier.testTag(tag) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Icon(icon, contentDescription = null, tint = Muted, modifier = Modifier.size(18.dp))
        Text(label, color = SheetTitle, fontSize = 14.sp)
    }
}
