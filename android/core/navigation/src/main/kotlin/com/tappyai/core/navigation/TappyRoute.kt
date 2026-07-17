package com.tappyai.core.navigation

/**
 * Marker interface for a type-safe navigation destination. Feature modules define their own
 * `@Serializable` route types implementing this (Navigation Compose's type-safe API, backed
 * by kotlinx.serialization — already pinned in the root version catalog) once the first real
 * `NavHost` is built in Phase 1+. This module intentionally knows nothing about any specific
 * screen — it only defines the shared vocabulary other modules implement against.
 */
interface TappyRoute
