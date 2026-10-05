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

    // MARK: - One coherent lifecycle (the invariant: ONLY THE ACTIVE CLIP MAY PLAY)
    //
    // Every player the feed, a profile's clip viewer or a single shared clip creates is registered here. Two guarantees hang off it:
    //  • `setActive(true)` first deactivates whichever clip was active before, so two clips can never play together;
    //  • `pauseAll()` stops every live player and releases the audio session — called when Explore (or the viewer) goes away.
    // UAT build 129: the clip the person swiped away from kept playing, and kept playing after leaving Explore, because the only
    // thing that paused a clip was an `isActive` change that a page controller never delivers to a page that is no longer on screen.
    private static let live = NSHashTable<FeedVideoPlayer>.weakObjects()
    private static weak var activePlayer: FeedVideoPlayer?

    /// Stops every clip and gives the audio session back (so other apps' audio can resume). Idempotent.
    static func pauseAll() {
        for p in live.allObjects { p.deactivate() }
        activePlayer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Players that are currently producing sound or moving pictures (a test pins this to «at most one»).
    static var playingCount: Int { live.allObjects.filter { $0.player.timeControlStatus != .paused }.count }

    init() {
        player.isMuted = true
        player.automaticallyWaitsToMinimizeStalling = true
        configureAudioSession()
        Self.live.add(self)
    }

    deinit {
        player.pause()
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
            // Only one clip at a time: whatever was active before stops NOW, before this one starts.
            if let previous = Self.activePlayer, previous !== self { previous.deactivate() }
            Self.activePlayer = self
            watchStart = Date()
            if Self.feedAudioUnlocked {
                setMuted(false)
            }
            if !userPaused {
                ensurePlaying()
            }
        } else {
            deactivate()
        }
    }

    /// The clip is no longer the one on screen: bank the watch time, stop it, forget it as the active one.
    private func deactivate() {
        if Self.activePlayer === self { Self.activePlayer = nil }
        fireInteract(completionRate: nil)
        pause(byUser: false)
    }

    // MARK: - Gesture: single tap

    /// One tap, one meaning (Web `feedShared.tsx` `onPointerUp` / `isFeedAudioUnlocked`): while sound is still locked the tap
    /// UNLOCKS it and the clip keeps playing; only once sound is on does a tap pause or resume. Before, the first tap both paused the clip and
    /// unmuted it, so the person had to tap twice — pause, then resume — before hearing anything.
    func handleTap() {
        if isMuted {
            setMuted(false)
            userPaused = false
            ensurePlaying()
        } else {
            togglePlay()
        }
    }

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
