import type { RiskLevel, EvidenceReport, OfficialEntity, RecommendedAction } from '../types'
import { MIN_CONFIDENCE_FOR_SAFE } from '../config'

/**
 * [confidence] is the share of the evidence base that actually completed, and it is only
 * consulted on the reassuring branch — deliberately, and not symmetrically.
 *
 * A LOW/SAFE level means "no provider reported anything bad", which is indistinguishable from
 * "no provider reported anything at all": calculateRisk only sums COMPLETED signals, so a total
 * provider outage yields score 0, confidence 0, and — before `levelFor` — the level SAFE. Telling
 * someone a link "appears safe" on the strength of zero completed checks is the one false
 * negative this feature cannot afford.
 *
 * That rule now also lives one layer up, in `levelFor`, so `risk.level` itself reports
 * `INCONCLUSIVE` rather than SAFE and no client can render a green shield over it. This function
 * keeps its own check regardless — it is not reachable only through `calculateRisk`.
 *
 * A warning, on the other hand, is evidence-positive — some provider did complete and did find
 * something — so partial data never suppresses it. Low confidence can withdraw reassurance; it
 * must never withdraw a warning.
 */
export function getRecommendedActions(
  level: RiskLevel,
  _evidence: EvidenceReport,
  directoryMatch: OfficialEntity | null,
  confidence = 100,
): RecommendedAction[] {
  const actions: RecommendedAction[] = []

  switch (level) {
    case 'CRITICAL':
    case 'HIGH':
      actions.push({
        priority: 'primary', action: 'DO_NOT_OPEN',
        label_vi: 'KHÔNG mở liên kết này',
        label_en: 'Do NOT open this link',
        icon: 'stop',
      })
      if (directoryMatch) {
        actions.push({
          priority: 'primary', action: 'USE_OFFICIAL',
          label_vi: `Truy cập trang chính thức: ${directoryMatch.website}`,
          label_en: `Visit the official site: ${directoryMatch.website}`,
          icon: 'link',
        })
        if (directoryMatch.hotline) {
          actions.push({
            priority: 'secondary', action: 'CALL_HOTLINE',
            label_vi: `Gọi hotline chính thức: ${directoryMatch.hotline}`,
            label_en: `Call official hotline: ${directoryMatch.hotline}`,
            icon: 'phone',
          })
        }
      }
      actions.push({
        priority: 'secondary', action: 'REPORT',
        label_vi: 'Báo cáo lừa đảo',
        label_en: 'Report this scam',
        icon: 'flag',
      })
      break

    case 'MEDIUM':
      actions.push({
        priority: 'primary', action: 'PROCEED_WITH_CAUTION',
        label_vi: 'Cần cẩn thận khi truy cập',
        label_en: 'Proceed with caution',
        icon: 'warning',
      })
      actions.push({
        priority: 'secondary', action: 'VERIFY_IDENTITY',
        label_vi: 'Xác minh danh tính trang web trước khi nhập thông tin',
        label_en: 'Verify the site identity before entering information',
        icon: 'search',
      })
      if (directoryMatch) {
        actions.push({
          priority: 'secondary', action: 'CHECK_OFFICIAL',
          label_vi: `Kiểm tra trang chính thức: ${directoryMatch.website}`,
          label_en: `Compare with the official site: ${directoryMatch.website}`,
          icon: 'link',
        })
      }
      break

    case 'INCONCLUSIVE':
    case 'LOW':
    case 'SAFE':
      // `INCONCLUSIVE` already IS this branch's conclusion — `levelFor` applied exactly the same
      // rule upstream. The confidence check stays anyway, and stays first, because it also guards
      // a caller that hands this function a level it derived itself; belt and braces on the one
      // branch where being wrong means telling someone an unchecked link is fine.
      if (level === 'INCONCLUSIVE' || confidence < MIN_CONFIDENCE_FOR_SAFE) {
        // Not a verdict — a statement that there is no verdict. It must not read as reassurance.
        actions.push({
          priority: 'primary', action: 'INCONCLUSIVE',
          label_vi: 'Chưa kiểm tra được đầy đủ — chưa thể kết luận liên kết này an toàn',
          label_en: 'The check could not complete — this link cannot be confirmed safe',
          icon: 'warning',
        })
        actions.push({
          priority: 'secondary', action: 'VERIFY_IDENTITY',
          label_vi: 'Tự xác minh danh tính trang web trước khi nhập thông tin',
          label_en: 'Verify the site identity yourself before entering information',
          icon: 'search',
        })
        if (directoryMatch) {
          actions.push({
            priority: 'secondary', action: 'CHECK_OFFICIAL',
            label_vi: `Kiểm tra trang chính thức: ${directoryMatch.website}`,
            label_en: `Compare with the official site: ${directoryMatch.website}`,
            icon: 'link',
          })
        }
        break
      }
      actions.push({
        priority: 'primary', action: 'LIKELY_SAFE',
        label_vi: 'Liên kết có vẻ an toàn',
        label_en: 'This link appears safe',
        icon: 'check',
      })
      break
  }

  return actions
}
