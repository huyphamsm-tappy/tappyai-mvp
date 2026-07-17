package com.tappyai.core.navigation

import kotlinx.coroutines.flow.Flow

/**
 * Lets a ViewModel request navigation without holding a `NavController` reference — the
 * standard Clean Architecture navigation seam: the UI layer collects [destinations] and
 * drives the real `NavController`, while ViewModels only ever call [navigateTo]/[navigateBack].
 * No implementation exists yet; one is built alongside the first real `NavHost` (Phase 1+).
 */
interface TappyNavigator {
    val destinations: Flow<TappyRoute>
    suspend fun navigateTo(route: TappyRoute)
    suspend fun navigateBack()
}
