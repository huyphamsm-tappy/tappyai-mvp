package com.tappyai.core.analytics

// The concrete [AnalyticsProvider] binding lives in the app module (`AnalyticsBindModule`), which
// binds the network-backed provider that POSTs to /api/track — core:analytics has no network
// dependency, so it only defines the contract + a log-only [LoggingAnalyticsProvider] for reference.
// (Previously this module bound the log-only provider; that made Android feed the recs pipeline
// nothing, so the real binding was moved to :app.)
