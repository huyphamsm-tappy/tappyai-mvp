package com.tappyai.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.tappyai.app.navigation.AppNavHost
import com.tappyai.app.navigation.AppNavHostViewModel
import com.tappyai.core.designsystem.theme.TappyAITheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Phase 1B: hosts the real [AppNavHost] instead of directly rendering the Design System
 * Showcase (Phase 0/0.5's scaffold, now just one destination reached through it).
 * `@AndroidEntryPoint` makes `hiltViewModel()` available to Composables hosted here.
 *
 * Extends [AppCompatActivity] (not the plain `ComponentActivity` Compose apps default to)
 * specifically because [androidx.appcompat.app.AppCompatDelegate.setApplicationLocales] — the
 * per-app language switch [com.tappyai.app.language.LanguageManager] calls — is a silent no-op
 * without at least one live `AppCompatDelegate`, which only a real `AppCompatActivity` creates.
 * Confirmed live: with a plain `ComponentActivity`, selecting a language in Settings updated
 * local UI state but never changed `AppCompatDelegate.getApplicationLocales()` or survived an
 * app relaunch, while the OS's own `LocaleManager` (`cmd locale set-app-locales`) worked fine —
 * proving the string resources themselves were correct and the gap was purely this Activity's
 * missing AppCompat delegate.
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    /**
     * Retrieved the same way `AppNavHost`'s internal `hiltViewModel()` call resolves it —
     * both default to the Activity's own `ViewModelStoreOwner`, so this is the same instance,
     * not a second one. Needed here specifically so [handleIntent] (an Activity lifecycle
     * callback, not a Composable) can reach it.
     */
    private val navHostViewModel: AppNavHostViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)

        setContent {
            var darkTheme by rememberSaveable { mutableStateOf<Boolean?>(null) }
            val isDark = darkTheme ?: isSystemInDarkTheme()

            TappyAITheme(darkTheme = isDark) {
                AppNavHost(
                    isDarkTheme = isDark,
                    onToggleDarkTheme = { darkTheme = !isDark },
                    viewModel = navHostViewModel,
                )
            }
        }
    }

    /** The OAuth redirect (`tappyai://auth-callback`) arrives here when the app is already
     *  running in the background — `onCreate`'s intent covers the (less common) cold-start
     *  case, e.g. if the OS killed the app while the browser/Custom-Tab was open. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "tappyai") {
            navHostViewModel.handleDeepLink(intent)
        }
    }
}
