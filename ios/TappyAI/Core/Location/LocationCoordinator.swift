import CoreLocation

/// One-shot location fetcher used to include user position in chat requests (parity with Web).
/// Returns nil immediately when permission is undetermined (prompts the user asynchronously)
/// or denied. On authorized, issues a single `requestLocation()` and resolves within ~1s.
@MainActor
final class LocationCoordinator: NSObject {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?
    /// Counts the requests, so a timeout belongs to the request that started it and never ends a later one.
    private var generation = 0

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// A NEW fix, or nil: permission missing, a failure, or no answer within `timeout` seconds (the web waits 10 s for a near-me question).
    /// The caller never falls back to an older fix for such a question.
    func requestOnce(timeout: TimeInterval = 10) async -> CLLocation? {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
            return nil
        case .denied, .restricted:
            return nil
        case .authorizedWhenInUse, .authorizedAlways:
            break
        @unknown default:
            return nil
        }
        return await withCheckedContinuation { cont in
            // 03/11: a second request while one is out replaced the first continuation, which then never resumed (its chat send hung).
            self.continuation?.resume(returning: nil)
            self.continuation = cont
            self.generation += 1
            let mine = self.generation
            manager.requestLocation()
            // No answer in time: the request ends empty (the continuation is resumed exactly once, by whoever comes first).
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard let self, self.generation == mine, let pending = self.continuation else { return }
                self.continuation = nil
                pending.resume(returning: nil)
            }
        }
    }
}

extension LocationCoordinator: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let loc = locations.first
        Task { @MainActor [weak self] in
            self?.continuation?.resume(returning: loc)
            self?.continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
            self?.continuation?.resume(returning: nil)
            self?.continuation = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {}
}
