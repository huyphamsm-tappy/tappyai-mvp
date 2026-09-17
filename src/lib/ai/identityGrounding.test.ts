import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ungroundedNamesIn } from './streamEnrichment'

/**
 * Candidate-identity grounding on the PRESENTATION turn.
 *
 * The decision turn composes its own prose and cannot fabricate (D3). The turn
 * before it still writes freely, and on 2026-08-19 it was measured naming
 * venues the tool never returned — with the authoritative list in front of it:
 *
 *   tool returned : Cà Phê Acoustic, Cà Phê Sỏi Đá, Cà Phê Vườn Kiểng,
 *                   Cà Phê Spotlight, The Coffee House, … (10 real venues)
 *   reply bolded  : Cà Phê Acoustic ✓, The Workshop Coffee ✗, Soo Kafe ✗
 *
 * Those names appear here as FIXTURES only — nothing in production logic knows
 * them. The detector reports; it never edits the reply.
 */

const TOOL_RETURNED = [
  { name: 'Cà Phê Acoustic' },
  { name: 'Cà Phê Sỏi Đá' },
  { name: 'Cà Phê Vườn Kiểng' },
  { name: 'Cà Phê Spotlight' },
  { name: 'The Coffee House' },
]
const FABRICATED = ['The Workshop Coffee', 'Soo Kafe', 'Masstige Coffee & Dessert', "L'Usine Cafe", 'Po Cafe']

describe('the detector catches the identity fabrication that was measured', () => {
  it('flags exactly the invented names from the observed reply', () => {
    const reply = [
      'Mình tìm được vài quán cafe yên tĩnh ở quận 1:',
      '**Cà Phê Acoustic** – không gian yên tĩnh.',
      '**The Workshop Coffee** – 27 Ngô Đức Kế, Bến Nghé, Quận 1.',
      '**Soo Kafe** – góc ấm cúng.',
    ].join('\n\n')
    expect(ungroundedNamesIn(reply, TOOL_RETURNED, [], [])).toEqual(['The Workshop Coffee', 'Soo Kafe'])
  })

  it('flags every name from the first observed run too', () => {
    const reply = FABRICATED.map(n => `**${n}** – mô tả.`).join('\n\n')
    expect(ungroundedNamesIn(reply, TOOL_RETURNED, [], [])).toHaveLength(FABRICATED.length)
  })

  it('reports nothing when every named option came from the tool', () => {
    const reply = '**Cà Phê Acoustic** – yên tĩnh.\n\n**Cà Phê Sỏi Đá** – rộng.'
    expect(ungroundedNamesIn(reply, TOOL_RETURNED, [], [])).toEqual([])
  })

  it('accepts the shortened form of a real name', () => {
    // A reply legitimately writes "Acoustic" for "Cà Phê Acoustic".
    expect(ungroundedNamesIn('**Acoustic** – yên tĩnh.', TOOL_RETURNED, [], [])).toEqual([])
  })

  it('counts held candidates as grounded on a reuse turn', () => {
    const held = [{ candidateId: 'c1', name: 'Cà Phê MVTTS' }]
    expect(ungroundedNamesIn('**Cà Phê MVTTS** – quán cũ.', [], [], held)).toEqual([])
  })

  it('accepts a product title from the shopping path', () => {
    const records = [{ title: 'MacBook Air M1 2020 - 8GB/256GB' }] as never
    expect(ungroundedNamesIn('**MacBook Air M1 2020**', [], records, [])).toEqual([])
  })

  it('stays silent when there is no evidence to check against', () => {
    // A chitchat turn has no candidate set; every bold run would look invented.
    expect(ungroundedNamesIn('**Xin chào**', [], [], [])).toEqual([])
  })

  it('does not mistake bold emphasis for an option heading', () => {
    // Headings are the only bold in an option list, but short emphasis is
    // common in prose and must not be reported.
    expect(ungroundedNamesIn('Quán **ok** lắm.', TOOL_RETURNED, [], [])).toEqual([])
  })

  it('strips list numbering before matching', () => {
    expect(ungroundedNamesIn('**1. Cà Phê Sỏi Đá**', TOOL_RETURNED, [], [])).toEqual([])
  })
})

