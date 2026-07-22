package com.tappyai.core.database

import androidx.room.Database
import androidx.room.RoomDatabase

/**
 * The app's single local database. [CachedContextEntity] is the first production entity —
 * added in Phase 1A specifically for the future `ContextRepository` (Phase 1C) offline-first
 * cache. Further entities land in this same `@Database` as each feature module needs local
 * persistence (Phase 2+) — see `android/docs/Android_Architecture.md` §2.1's `core:database`
 * entry.
 */
@Database(
    entities = [CachedContextEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class TappyDatabase : RoomDatabase() {
    abstract fun cachedContextDao(): CachedContextDao
}
