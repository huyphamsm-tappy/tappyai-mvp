import SwiftUI
import WebKit

/// In-app muted/looping YouTube embed for feed clips whose `sourceType == "youtube"`.
///
/// Matches Web's behavior (Production Knowledge Base §2/§11): YouTube-sourced reviews autoplay
/// in-app (muted, looping, no controls) while TikTok/Facebook — no longer even creatable, see
/// `ExternalSource` — stay external-link-only. `ReviewPostView` renders this only for `youtube`.
///
/// UNVERIFIED — no Simulator/device available in this environment. `WKWebView` autoplay of muted
/// video requires exactly the configuration below (`mediaTypesRequiringUserActionForPlayback = []`,
/// `allowsInlineMediaPlayback = true`); this is Apple's documented mechanism but has not been
/// runtime-confirmed here. Verify on first real device/Simulator run.
struct YouTubeEmbedView: UIViewRepresentable {
    let videoId: String
    /// Reloads the player when it becomes the active slide; a background/inactive slide is torn
    /// down to a blank page rather than left playing off-screen (mirrors the existing
    /// `FeedVideoPlayer` "only the active/neighbor clip loads media" rule).
    let isActive: Bool

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard isActive else {
            if webView.url != nil { webView.loadHTMLString("", baseURL: nil) }
            return
        }
        guard webView.url == nil else { return }
        webView.loadHTMLString(Self.embedHTML(videoId: videoId), baseURL: URL(string: "https://www.youtube.com"))
    }

    private static func embedHTML(videoId: String) -> String {
        """
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
        <style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
        iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}</style>
        </head><body>
        <iframe src="https://www.youtube.com/embed/\(videoId)?autoplay=1&mute=1&loop=1&playlist=\(videoId)&controls=0&playsinline=1&modestbranding=1&rel=0"
        allow="autoplay; encrypted-media" playsinline></iframe>
        </body></html>
        """
    }
}
