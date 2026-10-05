import SwiftUI
import UIKit

struct VerticalPagingView<Content: View>: UIViewControllerRepresentable {
    let pageCount: Int
    @Binding var currentPage: Int
    let onPageChange: (Int) -> Void
    let onNearEnd: () -> Void
    @ViewBuilder let content: (Int) -> Content

    func makeUIViewController(context: Context) -> PagingViewController<Content> {
        let vc = PagingViewController<Content>()
        vc.dataSource = context.coordinator
        vc.delegate = context.coordinator
        context.coordinator.parent = self
        context.coordinator.pagingVC = vc
        if pageCount > 0 {
            // Open AT `currentPage` (a profile's clip viewer starts at the tapped clip); it used to open at page 0 whatever was asked.
            let start = max(0, min(currentPage, pageCount - 1))
            context.coordinator.currentIndex = start
            let first = makeHosting(index: start)
            vc.setViewControllers([first], direction: .forward, animated: false)
        }
        return vc
    }

    func updateUIViewController(_ vc: PagingViewController<Content>, context: Context) {
        context.coordinator.parent = self
        if currentPage != context.coordinator.currentIndex, pageCount > 0 {
            // Programmatic navigation (deep-link, tab reset).
            let direction: UIPageViewController.NavigationDirection = currentPage > context.coordinator.currentIndex ? .forward : .reverse
            let hosting = makeHosting(index: currentPage)
            context.coordinator.currentIndex = currentPage
            vc.setViewControllers([hosting], direction: direction, animated: false)
        }
        // After every state change (including the user swiping a new page into view),
        // push fresh SwiftUI state — especially `isActive` and `isNeighbor` — into the
        // already-visible hosting controllers. Without this, pre-fetched VCs (created
        // when isActive was false) never receive the updated value because `isActive`
        // is a `let` constant captured at creation time.
        vc.viewControllers?
            .compactMap { $0 as? IndexedHostingController<Content> }
            .forEach { $0.rootView = content($0.index) }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    private func makeHosting(index: Int) -> IndexedHostingController<Content> {
        let host = IndexedHostingController(rootView: content(index))
        host.index = index
        host.view.backgroundColor = .clear
        return host
    }

    @MainActor
    class Coordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
        var parent: VerticalPagingView
        var currentIndex = 0
        weak var pagingVC: PagingViewController<Content>?

        init(parent: VerticalPagingView) {
            self.parent = parent
        }

        func pageViewController(_ pageViewController: UIPageViewController,
                                viewControllerBefore viewController: UIViewController) -> UIViewController? {
            guard let indexed = viewController as? IndexedHostingController<Content> else { return nil }
            let prev = indexed.index - 1
            guard prev >= 0 else { return nil }
            return parent.makeHosting(index: prev)
        }

        func pageViewController(_ pageViewController: UIPageViewController,
                                viewControllerAfter viewController: UIViewController) -> UIViewController? {
            guard let indexed = viewController as? IndexedHostingController<Content> else { return nil }
            let next = indexed.index + 1
            guard next < parent.pageCount else { return nil }
            return parent.makeHosting(index: next)
        }

        func pageViewController(_ pageViewController: UIPageViewController,
                                didFinishAnimating finished: Bool,
                                previousViewControllers: [UIViewController],
                                transitionCompleted completed: Bool) {
            guard completed,
                  let visible = pageViewController.viewControllers?.first as? IndexedHostingController<Content> else { return }
            currentIndex = visible.index
            parent.currentPage = currentIndex
            parent.onPageChange(currentIndex)

            if visible.index >= parent.pageCount - 3 {
                parent.onNearEnd()
            }
        }
    }
}

class IndexedHostingController<Content: View>: UIHostingController<Content> {
    var index: Int = 0

    /// Root cause of the black band above the Explore picture (CI run 37000177700, `EXPLORE-DIAG` accessibility frames):
    /// the page cell is the full screen height (CollectionView / Cell `{{0,0},{402,791}}`) but the SwiftUI page was laid out
    /// INSIDE the hosting view's top safe-area inset — the picture sat at `y = 62` (= the status-bar inset) with height
    /// 729 = 791 − 62, and `.ignoresSafeArea(edges: .top)` in `ReviewPostView` did not widen it. The feed hides the
    /// status bar and draws edge to edge, so this controller cancels ONLY the top inset (the bottom inset, which keeps the
    /// caption clear of the bottom bar, is untouched).
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        let systemTop = view.safeAreaInsets.top - additionalSafeAreaInsets.top
        let target = -systemTop
        if abs(additionalSafeAreaInsets.top - target) > 0.5 {
            additionalSafeAreaInsets.top = target
        }
    }
}

class PagingViewController<Content: View>: UIPageViewController {
    init() {
        super.init(transitionStyle: .scroll, navigationOrientation: .vertical, options: [
            .interPageSpacing: 0
        ])
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        tuneScrollView()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        tuneScrollView()
    }

    /// The page controller's own scroll view adds the status-bar safe area as a content inset, which pushed every
    /// page ~47 pt down and left a black band above the picture (seen in the App Store shot, 02/10). The feed hides the
    /// status bar and draws edge to edge, so the inset must never be applied.
    private func tuneScrollView() {
        for sub in view.subviews {
            if let scrollView = sub as? UIScrollView {
                scrollView.showsVerticalScrollIndicator = false
                scrollView.showsHorizontalScrollIndicator = false
                scrollView.contentInsetAdjustmentBehavior = .never
            }
        }
    }
}
