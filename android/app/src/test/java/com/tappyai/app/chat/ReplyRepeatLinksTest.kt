package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Review 01/11 (Android = the web): a link is ONE token for the repeat guard. The web fixed it twice (A3 02/10: the Lazada link was cut after
 * "…/catalog/?" because the tail of the Shopee one was a "repeated sentence"; 11/10: a host label such as "vpcp.dichvucong.gov.vn" split at its
 * dots and the second citation lost its link). Android's port split sentences on the raw text and could still cut a link out of an answer.
 */
class ReplyRepeatLinksTest {
    @Test
    fun `two search links with the same keyword both keep their whole address`() {
        val text = "Tìm trên Shopee: [Shopee](https://shopee.vn/search?q=kính%20cường%20lực)\nTìm trên Lazada: [Lazada](https://www.lazada.vn/catalog/?q=kính%20cường%20lực)\n"
        assertEquals(text, ReplyRepeat.dedupeSentences(text))
    }

    @Test
    fun `bare addresses are one token too`() {
        val text = "Shopee: https://shopee.vn/search?q=kính%20cường%20lực\nLazada: https://www.lazada.vn/catalog/?q=kính%20cường%20lực\n"
        assertEquals(text, ReplyRepeat.dedupeSentences(text))
    }

    @Test
    fun `a host label with dots is not split into sentences, so a second citation of the page keeps its link`() {
        val a = "Hồ sơ nộp qua cổng dịch vụ công của Chính phủ, hướng dẫn nằm ở [vpcp.dichvucong.gov.vn](https://vpcp.dichvucong.gov.vn/p/home/dvc-trang-chu.html)."
        val b = "Lệ phí và thời hạn xử lý cũng được ghi tại đó ([vpcp.dichvucong.gov.vn](https://vpcp.dichvucong.gov.vn/p/home/dvc-trang-chu.html))."
        val text = "$a\n\n$b"
        assertEquals(text, ReplyRepeat.dedupeSentences(text))
    }

    @Test
    fun `a real repeated sentence still goes`() {
        val s = "Nhớ mang theo giấy tờ tùy thân bản gốc khi đến nộp hồ sơ nhé."
        assertEquals("$s\n", ReplyRepeat.dedupeSentences("$s\n$s\n").replace("\n\n", "\n"))
    }
}
