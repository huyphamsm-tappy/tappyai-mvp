import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * P4-08 — cross-platform parity, enforced rather than reviewed.
 *
 * The shared marker fixtures already pin the structured-content CONTRACT on all three platforms by
 * executing it. What they cannot reach is the logic that has no wire format: the comparison rules,
 * the confirmation semantics, and the honesty rule. Those exist three times, in three languages,
 * and drift between them is exactly the failure mode this phase was created to fix (D1 and D2 were
 * both drift).
 *
 * So this file reads the three implementations and asserts they still agree on the decisions that
 * MUST MATCH. It is a source-level guard, which is weaker than executing all three — iOS in
 * particular cannot be run on this machine at all — but it fails when a rule is dropped from one
 * platform, which no amount of manual review reliably does.
 *
 * MAY DIFFER is deliberately not asserted anywhere here: the container (inline vs sheet), the
 * navigation, the gestures and the motion are supposed to diverge.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const has = (p: string) => existsSync(resolve(root, p))

/**
 * Removes `//` line comments and block comments.
 *
 * Needed because these three files DOCUMENT the rules they follow, so a naive search for a
 * forbidden concept finds the sentence explaining why it is forbidden. Crude (it does not
 * understand strings containing `//`), which is fine: it is only used to narrow a
 * must-not-appear check, where a false negative costs nothing and a false positive would make
 * the guard unusable.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

const WEB_COMPARISON = 'src/lib/structuredContent/comparisonFromSynthesis.ts'
const AND_COMPARISON = 'android/app/src/main/java/com/tappyai/app/chat/ShoppingComparison.kt'
const IOS_COMPARISON = 'ios/TappyAI/Features/Chat/Model/ShoppingComparison.swift'

const WEB_BLOCK = 'src/components/chat/structured/ComparisonBlock.tsx'
const WEB_CONFIRM = 'src/components/chat/structured/ConfirmationPrompt.tsx'
const AND_SHEETS = 'android/app/src/main/java/com/tappyai/app/chat/ShoppingComparisonSheet.kt'
const IOS_SHEETS = 'ios/TappyAI/Features/Chat/UI/ShoppingComparisonSheet.swift'

describe('all three platforms implement the shared surfaces', () => {
  it.each([
    ['web comparison derivation', WEB_COMPARISON],
    ['android comparison derivation', AND_COMPARISON],
    ['ios comparison derivation', IOS_COMPARISON],
    ['web comparison UI', WEB_BLOCK],
    ['web confirmation UI', WEB_CONFIRM],
    ['android sheets', AND_SHEETS],
    ['ios sheets', IOS_SHEETS],
  ])('%s exists', (_label, path) => {
    expect(has(path), `${path} is missing — a platform lost a V3 surface`).toBe(true)
  })
})

describe('MUST MATCH — the comparison caps (DD-005)', () => {
  it('every platform caps entities at 4', () => {
    expect(read(WEB_COMPARISON) + read(WEB_BLOCK)).toContain('MAX_ENTITIES = 4')
    expect(read(AND_COMPARISON)).toContain('COMPARISON_MAX_ENTITIES = 4')
    expect(read(IOS_COMPARISON)).toContain('comparisonMaxEntities = 4')
  })

  it('every platform caps differing attributes at 6', () => {
    expect(read(WEB_BLOCK)).toContain('MAX_ATTRIBUTES = 6')
    expect(read(AND_COMPARISON)).toContain('COMPARISON_MAX_ATTRIBUTES = 6')
    expect(read(IOS_COMPARISON)).toContain('comparisonMaxAttributes = 6')
  })

  it('every platform derives the same three attributes and no fourth', () => {
    // Matched as words, not as quoted literals: the three languages spell an object key three
    // ways (`price:`, `"price" to`, `"price":`) and the RULE is the key set, not the syntax.
    const word = (w: string) => new RegExp(`\\b${w}\\b`)

    for (const [name, src] of [
      ['web', read(WEB_COMPARISON)],
      ['android', read(AND_COMPARISON)],
      ['ios', read(IOS_COMPARISON)],
    ] as const) {
      for (const key of ['price', 'match', 'sellers']) {
        expect(src, `${name} lost the ${key} attribute`).toMatch(word(key))
      }
      // No platform may invent a ranked or computed attribute on its own.
      //
      // Checked against CODE only. All three files explain in prose that a "cheapest" flag is
      // deliberately absent, and matching the comment would make this assertion fire on the very
      // documentation that records the rule.
      const code = stripComments(src)
      for (const forbidden of ['cheapest', 'bestValue', 'ranking']) {
        expect(code, `${name} invented a "${forbidden}" attribute the server never stated`)
          .not.toMatch(word(forbidden))
      }
    }
  })
})

describe('MUST MATCH — a recommendation always carries its reason (DD-005)', () => {
  // Enforced in the DERIVATION on every platform, not in the UI, so a marked winner with nothing
  // to justify it is unreachable by construction rather than by remembering to check.
  it('web gates recommendedKey on a reason', () => {
    expect(read(WEB_COMPARISON)).toContain('recommendedKey: reason ?')
  })
  it('android gates recommendedKey on a reason', () => {
    expect(read(AND_COMPARISON)).toContain('if (reason != null) recommended?.key else null')
  })
  it('ios gates recommendedKey on a reason', () => {
    expect(read(IOS_COMPARISON)).toContain('recommendedKey: reason != nil ? recommended?.key : nil')
  })

  it('every platform ignores a recommendation pointing at another entity', () => {
    expect(read(WEB_COMPARISON)).toContain('rec.entityKey === recommended.key')
    expect(read(AND_COMPARISON)).toContain('rec.entityKey == recommended.key')
    expect(read(IOS_COMPARISON)).toContain('rec.entityKey == recommended.key')
  })
})

describe('MUST MATCH — the honesty rule', () => {
  it('no platform turns an empty offer list into a seller count', () => {
    expect(read(WEB_COMPARISON)).toContain('e.offers.length > 0')
    expect(read(AND_COMPARISON)).toContain('takeIf { it > 0 }')
    expect(read(IOS_COMPARISON)).toContain('e.offers.isEmpty ? nil')
  })

  it('a partially unknown row counts as differing, never as identical', () => {
    // "Same for all" is a claim; it may only be made when every entity actually has the value.
    expect(read(WEB_BLOCK)).toContain('known.length === entities.length')
    expect(read(AND_COMPARISON)).toContain('known.size == entities.size')
    expect(read(IOS_COMPARISON)).toContain('known.count == entities.count')
  })

  it('an attribute nobody has a value for is dropped rather than shown as a row of unknowns', () => {
    expect(read(WEB_BLOCK)).toContain('if (known.length === 0) continue')
    expect(read(AND_COMPARISON)).toContain('if (known.isEmpty()) continue')
    expect(read(IOS_COMPARISON)).toContain('if known.isEmpty { continue }')
  })
})

describe('MUST MATCH — the action boundary (DD-006)', () => {
  it('every platform gates the same CTA type and only that one', () => {
    expect(read(WEB_CONFIRM) + read('src/components/ChatInterface.tsx')).toContain("btn.type === 'internal_booking'")
    expect(read('android/app/src/main/java/com/tappyai/app/chat/ChatCtaButtons.kt'))
      .toContain('CtaType.InternalBooking')
  })

  it('dismissing resolves to cancel on both platforms that have a sheet or dialog', () => {
    // Web: Escape and the cancel handler. Android: the sheet's own dismiss is wired to onCancel.
    expect(read(WEB_CONFIRM)).toContain("e.key === 'Escape'")
    expect(read(AND_SHEETS)).toContain('TappyBottomSheet(onDismiss = onCancel)')
    expect(read(IOS_SHEETS)).toContain('onCancel')
  })

  it('no platform confirms on dismiss', () => {
    expect(read(AND_SHEETS), 'a dismissed sheet must never perform the action')
      .not.toContain('TappyBottomSheet(onDismiss = onConfirm)')
  })
})

describe('MUST MATCH — the AI-first Home order (DD-002 / P4-11)', () => {
  // The rule is an ORDER, so each platform is checked by the position of its own section calls.
  // The section NAMES legitimately differ; where they sit relative to each other does not.
  const order = (src: string, marks: string[]) => marks.map(m => src.indexOf(m))

  it('web puts the assistant and Continue above the tools', () => {
    // Follows the ROUTE: the Home surface is now the V3 panel grid (`HomeV3`), not the pre-V3
    // `HomeView`. Asserting against the old file would leave this guard green while checking a
    // component nothing renders.
    const src = read('src/app/HomeV3.tsx')
    const [assistant, cont, tools] = order(src, [
      "t('v3.panel.aiAgent')",
      "t('v3.panel.continue')",
      "t('v3.panel.smartTools')",
    ])
    expect(assistant, 'the assistant panel must exist').toBeGreaterThan(-1)
    expect(assistant, 'the assistant comes before the tool strip').toBeLessThan(tools)
    expect(cont, 'Continue comes before the tool strip').toBeLessThan(tools)
  })

  it('android puts the assistant and Continue above the tools', () => {
    const src = read('android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt')
    const body = src.slice(src.indexOf('HomeHero('))
    const [suggestions, cont, tools] = order(body, [
      'SuggestionsSection(',
      'RecentActivitySection(',
      'FortuneSection(',
    ])
    expect(suggestions).toBeGreaterThan(-1)
    expect(suggestions).toBeLessThan(tools)
    expect(cont).toBeLessThan(tools)
  })

  it('ios puts the assistant and Continue above the tools', () => {
    const src = read('ios/TappyAI/Features/Home/UI/HomeView.swift')
    const body = src.slice(src.indexOf('HomeGreetingSection('))
    const [suggestions, cont, tools] = order(body, [
      'HomeSuggestedPromptsSection(',
      'HomeRecentConversationsSection(',
      'HomeQuickActionsSection',
    ])
    expect(suggestions).toBeGreaterThan(-1)
    expect(suggestions).toBeLessThan(tools)
    expect(cont).toBeLessThan(tools)
  })

  it('no platform renders a conversation thread on Home', () => {
    // Home is a door, not a room — every entry point navigates to the Chat surface.
    expect(stripComments(read('android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt')))
      .not.toContain('TappyChatBubble')
    expect(stripComments(read('ios/TappyAI/Features/Home/UI/HomeView.swift')))
      .not.toContain('ChatMessageList')
    expect(stripComments(read('src/app/HomeV3.tsx')))
      .not.toContain('ChatInterface')
  })

  it('no platform fabricates a For You section it has no source for (ND-001)', () => {
    // Web renders it only when given items; the two mobile platforms have no source wired, so the
    // section must be absent rather than filled with samples.
    expect(read('src/app/HomeV3.tsx'), 'V3 Home must not fabricate a For You section')
      .not.toContain('ForYouSection(')
    expect(read('android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt')).not.toContain('ForYouSection(')
    expect(read('ios/TappyAI/Features/Home/UI/HomeView.swift')).not.toContain('HomeForYouSection(')
  })
})

describe('MAY DIFFER — recorded, not enforced', () => {
  it('the container legitimately differs: inline on web, sheet on mobile', () => {
    expect(read(WEB_BLOCK), 'web renders the comparison inline').toContain('<table')
    expect(read(AND_SHEETS), 'android renders it in a bottom sheet').toContain('TappyBottomSheet')
    expect(read(IOS_SHEETS), 'ios renders it in a sheet').toContain('presentationDetents')
  })
})
