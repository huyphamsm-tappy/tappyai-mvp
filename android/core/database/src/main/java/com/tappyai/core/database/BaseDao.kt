package com.tappyai.core.database

import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Update

/** Generic CRUD surface every feature DAO extends, so each one doesn't redeclare the same
 *  three operations. [CachedContextDao] is the first to use it; every DAO Phase 2+ adds
 *  (Reviews, Favorites, Saved, ...) extends this too instead of duplicating it. */
interface BaseDao<T> {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: T)

    @Update
    suspend fun update(item: T)

    @Delete
    suspend fun delete(item: T)
}
