import AVFoundation
import Combine

@MainActor
final class FeedVideoPlayer: AppObservableObject {
    @AppPublished private(set) var isPlaying = false
    @AppPublished private(set) var isMuted = true
    @AppPublished var userPaused = false
    /// True from the moment a clip is asked for until it is really playing (the cover and a spinner show meanwhile).
    @AppPublished private(set) var isBuffering = false
    /// The item could not be loaded (network, bad file). The cell shows «try again» instead of a silent black area.
    @AppPublished private(set) var failed = false
    private var itemCancellables = Set<AnyCancellable>()

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
        // Start small: a feed clip needs a first frame fast, not a deep buffer (less to download before it shows).
        item.preferredForwardBufferDuration = 4
        player.replaceCurrentItem(with: item)
        failed = false
        isBuffering = true
        itemCancellables.removeAll()
        item.publisher(for: \.status)
            .sink { [weak self] status in
                Task { @MainActor in
                    if status == .failed { self?.failed = true; self?.isBuffering = false }
                }
            }
            .store(in: &itemCancellables)
        player.publisher(for: \.timeControlStatus)
            .sink { [weak self] status in
                Task { @MainActor in
                    guard let self, !self.failed else { return }
                    self.isBuffering = status != .playing && !self.userPaused
                }
            }
            .store(in: &itemCancellables)

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

    /// «Try again» after a failed load: the same URL, from scratch.
    func retry() {
        guard let url = currentURL else { return }
        currentURL = nil
        load(url: url)
        if !userPaused { ensurePlaying() }
    }

    // MARK: - Active-driven playback (matches Web's `active` prop)

    func setActive(_ active: Bool) {
        if active {
            watchStart = Date()
            if Self.feedAudioUnlocked {
                setMuted(false)
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
        guard !Self.feedAudioUnlocked || isMuted else { return }
        setMuted(false)
    }

    /// One place decides sound. The person's choice is remembered for the clips that follow
    /// (`feedAudioUnlocked`), and turning sound ON re-asserts the playback audio session: the microphone
    /// screen leaves a record category behind, which plays through the earpiece or not at all.
    func setMuted(_ muted: Bool) {
        Self.feedAudioUnlocked = !muted
        player.isMuted = muted
        player.volume = 1
        isMuted = muted
        if !muted { configureAudioSession() }
    }

    /// 🚨 Used to be `if isMuted { unlockAudio() }` with an unlock that returned early once any clip had
    /// unlocked: after muting, the speaker button could never turn sound back on.
    func toggleMute() { setMuted(!isMuted) }

    // MARK: - Private

    private func ensurePlaying() {
        if !isMuted { configureAudioSession() }   // after the mic screen, the session must be playback again
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
            // `.playback` = plays with the silent switch on and through the speaker; no mix option, so this clip owns the audio.
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
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
