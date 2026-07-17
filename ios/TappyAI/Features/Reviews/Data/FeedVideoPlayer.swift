import AVFoundation
import Combine

@MainActor
final class FeedVideoPlayer: AppObservableObject {
    @AppPublished private(set) var isPlaying = false
    @AppPublished private(set) var isMuted = true
    @AppPublished var userPaused = false

    /// Called on deactivation or loop-back with (watchSeconds, completionRate).
    var onInteract: ((Int, Double) -> Void)?

    let player = AVPlayer()
    private var watchdogTimer: AnyCancellable?
    private var currentURL: URL?
    private var endObserver: Any?
    private var watchStart: Date?

    static var feedAudioUnlocked = false

    init() {
        player.isMuted = true
        player.automaticallyWaitsToMinimizeStalling = true
        configureAudioSession()
    }

    deinit {
        watchdogTimer?.cancel()
        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    // MARK: - Load

    func load(url: URL) {
        guard url != currentURL else { return }
        currentURL = url
        userPaused = false
        watchStart = nil

        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
            endObserver = nil
        }

        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.fireInteract(completionRate: 1.0)
                self.player.seek(to: .zero)
                self.player.play()
            }
        }
    }

    // MARK: - Active-driven playback (matches Web's `active` prop)

    func setActive(_ active: Bool) {
        if active {
            watchStart = Date()
            if Self.feedAudioUnlocked {
                player.isMuted = false
                isMuted = false
            }
            if !userPaused {
                ensurePlaying()
            }
        } else {
            fireInteract(completionRate: nil)
            pause(byUser: false)
        }
    }

    // MARK: - Gesture: single-tap toggle

    func togglePlay() {
        if isPlaying {
            pause(byUser: true)
        } else {
            userPaused = false
            ensurePlaying()
        }
    }

    // MARK: - Audio unlock (first user tap anywhere in feed)

    func unlockAudio() {
        guard !Self.feedAudioUnlocked else { return }
        Self.feedAudioUnlocked = true
        player.isMuted = false
        isMuted = false
    }

    func toggleMute() {
        if isMuted {
            unlockAudio()
        } else {
            player.isMuted = true
            isMuted = true
        }
    }

    // MARK: - Private

    private func ensurePlaying() {
        player.play()
        isPlaying = true
        startWatchdog()
    }

    private func pause(byUser: Bool) {
        watchdogTimer?.cancel()
        watchdogTimer = nil
        player.pause()
        isPlaying = false
        if byUser { userPaused = true }
    }

    private func startWatchdog() {
        watchdogTimer?.cancel()
        watchdogTimer = Timer.publish(every: 0.3, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task { @MainActor in
                    guard let self, !self.userPaused else { return }
                    if self.player.timeControlStatus == .paused {
                        self.player.play()
                        if !self.isMuted {
                            self.player.isMuted = false
                        }
                    }
                }
            }
    }

    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: .mixWithOthers)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}
    }

    private func fireInteract(completionRate: Double?) {
        guard let start = watchStart, let callback = onInteract else { return }
        watchStart = nil
        let watchSeconds = max(0, Int(Date().timeIntervalSince(start)))
        guard watchSeconds > 0 else { return }

        let rate: Double
        if let r = completionRate {
            rate = r
        } else if let duration = player.currentItem?.duration,
                  duration.isValid, duration.seconds > 0,
                  let current = player.currentItem?.currentTime() {
            rate = min(1.0, current.seconds / duration.seconds)
        } else {
            rate = 0
        }

        callback(watchSeconds, rate)
    }
}
