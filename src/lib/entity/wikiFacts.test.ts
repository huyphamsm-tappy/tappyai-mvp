// 15/11 (owner's mockup, the profile panel's data table): structured facts from Wikidata, only the known properties, only on fixed hosts, never invented. Real payload shapes, fake network.
import { describe, it, expect, beforeEach } from 'vitest'
import { timeText, factsFromClaims, fetchWikiFacts, lookupWikiFacts, __clearWikiFactsCache, type GetText } from './wikiFacts'

const item = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } })
const time = (t: string, precision: number) => ({ mainsnak: { datavalue: { value: { time: t, precision } } } })

describe('timeText', () => {
  it('a year when the precision is a year or coarser, month/year, a full date; BCE and junk are no date', () => {
    expect(timeText({ time: '+1971-06-28T00:00:00Z', precision: 11 }, 'vi')).toBe('28/06/1971')
    expect(timeText({ time: '+1971-06-28T00:00:00Z', precision: 11 }, 'en')).toBe('06/28/1971')
    expect(timeText({ time: '+2017-06-00T00:00:00Z', precision: 10 }, 'vi')).toBe('06/2017')
    expect(timeText({ time: '+1911-01-01T00:00:00Z', precision: 9 }, 'vi')).toBe('1911')
    expect(timeText({ time: '-0500-01-01T00:00:00Z', precision: 9 }, 'vi')).toBeNull()
    expect(timeText({ time: 'soon', precision: 11 }, 'vi')).toBeNull()
    expect(timeText(undefined, 'vi')).toBeNull()
  })
})

describe('factsFromClaims', () => {
  const labels: Record<string, string> = { Q5: 'con người', Q258: 'Nam Phi', Q30: 'Hoa Kỳ', Q1: 'Pretoria', Q2: 'Wharton', Q3: 'kỹ sư', Q4: 'chủ doanh nghiệp', Q6: 'ô tô', Q7: 'Palo Alto', Q8: 'Elon Musk' }
  const labelOf = (id: string) => labels[id]
  it('a person: born (date and place), citizenship, education, occupation - in the person\'s language, in a fixed order', () => {
    const f = factsFromClaims({ P31: [item('Q5')], P569: [time('+1971-06-28T00:00:00Z', 11)], P19: [item('Q1')], P27: [item('Q258'), item('Q30')], P69: [item('Q2')], P106: [item('Q3'), item('Q4')] }, labelOf, 'vi')
    expect(f).toEqual([
      { label: 'Sinh', value: '28/06/1971 (Pretoria)' }, { label: 'Quốc tịch', value: 'Nam Phi, Hoa Kỳ' }, { label: 'Học vấn', value: 'Wharton' }, { label: 'Nghề nghiệp', value: 'kỹ sư, chủ doanh nghiệp' },
    ])
    expect(factsFromClaims({ P31: [item('Q5')], P27: [item('Q30')] }, labelOf, 'en')[0]).toEqual({ label: 'Citizenship', value: 'Hoa Kỳ' })
  })
  it('an organisation: founded, headquarters, industry, founder, CEO; no headcount (Wikidata keeps old ones beside new ones)', () => {
    const f = factsFromClaims({ P31: [item('Q4830453')], P571: [time('+2003-07-01T00:00:00Z', 11)], P159: [item('Q7')], P452: [item('Q6')], P112: [item('Q8')], P169: [item('Q8')], P1128: [{ mainsnak: { datavalue: { value: { amount: '+7000' } } } }] }, labelOf, 'vi')
    expect(f.map(x => x.label)).toEqual(['Thành lập', 'Trụ sở', 'Lĩnh vực', 'Người sáng lập', 'Giám đốc điều hành'])
    expect(JSON.stringify(f)).not.toContain('7000')
  })
  it('an item with no label, a deprecated value and a malformed id are left out; nothing known = no facts', () => {
    expect(factsFromClaims({ P31: [item('Q5')], P27: [item('Q999999')] }, labelOf, 'vi')).toEqual([])
    expect(factsFromClaims({ P31: [item('Q5')], P27: [{ rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q30' } } } }] }, labelOf, 'vi')).toEqual([])
    expect(factsFromClaims({ P31: [item('Q5')], P27: [item('Q30; DROP')] }, labelOf, 'vi')).toEqual([])
    expect(factsFromClaims({}, labelOf, 'vi')).toEqual([])
  })
})

const wiki = { query: { pages: [{ pageprops: { wikibase_item: 'Q317521' } }] } }
const entity = { entities: { Q317521: { claims: { P31: [item('Q5')], P569: [time('+1971-06-28T00:00:00Z', 11)], P27: [item('Q30')] } } } }
const labelsJson = { entities: { Q5: { labels: { en: { value: 'human' } } }, Q30: { labels: { vi: { value: 'Hoa Kỳ' }, en: { value: 'United States' } } } } }
const route = (urls: string[]): GetText => async url => {
  urls.push(url)
  const u = new URL(url)
  const body = u.hostname.endsWith('wikipedia.org') ? wiki : u.searchParams.get('props') === 'claims' ? entity : labelsJson
  return { text: JSON.stringify(body), finalUrl: url }
}

describe('fetchWikiFacts', () => {
  beforeEach(() => __clearWikiFactsCache())
  it('article -> Wikidata id -> claims -> labels: three bounded requests, on the article\'s Wikipedia and wikidata.org only', async () => {
    const urls: string[] = []
    const r = await fetchWikiFacts('Elon Musk', 'en', 'vi', route(urls))
    expect(r).toEqual({ facts: [{ label: 'Sinh', value: '28/06/1971' }, { label: 'Quốc tịch', value: 'Hoa Kỳ' }], wikidata: 'https://www.wikidata.org/wiki/Q317521' })
    expect(urls.map(u => new URL(u).hostname)).toEqual(['en.wikipedia.org', 'www.wikidata.org', 'www.wikidata.org'])
  })
  it('a title that is not valid, no Wikidata item, a redirect to another host, bad JSON or a failing network: null, never a throw, and nothing is fetched for a bad title', async () => {
    const urls: string[] = []
    expect(await fetchWikiFacts('../../etc/passwd', 'en', 'vi', route(urls))).toBeNull()
    expect(await fetchWikiFacts('//evil.test/x', 'en', 'vi', route(urls))).toBeNull()
    expect(urls).toHaveLength(0)
    expect(await fetchWikiFacts('X', 'en', 'vi', async url => ({ text: JSON.stringify({ query: { pages: [{}] } }), finalUrl: url }))).toBeNull()
    expect(await fetchWikiFacts('X', 'en', 'vi', async () => ({ text: JSON.stringify(wiki), finalUrl: 'https://evil.example/x' }))).toBeNull()
    expect(await fetchWikiFacts('X', 'en', 'vi', async url => ({ text: 'not json', finalUrl: url }))).toBeNull()
    expect(await fetchWikiFacts('X', 'en', 'vi', async () => { throw new Error('down') })).toBeNull()
    expect(await fetchWikiFacts('X', 'en', 'vi', async url => ({ text: JSON.stringify(new URL(url).hostname.endsWith('wikipedia.org') ? { query: { pages: [{ pageprops: { wikibase_item: 'Q1;DROP' } }] } } : entity), finalUrl: url }))).toBeNull() // a malformed id is never used
  })
  it('the lookup is cached: a subject is asked once', async () => {
    const urls: string[] = []
    const g = route(urls)
    await lookupWikiFacts('Elon Musk', 'en', 'vi', g)
    await lookupWikiFacts('elon musk', 'en', 'vi', g)
    expect(urls).toHaveLength(3)
  })
})
