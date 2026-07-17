package com.tappyai.app.navigation

import com.tappyai.core.navigation.TappyNavigator
import com.tappyai.core.navigation.TappyRoute
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * First real implementation of Phase 0.5's [TappyNavigator] contract — an event bus, not a
 * `NavController` holder. ViewModels (in any feature module) call [navigateTo]/[navigateBack];
 * [AppNavHost] (`:app`, the only place that can see the real `NavController`) collects
 * [destinations]/[backEvents] and drives it. This keeps feature ViewModels from needing a
 * `NavController` reference at all, and keeps `:app` as the only module that knows the real
 * navigation graph shape.
 *
 * [backEvents] is intentionally **not** part of the [TappyNavigator] interface — the interface
 * is frozen (`Android_Architecture.md` §7), and `navigateBack()` needed *some* channel to
 * signal through. Feature modules depend on the `TappyNavigator` interface and never see this
 * extra property; only `:app`'s own `AppNavHost` injects this concrete class to reach it.
 */
@Singleton
class TappyNavigatorImpl @Inject constructor() : TappyNavigator {
    private val _destinations = MutableSharedFlow<TappyRoute>(extraBufferCapacity = 1)
    override val destinations: Flow<TappyRoute> = _destinations.asSharedFlow()

    private val _backEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val backEvents: Flow<Unit> = _backEvents.asSharedFlow()

    override suspend fun navigateTo(route: TappyRoute) {
        _destinations.emit(route)
    }

    override suspend fun navigateBack() {
        _backEvents.emit(Unit)
    }
}
