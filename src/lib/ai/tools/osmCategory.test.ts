import { describe, it, expect } from 'vitest'
import { osmCategoryFor, osmUnionFor, placeDomainFor } from './osmCategory'

// ─────────────────────────────────────────────────────────────────────────────
// A WRONG OSM TAG KEY IS SILENT. It does not throw and it does not 4xx — it
// returns an empty element list, which becomes `place_search_status: 'empty'`
// and reads to the user as "there are no spas in District 1".
//
// Every tag asserted below was measured against live Overpass on 2026-09-08.
// The counts are recorded in osmCategory.ts; these tests lock the CONCLUSIONS
// so the next edit cannot quietly reintroduce a dead key.
// ─────────────────────────────────────────────────────────────────────────────

const keys = (q: string, t?: string) => osmCategoryFor(q, t).selectors.map(s => `${s.key}${s.op}${s.value}`)

describe('🚨 spa — amenity=spa is dead in VN OSM data', () => {
  // MEASURED: amenity=spa → 0 named at Hanoi r=5000, HCMC Q1 r=5000, Da Nang r=6000.
  //           shop=massage → 60 / 60 / 40 named over the same three probes.
  it('queries shop=massage, where VN spas actually are', () => {
    for (const q of ['spa', 'massage thu gian', 'Massage thư giãn ở Quận 1', 'gội đầu']) {
      expect(keys(q), q).toContain('shop=massage')
    }
  })

  it('🚨 a plain spa query does NOT drag in shop=beauty', () => {
    // Measured: with shop=beauty in the union, "Spa tốt ở Hà Nội" led with
    // "Tiệm Nail Phương Chuột" and two cosmetics shops. Real places, wrong question.
    for (const q of ['spa', 'Spa tốt ở Hà Nội', 'massage thư giãn']) {
      expect(keys(q), q).not.toContain('shop=beauty')
    }
  })

  it('a BEAUTY-CARE query widens to shop=beauty, and keeps the treatment tags', () => {
    for (const q of ['làm đẹp', 'nail đẹp gần đây', 'chăm sóc da', 'thẩm mỹ viện']) {
      expect(keys(q), q).toContain('shop=beauty')
      expect(keys(q), q).toContain('shop=massage')
      expect(osmCategoryFor(q).label, q).toBe('spa')
    }
  })

  it('the query widens the tags even when the type already said spa', () => {
    // Tags and domain answer different questions: the domain stays spa either way.
    expect(keys('làm đẹp', 'spa')).toContain('shop=beauty')
    expect(keys('massage', 'spa')).not.toContain('shop=beauty')
  })

  it('an explicit type=spa maps the same way as the keyword', () => {
    expect(keys('cho toi vai goi y', 'spa')).toEqual(keys('spa'))
  })

  it('🚨 never leaves amenity=spa as the ONLY selector', () => {
    const sels = keys('spa')
    expect(sels).not.toEqual(['amenity=spa'])
    // Kept as a trailing selector: it is the correct upstream tag, merely sparse
    // in VN. Dropping it would lose the rows that DO carry it.
    expect(sels).toContain('amenity=spa')
    expect(sels.indexOf('shop=massage')).toBeLessThan(sels.indexOf('amenity=spa'))
  })

  it('reports itself as a spa, not as its underlying shop tag', () => {
    expect(osmCategoryFor('spa').label).toBe('spa')
  })
})

describe('🚨 gym — amenity=gym is dead too', () => {
  // MEASURED: amenity=gym → 0 named (Hanoi r=6000, HCMC Q1 r=6000);
  //           leisure=fitness_centre → 21 / 39 named.
  it('queries leisure=fitness_centre first', () => {
    for (const q of ['gym', 'phong gym gan day', 'fitness']) {
      expect(keys(q)[0], q).toBe('leisure=fitness_centre')
    }
    expect(keys('bat ky', 'gym')[0]).toBe('leisure=fitness_centre')
  })
})

describe('categories that were measured CORRECT stay untouched', () => {
  // amenity=cinema → 16 named (Hanoi r=6000); 3 (HN) / 4 (HCMC) at the r=1500
  // dense-metro radius the caller really uses. Do not re-test this by hand.
  it('cinema is a plain amenity', () => {
    for (const q of ['cinema', 'rap chieu phim', 'Phim hay đang chiếu']) {
      expect(keys(q), q).toEqual(['amenity=cinema'])
    }
  })

  it('hotels keep the tourism key the earlier fix established', () => {
    expect(keys('khach san Nha Trang')).toEqual(['tourism=hotel'])
    expect(keys('anything', 'hotel')).toEqual(['tourism=hotel'])
  })

  it('attractions keep their regex over tourism subtypes', () => {
    expect(keys('diem tham quan Da Nang')).toEqual([
      'tourism~attraction|museum|viewpoint|theme_park|zoo|gallery',
    ])
    expect(osmCategoryFor('bat ky', 'attraction').label).toBe('attraction')
  })

  it('cafe, bar and the food default are unchanged', () => {
    expect(keys('ca phe yen tinh')).toEqual(['amenity=cafe'])
    expect(keys('quan bar')).toEqual(['amenity=bar'])
    expect(keys('an gi toi nay')).toEqual(['amenity=restaurant'])
  })

  it('the non-leisure utility branches survived the move', () => {
    expect(keys('benh vien gan day')).toEqual(['amenity=hospital'])
    expect(keys('mua thuoc')).toEqual(['amenity=pharmacy'])
    expect(keys('atm gan day')).toEqual(['amenity=bank'])
  })
})

