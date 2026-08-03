import type { RiskLevel, EvidenceReport, OfficialEntity, RecommendedAction } from '../types'

export function getRecommendedActions(
  level: RiskLevel,
  _evidence: EvidenceReport,
  directoryMatch: OfficialEntity | null,
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

    case 'LOW':
    case 'SAFE':
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