describe('the detector reports and never rewrites', () => {
  const filter = readFileSync('src/lib/ai/streamEnrichment.ts', 'utf8')
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')

  it('the reply text is not derived from the detector result', () => {
    const fn = filter.slice(filter.indexOf('export function ungroundedNamesIn'))
      .slice(0, filter.slice(filter.indexOf('export function ungroundedNamesIn')).indexOf('\nexport function'))
    // It returns names. It has no way to emit anything, and the reply it was
    // handed is never assigned back.
    expect(fn).not.toContain('controller')
    expect(fn).not.toContain('text =')
  })

  it('the enqueued reply is never derived from what the detector found', () => {
    // The whole span between detection and the emit. Widened from 600 when the second delivery
    // split (A5-P1) was documented above it — the window must still reach the enqueue, or this
    // stops checking anything.
    // 🔄 ANCHOR UPDATED, PROTECTION WIDENED. The assignment gained a second
    // source (the grounding gate's own record of what it removed), so the old
    // literal no longer appears. The property is unchanged and now also covers
    // the gate: neither the detector's finding nor the gate's finding may be
    // read back to decide what is emitted.
    const emit = filter.slice(filter.indexOf('ungroundedNames = [...new Set(['))
      .slice(0, 1600)
    // The property this protects: the detector REPORTS and never rewrites.
    //
    // The emitted variable is no longer `finalText` itself. There are now TWO delivery splits,
    // and both leave the property untouched because both depend only on what has already been
    // sent, never on what the detector found:
    //   · Phase 1 sends the shopping decision early, so the final emit carries the prose alone
    //     once the decision has gone out (`outText`);
    //   · A5-P1 releases the money-free opening of a places reply while it streams, so the final
    //     emit drops that already-sent prefix (`send`).
    expect(emit).toContain("controller.enqueue(encoder.encode('0:' + JSON.stringify(send)")
    expect(emit).not.toContain('ungroundedNames.')
    expect(emit).not.toContain('presentedNames.')
    // The grounding gate runs BEFORE composition and is deterministic; its
    // result may be RECORDED on the evidence (that is the assignment this slice
    // opens with) but must never be READ BACK to decide what is emitted. So the
    // check is on everything after that assignment ends, and it forbids uses —
    // any property access — exactly as the two lines above do for the detector.
    const afterRecord = emit.slice(emit.indexOf('])]') + 3)
    expect(afterRecord).not.toContain('gated.')
    expect(afterRecord).not.toContain('ungroundedNames')
  })

  it('the emitted text is chosen by delivery state alone, not by any finding', () => {
    // Pins WHY the emit may differ from the detector's input. If `outText` ever
    // starts depending on anything but the early-send flag, this fails — which
    // is the moment "we noticed a fabricated name" could turn into "we silently
    // edited the user's reply".
    //
    // Asserted through the ternary's two branches rather than one literal byte string. The
    // property is "delivery state alone decides", not "the expression never changes shape": the
    // early branch must drop EXACTLY what the early send already delivered (the shopping marker)
    // and keep everything else, or a turn that searched both places and products would silently
    // lose its place cards. A literal match cannot tell those two apart.
    const outTernary = filter.match(/const outText = (.*)/)?.[1]
    expect(outTernary).toBeDefined()
    expect(outTernary).toMatch(/^earlyShoppingMarkerSent \?/)
    const [earlyBranch, lateBranch] = outTernary!.replace(/^earlyShoppingMarkerSent \?/, '').split(':')
    // Early branch: everything `finalText` carries EXCEPT the marker that already shipped.
    expect(earlyBranch).toContain('${prose}')
    expect(earlyBranch).toContain('${placesSuffix}')
    expect(earlyBranch).not.toContain('markerSuffix')
    // Late branch: the detector's input, unchanged.
    expect(lateBranch.trim()).toBe('finalText')
    // The second split obeys the same rule: `send` subtracts what was already streamed, and its
    // only inputs are `flushedText` (delivery state) and `outText`. If a detector result ever
    // appears in this expression, this fails — which is the moment "we noticed a fabricated name"
    // could turn into "we silently edited the user's reply".
    expect(filter).toMatch(/const send = flushedText && outText\.startsWith\(flushedText\)/)
  })

  it('the detector still reads the reply WITH every appended block in it', () => {
    // `finalText` — what ungroundedNamesIn analyses — must keep carrying the
    // marker even though the marker may already have shipped separately.
    //
    // 🔄 THE COMPOSITION GREW; THE PROPERTY DID NOT CHANGE. The unified
    // recommendation work added two more suffixes ([TAPPY_PLACES] and the
    // server-authored CTA) and renamed `prose` to `ctaOwnedProse` at this line.
    // What must still hold — and is what this asserts — is that the detector's
    // input is the SAME string the user receives, composed before it runs. So
    // the assertion is written against the parts rather than one frozen
    // expression: every appended block has to be inside `finalText`.
    const compose = /const finalText = `((?:\$\{\w+\})+)`/.exec(filter)
    expect(compose, 'finalText must be a single template of composed parts').not.toBeNull()
    const parts = [...compose![1].matchAll(/\$\{(\w+)\}/g)].map(m => m[1])
    expect(parts, 'the prose must lead').toContain('ctaOwnedProse')
    expect(parts, 'the shopping decision must be analysed').toContain('markerSuffix')
    expect(parts, 'the recommendation block must be analysed').toContain('placesSuffix')
    expect(parts, 'the server CTA must be analysed').toContain('ctaSuffix')
    const detectAt = filter.indexOf('ungroundedNames = [...new Set([')
    expect(filter.indexOf('const finalText = `')).toBeLessThan(detectAt)
  })

  // REMOVED ON INTEGRATION: this asserted how `/api/chat` CONSUMES the detector's finding, and
  // the route does not consume it on this branch. `ungroundedNamesIn` is integrated and is
  // exercised by every test above; the route wiring that reads `evidence.ungroundedNames` belongs
  // to the D3 stateful pipeline, which is one Owner decision away (see the W4 report).
  //
  // 🚨 Restore this in the same change that wires that pipeline. It protects a real property —
  // the detector REPORTS and never rewrites — and an assertion that the route only logs is the
  // only thing standing between "we noticed a fabricated name" and "we silently edited the
  // user's reply".
})
