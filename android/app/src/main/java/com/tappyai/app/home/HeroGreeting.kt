package com.tappyai.app.home

/**
 * What the V3 hero prints — the time-of-day greeting with the V3 name line over it.
 *
 * Restored 2026-09-14 after the regression audit: the V3 rebuild (`ec2c813` / `56db2ce`) had
 * replaced the pre-V3 hero's dynamic heading with a static line and left [HomeGreeting] unused.
 * The engine is back as the ONLY source of the heading; this adapter merely lays its two lines
 * into the V3 slots and adds the name the V3 hero already showed.
 *
 *   ┌────────────────────────────┐
 *   │ Hi Huy! 👋                 │  [welcome]    — the V3 line: `home_v3_greeting_named` when a
 *   │ Chào buổi sáng!            │  [title]        real display name is known, else the guest
 *   │ Hôm nay ăn gì ngon đây? ☀️ │  [supporting]   line `home_v3_greeting_generic` ("Chào bạn! 👋")
 *   └────────────────────────────┘
 *
 * 🚨 THE ENGINE'S TEXT IS NEVER EDITED. `HomeGreeting.heroText` returns `"line 1\nline 2"` (the
 * web's `<br />`); line 1 is the title and line 2 the supporting line, verbatim. Only 23 of the
 * 51 templates end their first line as a sentence — the rest run on ("Ngày mới bắt đầu —", "Sáng
 * sớm rồi,") — so splicing a name INTO a template would mean rewriting copy for most of them.
 * The name therefore rides on its own line, in the exact string V3 approved for it, and the pool
 * stays byte-identical to the web's.
 *
 * A null or blank [userName] means the guest welcome: never "Hi null", never an invented name.
 */
internal data class HeroGreeting(
    /** The V3 welcome line — "Hi Huy! 👋" for a known name, "Chào bạn! 👋" otherwise. */
    val welcome: String,
    /** The engine's first line. */
    val title: String,
    /** The engine's second line, or null when a template has only one line. */
    val supporting: String?,
)

/**
 * [engineText] is exactly what [HomeViewModel.greeting] returned; [named] resolves the V3
 * `home_v3_greeting_named` resource for a name and [generic] the guest line (lambdas so this
 * stays a pure, testable function).
 */
internal fun heroGreeting(engineText: String, userName: String?, named: (String) -> String, generic: () -> String): HeroGreeting {
    val title = engineText.substringBefore('\n').trim()
    val supporting = engineText.substringAfter('\n', missingDelimiterValue = "").trim().ifEmpty { null }
    val name = userName?.trim()?.takeIf { it.isNotEmpty() }
    return HeroGreeting(welcome = name?.let(named) ?: generic(), title = title, supporting = supporting)
}
