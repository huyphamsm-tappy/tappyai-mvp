import { describe, it, expect } from 'vitest'
import { arithmeticIssues } from './arithmeticCheck'

// Independent review 20/11: a percentage found anywhere within 40 characters after "from A to B" was read as the growth rate, so a correct sentence that also states a SHARE ("chiếm 15% thị phần")
// was flagged and dropped. With no rise/fall word, the percentage counts only when it stands right after the two levels ("(20%)", ", tức 20%").
describe('arithmeticIssues: a percentage with no rise/fall word', () => {
  it('an unrelated percentage later in the sentence is not read as the growth rate', () => {
    expect(arithmeticIssues('Doanh số tăng từ 2,1 lên 3,4 triệu xe, chiếm 15% thị phần.')).toEqual([])
    expect(arithmeticIssues('Giá đi từ 100 lên 120 nghìn đồng, trong khi lạm phát ở mức 3,2%.')).toEqual([])
  })
  it('a percentage right after the two levels is still checked, right or wrong', () => {
    expect(arithmeticIssues('Doanh số từ 100 lên 120 (20%).')).toEqual([])
    expect(arithmeticIssues('Doanh số từ 100 lên 120 (25%).')).toHaveLength(1)
    expect(arithmeticIssues('Doanh số tăng từ 100 lên 120, tức 25%.')).toHaveLength(1)
    expect(arithmeticIssues('Doanh số tăng từ 100 lên 120, tức 20%.')).toEqual([])
  })
  it('with a rise or fall word the percentage is checked as before', () => {
    expect(arithmeticIssues('Doanh số từ 100 lên 120, tăng 25%.')).toHaveLength(1)
    expect(arithmeticIssues('Doanh số từ 100 xuống 80, giảm 20%.')).toEqual([])
    expect(arithmeticIssues('Doanh số từ 100 lên 120, giảm 20%.')).toHaveLength(1)
  })
})
