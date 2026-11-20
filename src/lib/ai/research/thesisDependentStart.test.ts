import { describe, it, expect } from 'vitest'
import { releaseText } from './thesisReport'

// Independent review 20/11: the opening words "con", "song" and "cung" of the dependent-sentence rule are also ordinary Vietnamese openers ("Con người...", "Sông Hồng...", "Cung cấp điện..."): after any
// dropped sentence a correct, sourced sentence that opens with one was dropped with it. Only real connectors count ("Còn về...", "Cũng vậy, ...").
const sources = [
  { id: 1, title: 'S1', snippet: '', text: 'Doanh thu đạt 12.500 tỷ đồng.' },
  { id: 2, title: 'S2', snippet: '', text: 'Cung cấp điện năm 2024 đạt 700 MW. Con người làm việc 700 giờ. Sông Hồng dài 700 km. Cũng vậy, sản lượng đạt 700 MW.' },
]
const after = (second: string) => releaseText(`## 1. A\nDoanh thu đạt 99.999 tỷ đồng [1]. ${second} Có 700 MW điện [2]. Có 700 MW nữa [2].`, sources)

describe('a sentence after a dropped one', () => {
  it('stays when it opens with a word that is also an ordinary noun (cung cấp, con người, sông)', () => {
    expect(after('Cung cấp điện năm 2024 đạt 700 MW [2].').text).toContain('Cung cấp điện năm 2024')
    expect(after('Con người làm việc 700 giờ [2].').text).toContain('Con người làm việc')
    expect(after('Sông Hồng dài 700 km [2].').text).toContain('Sông Hồng dài')
  })
  it('still goes when it opens with a real connector', () => {
    expect(after('Cũng vậy, sản lượng đạt 700 MW [2].').text).not.toContain('Cũng vậy')
    expect(after('Nhưng sản lượng đạt 700 MW [2].').text).not.toContain('Nhưng sản lượng')
  })
})
