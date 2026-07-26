package com.tappyai.app.memory

import com.tappyai.app.memory.data.MemoryDto
import com.tappyai.app.memory.data.toDomain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Guards the memory `updated_at` web parity (banner subtitle "Cập nhật {date}" /
 * "Updated {date}"): the field must survive DTO→domain mapping and format like web's
 * `new Date(updated_at).toLocaleDateString('vi-VN')` (dd/MM/yyyy), falling back to null so the
 * screen shows the "updates automatically" copy.
 */
class MemoryUpdatedTest {

    @Test
    fun `updated_at maps from the DTO into the domain model`() {
        val domain = MemoryDto(updatedAt = "2026-07-26T10:30:00Z").toDomain()
        assertEquals("2026-07-26T10:30:00Z", domain.updatedAt)
    }

    @Test
    fun `formats an ISO timestamp as dd MM yyyy like the web banner`() {
        assertEquals("26/07/2026", formatMemoryUpdated("2026-07-26T10:30:00Z"))
        // Offset form (not just Z) also parses.
        assertEquals("05/01/2026", formatMemoryUpdated("2026-01-05T00:00:00+07:00"))
    }

    @Test
    fun `absent or unparseable timestamp yields null so the fallback copy shows`() {
        assertNull(formatMemoryUpdated(null))
        assertNull(formatMemoryUpdated(""))
        assertNull(formatMemoryUpdated("not-a-date"))
    }
}