describe('an explicit type outranks query-keyword guessing', () => {
  it('type=attraction wins even when the query names a restaurant', () => {
    expect(osmCategoryFor('nha hang ngon', 'attraction').label).toBe('attraction')
  })

  it('an unknown type falls through to the keyword ladder, not to a bad tag', () => {
    expect(keys('spa cao cap', 'karaoke')).toContain('shop=massage')
    expect(keys('khong ro', 'karaoke')).toEqual(['amenity=restaurant'])
  })
})

describe('osmUnionFor — every selector becomes node AND way', () => {
  const cat = osmCategoryFor('spa')

  it('emits one node and one way clause per selector', () => {
    const q = osmUnionFor(cat, '', 1500, 10.7756, 106.7019)
    expect((q.match(/^node|;node/g) || []).length).toBe(cat.selectors.length)
    expect((q.match(/;way/g) || []).length).toBe(cat.selectors.length)
    expect(q).toContain('node["shop"="massage"]["name"](around:1500,10.7756,106.7019);')
    expect(q).toContain('way["amenity"="spa"]["name"](around:1500,10.7756,106.7019);')
  })

  it('🚨 the caller constraint reaches EVERY branch of the union', () => {
    // Applying it to only the first selector would let the other branches return
    // unconstrained rows that the reply would then describe as constrained.
    const q = osmUnionFor(cat, '["cuisine"~"vegetarian"]', 1500, 21.0285, 105.8542)
    expect((q.match(/\["cuisine"~"vegetarian"\]/g) || []).length).toBe(cat.selectors.length * 2)
  })

  it('a single-selector category is byte-identical to the old inline shape', () => {
    expect(osmUnionFor(osmCategoryFor('an gi'), '', 5000, 16.0544, 108.2022)).toBe(
      'node["amenity"="restaurant"]["name"](around:5000,16.0544,108.2022);'
      + 'way["amenity"="restaurant"]["name"](around:5000,16.0544,108.2022);',
    )
  })

  it('the whole union parses as one Overpass statement list', () => {
    const q = osmUnionFor(cat, '', 1500, 21.0285, 105.8542)
    expect(q.endsWith(';')).toBe(true)
    expect(q).not.toContain(';;')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE DOMAIN AND THE TAG MAPPING MUST NOT DISAGREE.
//
// A place turn that retrieves real rows can still render nothing: the domain
// boundary in `placeRecommendations` rejects any row whose OSM tag belongs to a
// DIFFERENT domain's admit list. So a misclassified domain destroys a correct
// retrieval silently — measured on "Phòng gym gần Hoàn Kiếm Hà Nội", which
// returned six real gyms and showed no card.
// ─────────────────────────────────────────────────────────────────────────────

describe('🚨 placeDomainFor — an explicit type decides alone', () => {
  it('🚨 "phòng gym" is entertainment, not food', () => {
    // `pho` without a word boundary matched inside normalizeVN('phòng') === 'phong'.
    expect(placeDomainFor('phòng gym gần Hoàn Kiếm Hà Nội', 'gym')).toBe('entertainment')
    expect(placeDomainFor('phòng gym gần Hoàn Kiếm Hà Nội')).toBe('entertainment')
  })

  it('🚨 a street ("phố") does not make a query about food', () => {
    expect(placeDomainFor('rạp chiếu phim ở phố Huế')).toBe('entertainment')
    expect(placeDomainFor('phòng khám gần đây')).toBe('place')
  })

  it('the food words it was meant to catch still catch', () => {
    for (const q of ['phở ngon Hà Nội', 'cơm tấm Sài Gòn', 'bún bò Huế', 'quán ăn ngon', 'cà phê yên tĩnh']) {
      expect(placeDomainFor(q), q).toBe('food')
    }
  })

  it('a stated type overrides any keyword in the query', () => {
    // The model named the category; the query text does not get a second vote.
    expect(placeDomainFor('quán ăn gần rạp phim', 'cinema')).toBe('entertainment')
    expect(placeDomainFor('spa trong nhà hàng', 'spa')).toBe('spa')
    expect(placeDomainFor('phở ngon', 'restaurant')).toBe('food')
  })

  it('hotel and attraction are places, not miscategorised restaurants', () => {
    expect(placeDomainFor('khách sạn Nha Trang', 'hotel')).toBe('place')
    expect(placeDomainFor('điểm tham quan Đà Nẵng', 'attraction')).toBe('place')
  })

  it('spa and entertainment keywords still work without a type', () => {
    expect(placeDomainFor('massage thư giãn ở Quận 1')).toBe('spa')
    expect(placeDomainFor('chăm sóc da')).toBe('spa')
    expect(placeDomainFor('karaoke gần đây')).toBe('entertainment')
    expect(placeDomainFor('rạp chiếu phim')).toBe('entertainment')
  })

  it('an unmatched query is a plain place, never the food default', () => {
    expect(placeDomainFor('địa điểm ở Quận 1')).toBe('place')
  })

  it('🚨 the domain and the tag mapping agree on every stated type', () => {
    // If these two ever disagree, retrieval succeeds and the boundary throws the
    // rows away — the exact shape of the gym defect.
    const agree: Array<[string, string, string]> = [
      ['spa', 'spa', 'shop=massage'],
      ['gym', 'entertainment', 'leisure=fitness_centre'],
      ['cinema', 'entertainment', 'amenity=cinema'],
      ['bar', 'entertainment', 'amenity=bar'],
      ['restaurant', 'food', 'amenity=restaurant'],
      ['cafe', 'food', 'amenity=cafe'],
      ['hotel', 'place', 'tourism=hotel'],
    ]
    for (const [type, domain, firstTag] of agree) {
      expect(placeDomainFor('bat ky', type), type).toBe(domain)
      expect(keys('bat ky', type)[0], type).toBe(firstTag)
    }
  })
})
