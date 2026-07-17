package com.tappyai.app.home

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.tappyai.app.currency.CurrencyRoute
import com.tappyai.app.currency.CurrencyScreen
import com.tappyai.app.deals.DealsRoute
import com.tappyai.app.deals.DealsScreen
import com.tappyai.app.fortune.FortuneHubScreen
import com.tappyai.app.fortune.FortuneRoute
import com.tappyai.app.fortune.tarot.TarotScreen
import com.tappyai.app.fortune.tuvi.TuViScreen
import com.tappyai.app.fortune.zodiac.ZodiacScreen
import com.tappyai.app.games.GamesRoute
import com.tappyai.app.games.GamesScreen
import com.tappyai.app.music.MusicLibraryScreen
import com.tappyai.app.music.MusicRoute
import com.tappyai.app.profile.CopyrightPolicyScreen
import com.tappyai.app.music.SoundDetailScreen
import com.tappyai.app.recommendations.RecommendationsRoute
import com.tappyai.app.recommendations.RecommendationsScreen
import com.tappyai.app.scan.ScanRoute
import com.tappyai.app.scan.ScanScreen
import com.tappyai.app.translate.TranslateRoute
import com.tappyai.app.translate.TranslateScreen
import com.tappyai.app.vietwriter.VietWriterRoute
import com.tappyai.app.vietwriter.VietWriterScreen

/**
 * The Home tab's content. Hosts its own nested NavHost (Landing → Music → Fortune sub-screens)
 * so each flow drills in with its own back stack without touching the app shell or other tabs.
 * [onNavigateToTab] is forwarded from the shell so the launchpad's quick actions can still
 * switch top-level tabs. [onOpenChatWithPrefill] likewise reaches back to the shell to open the
 * Chat tab pre-filled (used by the recommendations "ask Tappy" shortcut), since Chat is a shell
 * tab and can't be reached from this tab-local NavHost.
 */
@Composable
fun HomeTabHost(
    onNavigateToTab: (HomeTab) -> Unit,
    onOpenChatWithPrefill: (String) -> Unit,
) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = HomeTabRoute.Landing) {
        composable<HomeTabRoute.Landing> {
            HomeScreen(
                onNavigateToTab = onNavigateToTab,
                onOpenMusic = { navController.navigate(MusicRoute.Library) },
                onOpenRecommendations = { navController.navigate(RecommendationsRoute.Main) },
                onOpenTarot = { navController.navigate(FortuneRoute.Tarot) },
                onOpenTuVi = { navController.navigate(FortuneRoute.TuVi) },
                onOpenZodiac = { navController.navigate(FortuneRoute.Zodiac) },
                onOpenTranslate = { navController.navigate(TranslateRoute.Main) },
                onOpenCurrency = { navController.navigate(CurrencyRoute.Main) },
                onOpenDeals = { navController.navigate(DealsRoute.Main) },
                onOpenGames = { navController.navigate(GamesRoute.Main) },
                onOpenScan = { navController.navigate(ScanRoute.Main) },
                onOpenVietWriter = { navController.navigate(VietWriterRoute.Main) },
            )
        }
        composable<RecommendationsRoute.Main> {
            RecommendationsScreen(
                onBack = { navController.popBackStack() },
                onAskAboutPlace = { prompt -> onOpenChatWithPrefill(prompt) },
            )
        }
        composable<TranslateRoute.Main> {
            TranslateScreen(onBack = { navController.popBackStack() })
        }
        composable<ScanRoute.Main> {
            ScanScreen(onBack = { navController.popBackStack() })
        }
        composable<VietWriterRoute.Main> {
            VietWriterScreen(onBack = { navController.popBackStack() })
        }
        composable<CurrencyRoute.Main> {
            CurrencyScreen(onBack = { navController.popBackStack() })
        }
        composable<DealsRoute.Main> {
            DealsScreen(onBack = { navController.popBackStack() })
        }
        composable<GamesRoute.Main> {
            GamesScreen(onBack = { navController.popBackStack() })
        }
        composable<MusicRoute.Library> {
            MusicLibraryScreen(
                onBack = { navController.popBackStack() },
                onOpenSound = { trackId -> navController.navigate(MusicRoute.SoundDetail(trackId)) },
            )
        }
        composable<MusicRoute.SoundDetail> {
            SoundDetailScreen(
                onBack = { navController.popBackStack() },
                onOpenCopyrightPolicy = { navController.navigate(MusicRoute.CopyrightPolicy) },
            )
        }
        composable<MusicRoute.CopyrightPolicy> {
            CopyrightPolicyScreen(onBack = { navController.popBackStack() })
        }
        composable<FortuneRoute.Hub> {
            FortuneHubScreen(
                onBack = { navController.popBackStack() },
                onOpenTarot = { navController.navigate(FortuneRoute.Tarot) },
                onOpenTuVi = { navController.navigate(FortuneRoute.TuVi) },
                onOpenZodiac = { navController.navigate(FortuneRoute.Zodiac) },
            )
        }
        composable<FortuneRoute.Tarot> { TarotScreen(onBack = { navController.popBackStack() }) }
        composable<FortuneRoute.TuVi> { TuViScreen(onBack = { navController.popBackStack() }) }
        composable<FortuneRoute.Zodiac> { ZodiacScreen(onBack = { navController.popBackStack() }) }
    }
}
