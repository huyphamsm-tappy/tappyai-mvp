import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createObservabilityEventSink,
  createNoopEventSink,
  type ObservabilityRecord,
} from '../events'
import { ControllerCore } from '../core'
import { buildAdminController } from '../registry/adminModules'
import type { ControllerEvent, EventSink, HubDescriptor, ModuleManifest } from '../types'

// Controller V2 — K-3: the production EventSink.
//
// OWNER DECISION D-K3, 2026-08-23: "non-no-op Event Bus" is satisfied when the
// production EventSink has a real implementation that receives and processes
// the existing `controller.*` lifecycle events.
//
// WHAT THIS SINK IS, AND THE TWO THINGS IT MUST NOT BECOME.
//
// It is an OBSERVABILITY sink: at-most-once, in-process, non-durable, no retry,
// no ordering. `events.ts` already states that boundary — "An EventSink emit is
// not an outbox publish and carries none of its guarantees" — and this does not
// widen it.
//
//   1. NOT a second audit trail. MEASURED: all seven emit sites in core.ts are
//      already paired with an `audit.record()` of the same fact (lines 90/91,
//      118/125, 243/250, 424/425, 433/434, 509/516, 576/583). A sink that wrote
//      to the C7 chain would duplicate every one of them inside a hash-chained
//      log. The audit axis is taken; this one is not it.
//
//   2. NOT the outbox. C8 §5 makes a producer a database object —
//      `fn_outbox_publish` has EXECUTE revoked from every role including
//      service_role — and §8 makes 0 consumers ⇒ 0 rows. Reaching it means
//      re-issuing a security-critical RPC for zero delivered rows.
//
// THE VOLUME IS WHY FAILURE ISOLATION IS NOT OPTIONAL. One
// `buildAdminController()` emits 18 events (6 hubs + 12 modules), and
// `adminNavigation.ts` builds a controller on EVERY /admin request. A sink that
// could throw would take the whole Controller down 18 times a page.

const SOURCE = readFileSync(join(__dirname, '../events.ts'), 'utf8')

