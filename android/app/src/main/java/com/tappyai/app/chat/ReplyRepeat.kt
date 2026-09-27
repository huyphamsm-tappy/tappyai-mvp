package com.tappyai.app.chat

import java.text.Normalizer

/**
 * One reply, not two (UAT3, 2026-09-27) — a line-for-line port of web `src/lib/chat/replyRepeat.ts`.
 *
 * Measured on a Galaxy A12: a clarify turn was saved as two slightly different versions of the same
 * reply back to back. The server's stream guard drops a repeated STEP; this runs on the finished
 * reply before it is parsed, shown and saved, and catches a repeat inside one streamed step, which a
 * stream cannot take back. Same thresholds and the same cases as the web tests (ReplyRepeatTest).
 */
internal object ReplyRepeat {
    const val REPEAT_SIMILARITY = 0.8
    private const val MIN_PROSE = 60
    private val BLOCK = Regex("""\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[/\1\]""", RegexOption.IGNORE_CASE)
    private val MARKS = Regex("""\p{Mn}+""")
    private val NON_WORD = Regex("[^a-z0-9]+")

    private fun tokens(s: String): List<String> {
        val folded = MARKS.replace(Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD), "").replace('đ', 'd')
        return NON_WORD.replace(BLOCK.replace(folded, " "), " ").trim().split(' ').filter { it.isNotEmpty() }
    }

    /** Dice coefficient over word bigrams (unigrams for very short text). */
    fun similarity(a: String, b: String): Double {
        val ta = tokens(a)
        val tb = tokens(b)
        if (ta.isEmpty() || tb.isEmpty()) return 0.0
        fun grams(t: List<String>): Map<String, Int> {
            val n = if (t.size < 3) 1 else 2
            val m = HashMap<String, Int>()
            for (i in 0..t.size - n) m.merge(t.subList(i, i + n).joinToString(" "), 1, Int::plus)
            return m
        }
        val ga = grams(ta)
        val gb = grams(tb)
        val inter = ga.entries.sumOf { (g, v) -> minOf(v, gb[g] ?: 0) }
        return 2.0 * inter / (ga.values.sum() + gb.values.sum())
    }

    // ── UAT4 P1-a (2026-09-27): sentence-level repeats — port of web `dedupeSentences`,
    // `collapseAdjacentRepeats`, `cleanRepeats` (same thresholds; ReplyRepeatTest pins the cases).
    private const val MIN_SENTENCE_KEY = 20
    private const val NEAR_DUPLICATE = 0.9
    private val SENTENCE = Regex("""[^.!?…\n]+(?:[.!?…]+|\n|$)[\s\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}\x{200D}]*""")
    private val PHRASE_RUN = Regex("""((?:\S+[ \t]+){2,12}?)(?:\1)+""")

    private fun key(s: String) = tokens(s).joinToString(" ")

    private fun segments(text: String): List<Pair<Boolean, String>> {
        val out = mutableListOf<Pair<Boolean, String>>()
        var last = 0
        for (m in BLOCK.findAll(text)) {
            if (m.range.first > last) out += false to text.substring(last, m.range.first)
            out += true to m.value
            last = m.range.last + 1
        }
        if (last < text.length) out += false to text.substring(last)
        return out
    }

    private fun sentences(prose: String): List<String> =
        SENTENCE.findAll(prose).map { it.value }.filter { it.isNotEmpty() }.toList().ifEmpty { listOf(prose) }

    private fun isRepeat(k: String, seen: List<String>): Boolean =
        k.length >= MIN_SENTENCE_KEY && seen.any { it == k || (it.length >= MIN_SENTENCE_KEY && similarity(it, k) >= NEAR_DUPLICATE) }

    /** Drops every prose sentence that repeats an earlier one; blocks are untouched. */
    fun dedupeSentences(text: String): String {
        val seen = mutableListOf<String>()
        var changed = false
        val out = segments(text).joinToString("") { (block, seg) ->
            if (block) seg else sentences(seg).joinToString("") { s ->
                val k = key(s)
                if (isRepeat(k, seen)) { changed = true; "" } else { if (k.isNotEmpty()) seen += k; s }
            }
        }
        return if (changed) out.replace(Regex("[ \t]+\n"), "\n").replace(Regex("\n{3,}"), "\n\n") else text
    }

    /** A run of 2–12 words repeated back to back → once. */
    fun collapseAdjacentRepeats(text: String): String = segments(text).joinToString("") { (block, seg) ->
        if (block) seg else PHRASE_RUN.replace(seg) { m ->
            val unit = m.groupValues[1]
            if (unit.filterNot { it.isWhitespace() }.length >= 10 && unit.any { it.isLetter() }) unit else m.value
        }
    }

    /** The last pass over a finished reply: whole-reply repeat, then sentences, then phrases. */
    fun cleanRepeats(text: String): String = collapseAdjacentRepeats(dedupeSentences(dropRepeatedReply(text)))

    /** The same reply twice in one text → the last version; anything else unchanged. */
    fun dropRepeatedReply(text: String): String {
        val t = text.trimStart()
        if (t.length < MIN_PROSE * 2) return text
        val opening = t.substring(0, 40)
        var at = t.indexOf(opening, 40)
        while (at != -1) {
            val first = t.substring(0, at)
            val second = t.substring(at)
            if (first.trim().length >= MIN_PROSE && similarity(first, second) >= REPEAT_SIMILARITY) return second
            at = t.indexOf(opening, at + 1)
        }
        return text
    }
}
