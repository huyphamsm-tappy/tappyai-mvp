package com.tappyai.app.games

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Games — the web's `/game` hub surfaces exactly one game today (SuperTux; the former native-canvas
 * mini-game grid was removed — `src/app/game/page.tsx`'s own code comment confirms this). The web
 * itself doesn't run SuperTux natively in the page either: it embeds it via
 * `<iframe src="/games/supertux">` (`SuperTuxView.tsx`) specifically because the Emscripten WASM
 * runtime needs COOP/COEP cross-origin isolation headers that route handler sets. Loading the exact
 * same URL in a WebView here is therefore matching the web's own architecture, not a shortcut
 * around building a native game — there is no native game to build parity with.
 */
@Composable
fun GamesScreen(onBack: () -> Unit) {
    var isLoading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var webView by remember { mutableStateOf<WebView?>(null) }

    BackHandler(enabled = webView?.canGoBack() == true) {
        webView?.goBack()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.padding(TappySpacing.xl).height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
            }
            Text(text = stringResource(R.string.games_title), style = MaterialTheme.typography.titleLarge)
        }

        Box(modifier = Modifier.fillMaxSize()) {
            if (loadFailed) {
                TappyErrorState(
                    title = stringResource(R.string.games_error_title),
                    message = stringResource(R.string.games_error_message),
                    // Re-entering the `else` branch below mounts a brand-new AndroidView, whose
                    // factory already calls loadUrl(...) — no need to (and must not) call
                    // reload() on `webView` here: the AndroidView backing the failed attempt was
                    // torn down (onRelease -> destroy()) when this branch took over, so `webView`
                    // is a reference to an already-destroyed WebView at this point.
                    onRetry = {
                        loadFailed = false
                        isLoading = true
                    },
                    modifier = Modifier.align(Alignment.Center).padding(TappySpacing.xl),
                )
            } else {
                SuperTuxWebView(
                    onWebViewReady = { webView = it },
                    onPageFinished = { isLoading = false },
                    onLoadError = { loadFailed = true; isLoading = false; webView = null },
                )
                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        TappyLoadingIndicator()
                    }
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun SuperTuxWebView(
    onWebViewReady: (WebView) -> Unit,
    onPageFinished: () -> Unit,
    onLoadError: () -> Unit,
) {
    val context = LocalContext.current
    val allowedHost = remember { Uri.parse(BuildConfig.WEB_APP_URL).host }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = {
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                // The Emscripten runtime needs both — WASM instantiation requires JS, and the
                // engine persists save state via localStorage, same as the web's own iframe origin.
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                // No local file: URLs are ever loaded here — defense-in-depth against a
                // same-origin page navigating the WebView into the device filesystem.
                settings.allowFileAccess = false
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val url = request?.url ?: return false
                        // Keep navigation confined to our own origin (SuperTux + same-origin
                        // assets); anything else (an outbound link inside the game, a redirect
                        // to a third party) is handed off to the system browser instead of
                        // silently loading inside this WebView.
                        if (url.host == allowedHost) return false
                        context.startActivity(Intent(Intent.ACTION_VIEW, url))
                        return true
                    }

                    override fun onPageFinished(view: WebView?, url: String?) = onPageFinished()

                    // The modern per-request overload (API 23+, well below this app's minSdk 26)
                    // replaces the deprecated 4-arg onReceivedError(WebView, Int, String, String):
                    // that overload's failing-URL comparison had to fall back to WebView.getUrl()
                    // (the currently-committed page) for an implicit "is this the main frame"
                    // check, which is timing-dependent and unreliable for in-game navigation
                    // failures. request.isForMainFrame is the direct, documented signal.
                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?,
                    ) {
                        if (request?.isForMainFrame == true) onLoadError()
                    }
                }
                loadUrl("${BuildConfig.WEB_APP_URL}/games/supertux")
                onWebViewReady(this)
            }
        },
        // WebView doesn't release its rendering process/memory on its own when the composable
        // leaves composition (a well-known Android leak footgun) — destroy() is required.
        onRelease = { it.destroy() },
    )
}
