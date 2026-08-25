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
    const emit = filter.slice(filter.indexOf('ungroundedNames = ungroundedNamesIn('))
      .slice(0, 600)
    // The property this protects: the detector REPORTS and never rewrites.
    //
    // The emitted variable is no longer `finalText` itself. Phase 1 sends the
    // shopping decision early, so the final emit carries the prose alone once
    // the decision has already gone out. That is a DELIVERY split — `outText`
    // depends only on whether the early frame fired — and it leaves the
    // property untouched: nothing between detection and emit consults the
    // detector's result.
    expect(emit).toContain("controller.enqueue(encoder.encode('0:' + JSON.stringify(outText)")
    expect(emit).not.toContain('ungroundedNames.')
    expect(emit).not.toContain('presentedNames.')
  })

  it('the emitted text is chosen by delivery state alone, not by any finding', () => {
    // Pins WHY the emit may differ from the detector's input. If `outText` ever
    // starts depending on anything but the early-send flag, this fails — which
    // is the moment "we noticed a fabricated name" could turn into "we silently
    // edited the user's reply".
    expect(filter).toMatch(/const outText = earlyShoppingMarkerSent \? prose : finalText/)
  })

  it('the detector still reads the reply WITH the decision in it', () => {
    // `finalText` — what ungroundedNamesIn analyses — must keep carrying the
    // marker even though the marker may already have shipped separately.
    expect(filter).toMatch(/const finalText = `\$\{prose\}\$\{markerSuffix\}`/)
    const detectAt = filter.indexOf('ungroundedNames = ungroundedNamesIn(')
    expect(filter.indexOf('const finalText = `${prose}${markerSuffix}`')).toBeLessThan(detectAt)
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
