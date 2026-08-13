package com.tappyai.app.reviews.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.tappyai.app.R
import com.tappyai.app.share.ShareAction
import com.tappyai.app.share.TappyShare
import com.tappyai.app.share.TappyShareActions

/**
 * Holds which review's share sheet is open.
 *
 * Both review surfaces — the feed pager and the detail screen — need the same three lines of state,
 * so it lives here rather than being duplicated (and drifting) in each.
 */
@Stable
internal class ReviewShareController {
    var reviewId by mutableStateOf<String?>(null)
        private set
    var isCopied by mutableStateOf(false)
        internal set

    fun open(reviewId: String) {
        this.reviewId = reviewId
        isCopied = false
    }

    fun dismiss() {
        reviewId = null
        isCopied = false
    }
}

@Composable
internal fun rememberReviewShareController(): ReviewShareController = remember { ReviewShareController() }

/**
 * Renders the share sheet when one is open, and performs the chosen target's action.
 *
 * The URL is always [TappyShare.reviewUrl] — the canonical public page, which is what carries the
 * Open Graph preview. Nothing here builds a URL, so a Blob object, a Cloud Storage object or an
 * internal route cannot reach another app: they fail the guard inside `TappyShareActions`.
 */
@Composable
internal fun ReviewShareHost(controller: ReviewShareController) {
    val context = LocalContext.current
    val reviewId = controller.reviewId ?: return
    val shareUrl = TappyShare.reviewUrl(reviewId)

    ReviewShareSheet(
        shareUrl = shareUrl,
        isCopied = controller.isCopied,
        onTarget = { target -> controller.isCopied = performShare(context, target, shareUrl) },
        onDismiss = { controller.dismiss() },
    )
}

/** Performs [target]'s action and returns whether the link was copied to the clipboard. */
private fun performShare(context: Context, target: TappyShare.Target, shareUrl: String): Boolean =
    when (val action = TappyShareActions.actionFor(target, shareUrl)) {
        is ShareAction.OpenUrl -> {
            // A missing browser must not crash the app; the sheet simply stays open.
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(action.url))) }
            false
        }

        is ShareAction.SystemShare -> {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, action.text)
            }
            // TikTok gets a chooser prompt naming it, because there is no direct handoff. If the app
            // is installed the OS may offer it — the user posts, TappyAI does not.
            val title = context.getString(
                if (target == TappyShare.Target.TIKTOK) {
                    R.string.reviews_share_tiktok_hint
                } else {
                    R.string.reviews_action_share
                },
            )
            runCatching { context.startActivity(Intent.createChooser(send, title)) }
            false
        }

        is ShareAction.CopyLink -> {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.setPrimaryClip(ClipData.newPlainText("TappyAI", action.url))
            clipboard != null
        }

        // The guard refused the URL. Doing nothing is correct — never hand out an unverified link.
        ShareAction.Unsupported -> false
    }
