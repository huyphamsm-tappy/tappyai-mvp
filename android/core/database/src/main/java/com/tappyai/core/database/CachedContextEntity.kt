package com.tappyai.core.database

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Local cache of `GET /api/context`'s response (contract designed in
 * `docs/Final_Architecture_Review.md` §19 — `{ version, generatedAt, confidence, profile }`),
 * for `core:ai`'s future `ContextRepository` (Phase 1C) to read offline-first from before
 * revalidating over the network.
 *
 * [profileJson] stores the `profile` object as a serialized JSON blob rather than exploding
 * every field (`city`, `budget`, `favoriteFoods`, ...) into its own column — the backend's own
 * design doc already treats `profile`'s shape as evolving, so a blob avoids a schema migration
 * every time a field is added or renamed; `ContextRepository` deserializes it when read.
 * [cachedAt] (epoch millis) is when this row was last written locally, for the
 * stale-while-revalidate staleness check `core:sync` (Phase 2+) will apply.
 */
@Entity(tableName = "cached_context")
data class CachedContextEntity(
    @PrimaryKey val userId: String,
    val version: Int,
    val generatedAt: String,
    val confidence: Double,
    val profileJson: String?,
    val cachedAt: Long,
)
