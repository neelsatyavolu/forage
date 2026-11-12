import Foundation

/// The rating flow's entry rules and guest start (spec 1.2 "Entry points", api.md §2.0).
extension AppState {
    /// Seconds since 1970 when the flow was closed on this device; absent (0) means never.
    static let rateDismissedKey = "rateDismissedAt"

    var isGuest: Bool { account?.guest == true }

    /// Opens on launch while under the goal and not closed on this device before.
    nonisolated static func shouldOpenRateOnLaunch(progress: RateProgress, dismissedAt: Double) -> Bool {
        progress.belowGoal && dismissedAt <= 0
    }

    func openRateFlowOnLaunchIfNeeded(defaults: UserDefaults = .standard) {
        guard session != .checking else { return }
        let dismissedAt = defaults.double(forKey: Self.rateDismissedKey)
        #if DEBUG
        if defaults.string(forKey: "ForageRateDemo") != nil { return showsRateFlow = true }
        #endif
        if Self.shouldOpenRateOnLaunch(progress: rateProgress, dismissedAt: dismissedAt) { showsRateFlow = true }
    }

    func openRateFlow() {
        sheet = nil
        showsRateFlow = true
    }

    /// Close (or finish): remembered so it stops opening on launch, then Near me. Nothing rated is lost.
    func closeRateFlow(defaults: UserDefaults = .standard) {
        defaults.set(Date.now.timeIntervalSince1970, forKey: Self.rateDismissedKey)
        showsRateFlow = false
        selectedTab = .near
        listsChanged()
        Task { await refreshAccount() }
    }

    /// Right before the first write: a guest when there is no session (`POST /api/account/guest`).
    func ensureSession() async throws {
        guard !isSignedIn else { return }
        let start = try await api.send(API.Account.guest)
        becomeSignedIn(start.user)
    }

    /// After a write in the flow.
    func rateChanged(_ progress: RateProgress) {
        setRateProgress(progress)
        listsChanged()
    }
}
