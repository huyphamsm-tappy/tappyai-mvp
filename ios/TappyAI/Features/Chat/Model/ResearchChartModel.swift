import Foundation

/// The words around a report chart (web `ResearchChart`, Android `ResearchChartView`): the heading it carries and the sentence VoiceOver
/// reads in place of the drawing. The figures are the server's checked ones, written by `formatValue` in the report's language.
enum ResearchChartModel {

    /// The chart's title, with its unit in brackets when it has one.
    static func heading(_ chart: ResearchChart) -> String {
        let unit = chart.unit.trimmingCharacters(in: .whitespacesAndNewlines)
        return unit.isEmpty ? chart.title : "\(chart.title) (\(unit))"
    }

    /// "Chart: title (unit). label: value; label: value" (Vietnamese: "Biểu đồ: ...").
    static func summary(_ chart: ResearchChart, _ lang: String) -> String {
        let figures = chart.points.map { "\($0.label): \(formatValue($0.value, lang))" }.joined(separator: "; ")
        return "\(lang == "vi" ? "Biểu đồ" : "Chart"): \(heading(chart)). \(figures)"
    }
}
