import SwiftUI
import WebKit

/// The legal documents are the web's `/privacy` and `/terms`, not a native summary.
///
/// The native screens used to be five and six hardcoded Vietnamese paragraphs — a different text
/// from the published policy, with a contact address on a domain the site does not use. The App
/// Store reviewer and the user must read the SAME document the website publishes, so the app
/// shows that page.
///
/// Language: those pages are public, so the web picks the reader's language from
/// `localStorage.tappy_lang` (an explicit choice) and otherwise the browser's language. A web view
/// would therefore follow the DEVICE language; the app's own choice is written to `tappy_lang`
/// before the page's scripts run, which is exactly what the web's own language picker does.
enum LegalDocument: String, CaseIterable {
    case privacy, terms

    var url: URL { URL(string: "\(TappyShare.canonicalOrigin)/\(rawValue)")! }
    var titleKey: String { "legal.\(rawValue).navTitle" }

    /// "vi" or "en" — the web knows only those two.
    static func webLocale(for appLanguage: String) -> String {
        appLanguage.lowercased().hasPrefix("vi") ? "vi" : "en"
    }

    /// Runs at document start, before the page reads its locale.
    static func localeScript(for appLanguage: String) -> String {
        "try { window.localStorage.setItem('tappy_lang', '\(webLocale(for: appLanguage))') } catch (e) {}"
    }
}

struct LegalPageView: View {
    let document: LegalDocument
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        ZStack {
            if failed {
                VStack(spacing: Spacing.md) {
                    Text("legal.loadFailed")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)
                    Link(destination: document.url) {
                        Text("legal.openInBrowser")
                            .font(.system(size: 15, weight: .semibold))
                    }
                }
                .padding(Spacing.lg)
            } else {
                LegalWebView(url: document.url,
                             localeScript: LegalDocument.localeScript(for: LocalizationManager.currentLanguageCode),
                             loading: $loading, failed: $failed)
                if loading { ProgressView() }
            }
        }
        .background(TappyColor.background)
        .navigationTitle(Text(LocalizedStringKey(document.titleKey)))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Link(destination: document.url) { Image(systemName: "safari") }
                    .accessibilityLabel(Text("legal.openInBrowser"))
            }
        }
    }
}

/// Route names kept, so Settings and the shell do not change.
struct PrivacyPolicyView: View {
    var body: some View { LegalPageView(document: .privacy) }
}

struct TermsOfServiceView: View {
    var body: some View { LegalPageView(document: .terms) }
}

private struct LegalWebView: UIViewRepresentable {
    let url: URL
    let localeScript: String
    @Binding var loading: Bool
    @Binding var failed: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            WKUserScript(source: localeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let parent: LegalWebView
        init(_ parent: LegalWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.loading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.loading = false
            parent.failed = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.loading = false
            parent.failed = true
        }

        /// Links out of the legal page (mailto:, other sites) open outside the app.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard navigationAction.navigationType == .linkActivated,
                  let target = navigationAction.request.url,
                  target.host != parent.url.host
            else {
                decisionHandler(.allow)
                return
            }
            UIApplication.shared.open(target)
            decisionHandler(.cancel)
        }
    }
}
