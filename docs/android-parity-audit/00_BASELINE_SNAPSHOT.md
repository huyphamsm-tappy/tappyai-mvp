# Android↔Web Parity Audit — Baseline Snapshot

Captured: audit start (working-tree baseline authorized by owner)
Web Production = Source of Truth.

## HEAD
```
807d77b548d6209efc1b0037ad316e9beed9c103
807d77b fix(i18n): video upload hint said 15s while the app accepts 60s
branch: feat/backoffice-phase0
ahead of main: 0 commits
```

## Working-tree summary
```
changed entries: 156
 110 files changed, 3283 insertions(+), 1036 deletions(-)
```

## Full porcelain status
```
 M android/app/build.gradle.kts
 M android/app/src/main/AndroidManifest.xml
 M android/app/src/main/java/com/tappyai/app/MainActivity.kt
 M android/app/src/main/java/com/tappyai/app/account/AccountViewModel.kt
 M android/app/src/main/java/com/tappyai/app/chat/ChatMessage.kt
 M android/app/src/main/java/com/tappyai/app/chat/ChatScreen.kt
 M android/app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt
 M android/app/src/main/java/com/tappyai/app/chat/MessageActionBar.kt
 M android/app/src/main/java/com/tappyai/app/chat/data/ChatRepository.kt
 M android/app/src/main/java/com/tappyai/app/chat/data/ChatRequest.kt
 D android/app/src/main/java/com/tappyai/app/chat/data/FakeChatRepository.kt
 M android/app/src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt
 M android/app/src/main/java/com/tappyai/app/currency/CurrencyViewModel.kt
 M android/app/src/main/java/com/tappyai/app/deals/DealsScreen.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryCategoryScreen.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryCategoryViewModel.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryHubScreen.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryHubViewModel.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryModels.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryRoute.kt
 D android/app/src/main/java/com/tappyai/app/discovery/DiscoveryTab.kt
 M android/app/src/main/java/com/tappyai/app/fortune/tarot/TarotCard.kt
 M android/app/src/main/java/com/tappyai/app/fortune/tuvi/CanChiData.kt
 M android/app/src/main/java/com/tappyai/app/fortune/tuvi/TuViViewModel.kt
 M android/app/src/main/java/com/tappyai/app/fortune/zodiac/ZodiacViewModel.kt
 M android/app/src/main/java/com/tappyai/app/games/GamesScreen.kt
 M android/app/src/main/java/com/tappyai/app/groupdining/GroupDetailScreen.kt
 M android/app/src/main/java/com/tappyai/app/groupdining/GroupDetailViewModel.kt
 M android/app/src/main/java/com/tappyai/app/groupdining/GroupDiningViewModel.kt
 M android/app/src/main/java/com/tappyai/app/history/ChatHistoryViewModel.kt
 M android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt
 M android/app/src/main/java/com/tappyai/app/home/HomeTabRoute.kt
 M android/app/src/main/java/com/tappyai/app/home/HomeViewModel.kt
 D android/app/src/main/java/com/tappyai/app/home/PlaceholderTabScreen.kt
 M android/app/src/main/java/com/tappyai/app/language/LanguageManager.kt
 M android/app/src/main/java/com/tappyai/app/maps/MapsScreen.kt
 M android/app/src/main/java/com/tappyai/app/memory/Memory.kt
 M android/app/src/main/java/com/tappyai/app/memory/MemoryScreen.kt
 M android/app/src/main/java/com/tappyai/app/memory/MemoryViewModel.kt
 M android/app/src/main/java/com/tappyai/app/music/MusicLibraryViewModel.kt
 M android/app/src/main/java/com/tappyai/app/music/MusicRoute.kt
 M android/app/src/main/java/com/tappyai/app/navigation/AppNavHost.kt
 M android/app/src/main/java/com/tappyai/app/navigation/AppNavHostViewModel.kt
 M android/app/src/main/java/com/tappyai/app/preferences/PreferencesViewModel.kt
 M android/app/src/main/java/com/tappyai/app/pricetracking/PriceTrackingScreen.kt
 M android/app/src/main/java/com/tappyai/app/pricetracking/PriceTrackingViewModel.kt
 M android/app/src/main/java/com/tappyai/app/pricetracking/PriceWatch.kt
 M android/app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt
 M android/app/src/main/java/com/tappyai/app/profile/ProfileViewModel.kt
 M android/app/src/main/java/com/tappyai/app/profile/QrProfileSheet.kt
 M android/app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt
 M android/app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt
 M android/app/src/main/java/com/tappyai/app/recommendations/RecommendationsScreen.kt
 M android/app/src/main/java/com/tappyai/app/reviews/data/RealReviewsRepository.kt
 M android/app/src/main/java/com/tappyai/app/reviews/data/Review.kt
 M android/app/src/main/java/com/tappyai/app/reviews/data/ReviewNetworkDtos.kt
 M android/app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt
 M android/app/src/main/java/com/tappyai/app/reviews/data/ReviewsModule.kt
 M android/app/src/main/java/com/tappyai/app/reviews/data/ReviewsRepository.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewCard.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewCommentSection.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerScreen.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewDetailScreen.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewDetailViewModel.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileSection.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileViewModel.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewSearchViewModel.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt
 M android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt
 M android/app/src/main/java/com/tappyai/app/saved/SavedViewModel.kt
 M android/app/src/main/java/com/tappyai/app/scan/ScanViewModel.kt
 M android/app/src/main/java/com/tappyai/app/translate/TranslateViewModel.kt
 M android/app/src/main/java/com/tappyai/app/vietwriter/VietWriterViewModel.kt
 M android/app/src/main/res/values-vi/strings_bookings.xml
 M android/app/src/main/res/values-vi/strings_chat.xml
 M android/app/src/main/res/values-vi/strings_deals.xml
 D android/app/src/main/res/values-vi/strings_discovery.xml
 M android/app/src/main/res/values-vi/strings_pricetracking.xml
 M android/app/src/main/res/values-vi/strings_reviews.xml
 M android/app/src/main/res/values-vi/strings_saved.xml
 M android/app/src/main/res/values-vi/strings_settings.xml
 M android/app/src/main/res/values/strings.xml
 M android/app/src/main/res/values/strings_bookings.xml
 M android/app/src/main/res/values/strings_chat.xml
 M android/app/src/main/res/values/strings_deals.xml
 D android/app/src/main/res/values/strings_discovery.xml
 M android/app/src/main/res/values/strings_pricetracking.xml
 M android/app/src/main/res/values/strings_reviews.xml
 M android/app/src/main/res/values/strings_saved.xml
 M android/app/src/main/res/values/strings_settings.xml
 M android/app/src/main/res/values/themes.xml
 M android/app/src/main/res/xml/backup_rules.xml
 M android/app/src/main/res/xml/data_extraction_rules.xml
 M android/core/common/src/main/kotlin/com/tappyai/core/common/MoneyFormatter.kt
 M android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyComingSoonSheet.kt
 M android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt
 M android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyTextField.kt
 M android/core/designsystem/src/main/res/values-vi/strings.xml
 M android/core/designsystem/src/main/res/values/strings.xml
 M android/features/auth/consumer-rules.pro
 M android/features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt
 M android/features/auth/src/main/java/com/tappyai/features/auth/ui/login/LoginScreen.kt
 M android/features/auth/src/main/java/com/tappyai/features/auth/ui/login/LoginViewModel.kt
 M android/features/auth/src/main/java/com/tappyai/features/auth/ui/otp/EmailOtpVerificationViewModel.kt
 M android/features/auth/src/main/res/values-vi/strings.xml
 M android/features/auth/src/main/res/values/strings.xml
 M docs/backoffice/phase-reports/DEVICE_CONTEXT_ARCHITECTURE_DECISION.md
 M docs/backoffice/phase-reports/DEVICE_CONTEXT_AUDIT.md
 M docs/backoffice/phase-reports/DEVICE_CONTEXT_IMPLEMENTATION_REPORT.md
?? ANDROID_FINAL_CERTIFICATION_2026-07-17.md
?? ANDROID_PRODUCTION_READINESS_REPORT_2026-07-17.md
?? ANDROID_RC1_REPORT_2026-07-17.md
?? ANDROID_WEB_PARITY_SYNC_2026-07-17.md
?? CRON_SECRET_ROTATION_VERIFICATION.md
?? ENRICHMENT_PIPELINE_INVESTIGATION.md
?? FOUNDER_ACCEPTANCE_TEST_REPORT.md
?? Facebook_Login_Implementation_Report.md
?? IMAGE_PIPELINE_ANALYSIS.md
?? IMAGE_PIPELINE_VERIFICATION.md
?? PHASE3_FINAL_REVIEW.md
?? PHASE3_REVIEW.md
?? PRODUCTION_BUGLIST.md
?? PRODUCTION_DEPLOYMENT_REPORT.md
?? TAPPYAI_CANONICAL_SCHEMA_2026-07-05.md
?? TAPPYAI_DB_BASELINE_SPRINT_2026-07-05.md
?? TAPPYAI_GATEA_REMEDIATION_2026-07-05.md
?? TAPPYAI_MASTER_AUDIT_2026-07-04.md
?? TAPPYAI_MIC_FIX_2026-07-05.md
?? TAPPYAI_PHASE1_VERIFICATION_2026-07-05.md
?? TAPPYAI_UAT_2026-07-05.md
?? TAPPYAI_UAT_FIX_SPRINT_2026-07-05.md
?? TAPPYAI_VERIFICATION_AUDIT_2026-07-05.md
?? android/app/src/main/java/com/tappyai/app/chat/ChatCtaButton.kt
?? android/app/src/main/java/com/tappyai/app/reviews/data/ProgressUriRequestBody.kt
?? android/app/src/main/java/com/tappyai/app/reviews/data/VercelBlobUploader.kt
?? android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewVideoPlayer.kt
?? android/app/src/main/java/com/tappyai/app/reviews/ui/VideoMediaReader.kt
?? android/app/src/main/java/com/tappyai/app/theme/
?? android/docs/adr/0004-upload-limits-runtime-configurable.md
?? android/gradle/
?? android/gradlew.bat
?? android/settings.gradle.kts
?? docs/android-parity-audit/
?? docs/backoffice/phase-reports/ANALYTICS_PLATFORM_ARCHITECTURE_REVIEW.md
?? docs/backoffice/phase-reports/ANALYTICS_PLATFORM_EXTENSION_GUIDE.md
?? docs/backoffice/phase-reports/ANALYTICS_PLATFORM_KNOWN_LIMITATIONS.md
?? docs/backoffice/phase-reports/ANALYTICS_PLATFORM_V1_FREEZE.md
?? docs/backoffice/phase-reports/PRODUCTION_DEPLOYMENT_AUDIT.md
?? docs/design-baseline/
?? docs/design/
?? docs/freeze/
?? docs/release/
?? scripts/backfill-original-sound-durations.mjs
?? supabase/.temp/
?? supabase/_prod_schema_partial_introspection.md
```