/**
 * The source with comments stripped.
 *
 * CORRECTED after the first RED run: four of the structural guards below were
 * scanning the whole file and failed on the module's OWN header, which
 * accurately explains that this sink is *not* the outbox — the words `outbox`,
 * `supabase` and `retry` appear there in prose saying exactly that. A guard
 * that cannot tell "this file imports the outbox" from "this comment says it
 * must not" is testing the wrong thing.
 *
 * This is a correction, not a relaxation: the guards now assert what they
 * always claimed — no CODE reference — and they would no longer be silenced by
 * someone moving a real import onto a commented line.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const hub = (id: string): HubDescriptor => ({
  id, name: id, version: '1.0.0', owner: 'test',
  navigationGroup: `nav.${id}`, navigationOrder: 10, lifecycle: 'stable',
})

const mod = (id: string, hubId: string): ModuleManifest => ({
  id, name: id, version: '1.0.0', owner: 'test', hub: hubId,
  capabilities: [], permissions: [], dependencies: [], routes: [`/x/${id}`],
  navigation: { label: `nav.${id}`, order: 0 },
  lifecycle: 'stable', status: 'enabled', compatibility: { controller: '^1' },
})

const event = (over: Partial<ControllerEvent> = {}): ControllerEvent => ({
  id: 'evt-1',
  type: 'controller.module.registered',
  version: '1.0.0',
  producer: 'controller.core',
  actor: null,
  timestamp: 1_700_000_000_000,
  correlationId: 'ctrl-1',
  securityClass: 'security',
  ...over,
})

/** Drive a real ControllerCore so the seven events are produced, not synthesised. */
function driveAllSevenLifecycleEvents(sink: EventSink) {
  const core = new ControllerCore({ controllerVersion: '1.0.0', events: sink })
  core.registerHub(hub('h1'))                       // hub.registered
  core.register(mod('m1', 'h1'))                    // module.registered
  core.register({ nonsense: true })                 // module.registration_failed
  core.disable('m1')                                // module.disabled
  core.enable('m1')                                 // module.enabled
  core.runIsolated('m1', () => { throw new Error('boom') }) // module.failure
  core.deregister('m1')                             // module.deregistered
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · A. the real sink exists and is not the no-op', () => {
  it('there is a canonical factory that returns an EventSink', () => {
    const sink = createObservabilityEventSink(() => {})
    expect(typeof sink.emit).toBe('function')
  })

  it('it is NOT the no-op sink', () => {
    const seen: ObservabilityRecord[] = []
    const real = createObservabilityEventSink((r) => seen.push(r))
    real.emit(event())
    expect(seen).toHaveLength(1)

    // The no-op, for contrast: same shape, observes nothing. That contrast is
    // the whole of K-3 — a sink that satisfies the interface while doing
    // nothing is exactly what Decision F calls a no-op Event Bus.
    const noop = createNoopEventSink()
    expect(() => noop.emit(event())).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · B. it receives all seven controller.* lifecycle events', () => {
  it('observes every one, driven through a real ControllerCore', () => {
    const seen: ObservabilityRecord[] = []
    driveAllSevenLifecycleEvents(createObservabilityEventSink((r) => seen.push(r)))

    // Driven, not hand-written: a test that emitted seven literals would pass
    // against a kernel that had stopped emitting any of them.
    expect(new Set(seen.map((r) => r.type))).toEqual(new Set([
      'controller.hub.registered',
      'controller.module.registered',
      'controller.module.registration_failed',
      'controller.module.enabled',
      'controller.module.disabled',
      'controller.module.deregistered',
      'controller.module.failure',
    ]))
  })

  it.each([
    'controller.hub.registered',
    'controller.module.registered',
    'controller.module.registration_failed',
    'controller.module.enabled',
    'controller.module.disabled',
    'controller.module.deregistered',
    'controller.module.failure',
  ])('%s reaches the sink', (type) => {
    const seen: ObservabilityRecord[] = []
    driveAllSevenLifecycleEvents(createObservabilityEventSink((r) => seen.push(r)))
    expect(seen.map((r) => r.type)).toContain(type)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · C. structured output that preserves the envelope', () => {
  it('carries the ControllerEvent fields, not a flattened string', () => {
    const seen: ObservabilityRecord[] = []
    createObservabilityEventSink((r) => seen.push(r)).emit(
      event({ id: 'evt-9', type: 'controller.module.enabled', payload: { moduleId: 'm1' } })
    )
    const r = seen[0]
    expect(r.type).toBe('controller.module.enabled')
    expect(r.id).toBe('evt-9')
    expect(r.producer).toBe('controller.core')
    expect(r.securityClass).toBe('security')
    expect(r.payload).toEqual({ moduleId: 'm1' })
  })

  it('the payload survives — a failure event keeps its message', () => {
    const seen: ObservabilityRecord[] = []
    driveAllSevenLifecycleEvents(createObservabilityEventSink((r) => seen.push(r)))
    const failure = seen.find((r) => r.type === 'controller.module.failure')
    expect(JSON.stringify(failure?.payload)).toContain('boom')
  })

  it('the record is JSON-serialisable — a platform log has to be able to take it', () => {
    const seen: ObservabilityRecord[] = []
    driveAllSevenLifecycleEvents(createObservabilityEventSink((r) => seen.push(r)))
    for (const r of seen) expect(() => JSON.stringify(r)).not.toThrow()
  })

  it('the default writer follows the repo console convention', () => {
    // Measured convention: `console.warn('[controller][owner] …')`,
    // `console.warn('[controller][auth] deny …')`,
    // `console.error('[admin][audit] insert failed:')`. No logger module exists,
    // so the prefix IS the convention. No new log schema is invented here.
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    )
    createObservabilityEventSink().emit(event())
    const calls = spies.flatMap((s) => s.mock.calls)
    expect(calls.length).toBeGreaterThan(0)
    expect(JSON.stringify(calls)).toMatch(/\[controller]\[event]/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · D. failure isolation — the acceptance criterion', () => {
  it('a throwing writer does not propagate to the caller', () => {
    const sink = createObservabilityEventSink(() => { throw new Error('writer down') })
    expect(() => sink.emit(event())).not.toThrow()
  })

  it('a rejecting async writer does not produce an unhandled rejection', async () => {
    const sink = createObservabilityEventSink(() => Promise.reject(new Error('async down')) as never)
    expect(() => sink.emit(event())).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
  })

  it('a broken sink does not break the Controller action behind it', () => {
    // The property that matters on production: `adminNavigation.ts` builds a
    // controller on every /admin request, and one build emits 18 events. A sink
    // that could throw would take the Controller down 18 times a page.
    const core = new ControllerCore({
      controllerVersion: '1.0.0',
      events: createObservabilityEventSink(() => { throw new Error('writer down') }),
    })
    expect(core.registerHub(hub('h1')).ok).toBe(true)
    expect(core.register(mod('m1', 'h1')).ok).toBe(true)
    expect(core.discover()).toHaveLength(1)
  })

  it('a throwing writer is reported, not silently dropped', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    createObservabilityEventSink(() => { throw new Error('writer down') }).emit(event())
    expect(err).toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · E. it is not a second audit trail', () => {
  it('the sink module imports no audit writer', () => {
    expect(CODE).not.toContain('writeAuditLog')
    expect(CODE).not.toContain('auditAdapter')
    expect(CODE).not.toMatch(/from '@\/lib\/admin\/audit'/)
  })

  it('the sink never calls audit.record', () => {
    expect(CODE).not.toContain('audit.record')
    expect(CODE).not.toContain('AuditSink')
  })

  it('audit stays where it is — the kernel still records all seven itself', () => {
    // The pairing is the reason this sink must not persist: duplicating it
    // would put every fact into the hash-chained log twice.
    const core = readFileSync(join(__dirname, '../core.ts'), 'utf8')
    expect((core.match(/this\.audit\.record\(/g) ?? []).length
      + (core.match(/this\.auditRegistrationFailure\(/g) ?? []).length).toBeGreaterThanOrEqual(7)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · F. it is not the outbox, and persists nothing', () => {
  it.each([
    'event_outbox', 'fn_outbox_publish', 'fn_outbox_claim', 'outbox',
    'createAdminClient', '@supabase', 'supabase',
  ])('the sink module does not reference %s', (needle) => {
    expect(CODE.toLowerCase()).not.toContain(needle.toLowerCase())
  })

  it('no retry and no queue', () => {
    expect(CODE).not.toMatch(/\bretry\b/i)
    expect(CODE).not.toMatch(/setTimeout|setInterval/)
  })

  it('creates no consumer', () => {
    expect(CODE).not.toContain('ConsumerDispatch')
    expect(CODE).not.toContain('consumes')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · G. it changes no authorization', () => {
  it.each(['permissionEngine', 'requirePermission', 'CAPABILITY_GATE_ENABLED', 'capabilities', 'authorize'])(
    'the sink module does not reference %s',
    (needle) => {
      expect(CODE).not.toContain(needle)
    }
  )

  it('the capability gate is untouched', async () => {
    const { CAPABILITY_GATE_ENABLED } = await import('@/lib/admin/permissions/engine')
    expect(CAPABILITY_GATE_ENABLED).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · H. the production wiring — NOOP is replaced', () => {
  it('buildAdminController() with no options observes its own lifecycle events', () => {
    // THE ACTUAL K-3 REQUIREMENT. Today every production call site passes no
    // sink and falls through to NOOP_EVENTS, so registering 6 hubs and 12
    // modules observes nothing at all.
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    )
    buildAdminController()
    const text = JSON.stringify(spies.flatMap((s) => s.mock.calls))
    expect(text).toContain('controller.hub.registered')
    expect(text).toContain('controller.module.registered')
  })

  it('an explicitly supplied sink still wins over the default', () => {
    const seen: ObservabilityRecord[] = []
    buildAdminController({ events: createObservabilityEventSink((r) => seen.push(r)) })
    expect(seen.length).toBeGreaterThanOrEqual(18) // 6 hubs + 12 modules
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · I. generic over ControllerEvent — no whitelist', () => {
  it('accepts an event type outside the current seven', () => {
    // A sink that filtered on a hard-coded list of seven strings would silently
    // drop the first event a future module emits. The contract is
    // `ControllerEvent`, not a fixed vocabulary.
    const seen: ObservabilityRecord[] = []
    createObservabilityEventSink((r) => seen.push(r)).emit(
      event({ type: 'commerce.order.refunded', producer: 'tappy.hub.commerce.orders' })
    )
    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('commerce.order.refunded')
  })

  it('the module declares no list of event names', () => {
    for (const type of ['controller.hub.registered', 'controller.module.failure']) {
      expect(CODE).not.toContain(`'${type}'`)
    }
  })

  it('no event type is invented by this module', () => {
    expect(CODE).not.toMatch(/commerce\.|analytics\.|marketing\./)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-3 · J. emission stays a fire-and-forget in-process call', () => {
  it('emit returns synchronously — it is not an awaited persistence path', () => {
    const sink = createObservabilityEventSink(() => {})
    expect(sink.emit(event())).toBeUndefined()
  })

  it('emitting many events does no I/O and stays fast', () => {
    // 18 events per controller build, and a build happens on every /admin
    // request. Not a benchmark — a guard against someone making emit await.
    const sink = createObservabilityEventSink(() => {})
    const started = performance.now()
    for (let i = 0; i < 1000; i++) sink.emit(event({ id: `evt-${i}` }))
    expect(performance.now() - started).toBeLessThan(500)
  })
})
