import SwiftUI
import Charts

/// One chart of a Deep Research report (web `ResearchChart`, Android `ResearchChartView`): the title with its unit, then one bar or one point
/// per label with its value, drawn by the app from figures the server checked in their own source (each figure's source number is in the
/// report's sources list). Bars or a line by the chart's `kind`; the numbers are written by `formatValue` in the report's language.
struct ResearchChartView: View {
    let chart: ResearchChart
    /// "vi" or "en": the language the figures are written in.
    let lang: String

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(ResearchChartModel.heading(chart))
                .font(TappyFont.footnote.weight(.semibold))
                .foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Chart {
                ForEach(chart.points.indices, id: \.self) { index in
                    let point = chart.points[index]
                    if chart.kind == .line {
                        LineMark(x: .value("label", point.label), y: .value("value", point.value))
                            .foregroundStyle(TappyColor.primary)
                        PointMark(x: .value("label", point.label), y: .value("value", point.value))
                            .foregroundStyle(TappyColor.primary)
                            .annotation(position: .top) { valueLabel(point.value) }
                    } else {
                        BarMark(x: .value("label", point.label), y: .value("value", point.value))
                            .foregroundStyle(TappyColor.primary)
                            .annotation(position: .top) { valueLabel(point.value) }
                    }
                }
            }
            // each figure carries its own label above it, so the value axis would only repeat them in the phone's number format
            .chartYAxis(.hidden)
            .frame(height: 160)
        }
        .padding(.vertical, Spacing.xs)
        // the drawing says nothing to VoiceOver: the title and every figure, read as one sentence
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(ResearchChartModel.summary(chart, lang)))
    }

    private func valueLabel(_ value: Double) -> some View {
        Text(formatValue(value, lang))
            .font(TappyFont.caption)
            .foregroundStyle(TappyColor.textSecondary)
    }
}
