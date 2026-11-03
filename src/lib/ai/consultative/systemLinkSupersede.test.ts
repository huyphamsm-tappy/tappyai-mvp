import { describe, it, expect } from 'vitest'
import { createSystemLinkLedger, DATED_LINK_TOOLS } from './systemLinkSupersede'

// 03/11 (owner's 14-turn conversation, turn 12 "vé máy bay đi Quy Nhơn cuối tuần sau"): the model searched fares for 13/11, changed its mind and searched
// 7/11; the reply said 7-8/11 but the buttons under it were the 13-15/11 links of the FIRST search. A link is only as right as the dates it was built
// for, so for the tools whose links carry a date the LATEST call of the turn owns the links.
const L = (n: string, d: string) => ({ name: n, url: `https://x.example/${n}?d=${d}` })

describe('system links of date-bound tools (03/11)', () => {
  it('the later fare search replaces the links of the earlier one', () => {
    const led = createSystemLinkLedger()
    led.record('get_flight_prices', [L('Trip.com', '2026-11-13'), L('Traveloka', '2026-11-13')])
    led.record('get_flight_prices', [L('Trip.com', '2026-11-07'), L('Traveloka', '2026-11-07')])
    expect(led.links().map(l => l.url)).toEqual(['https://x.example/Trip.com?d=2026-11-07', 'https://x.example/Traveloka?d=2026-11-07'])
  })
  it('a later fare search with NO links also drops the earlier ones (their dates are no longer what was asked)', () => {
    const led = createSystemLinkLedger()
    led.record('get_flight_prices', [L('Trip.com', '2026-11-13')])
    led.record('get_flight_prices', [])
    expect(led.links()).toEqual([])
  })
  it('other tools keep every link: two product searches are two products', () => {
    const led = createSystemLinkLedger()
    led.record('search_products', [L('Shopee', 'a')])
    led.record('search_products', [L('Lazada', 'b')])
    expect(led.links().map(l => l.name)).toEqual(['Shopee', 'Lazada'])
  })
  it('links of different tools do not touch each other', () => {
    const led = createSystemLinkLedger()
    led.record('get_flight_prices', [L('Trip.com', '1')])
    led.record('get_transport_options', [L('Vexere', '1')])
    led.record('get_flight_prices', [L('Trip.com', '2')])
    expect(led.links().map(l => l.url)).toEqual(['https://x.example/Trip.com?d=2', 'https://x.example/Vexere?d=1'])
  })
  it('the same url from two calls is listed once', () => {
    const led = createSystemLinkLedger()
    led.record('search_products', [L('Shopee', 'a')])
    led.record('search_events', [L('Shopee', 'a')])
    expect(led.links()).toHaveLength(1)
  })
  it('the dated tools are the fare and the coach/train search', () => {
    expect([...DATED_LINK_TOOLS].sort()).toEqual(['get_flight_prices', 'get_transport_options'])
  })
})
