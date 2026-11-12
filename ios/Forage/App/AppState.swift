import Foundation
import Observation

/// Tabs of the root TabView.
enum AppTab: String, Hashable, Sendable, CaseIterable {
    case near, explore, lists, ask, account
}

/// App-wide sheets any feature can ask for with `app.present(_:)`, presented by `RootView`.
enum AppSheet: Identifiable, Hashable, Sendable {
    /// Sign in (Account feature).
    case signIn
    /// Create an account (Account feature).
    case register
    /// Set a new password from a reset link (Account feature), e.g. opened from a deep link.
    case resetPassword(link: String)
    /// Connect ChatGPT or Grok (AI feature). nil picks the provider that isn't connected yet.
    case connectAI(AIProvider?)
    /// The shared place screen (Place feature), from any tab.
    case place(id: String)
    /// Log a visit (Log feature), optionally for a known place.
    case logVisit(placeId: String?)
    /// An outside page in Safari View.
    case web(URL)

    var id: String {
        switch self {
        case .signIn: "signIn"
        case .register: "register"
        case .resetPassword(let link): "reset:\(link)"
        case .connectAI(let provider): "connectAI:\(provider?.rawValue ?? "")"
        case .place(let id): "place:\(id)"
        case .logVisit(let placeId): "log:\(placeId ?? "")"
        case .web(let url): "web:\(url.absoluteString)"
        }
    }
}

enum SessionPhase: Equatable, Sendable {
    /// Before the first `GET /api/account` answers.
    case checking
    case signedOut
    case signedIn(AccountUser)
}

/// The app's shared state: who is signed in, AI and Lodestar status, location, navigation
/// between tabs and the app-wide sheets. Features read it with `@Environment(AppState.self)`
/// and call its methods; they keep their own screen state.
@MainActor
@Observable
final class AppState {
    let api: APIClient
    let location: LocationService

    private(set) var session: SessionPhase = .checking
    private(set) var aiStatus: AIStatus = .disconnected
    /// nil until checked (Account refreshes it on appear).
    private(set) var lodestar: LodestarStatus?
    /// Bumped after any visit or Want write so Lists and Near me reload.
    private(set) var listsRevision = 0

    var selectedTab: AppTab = .near
    var sheet: AppSheet?

    init(api: APIClient = APIClient(), location: LocationService? = nil) {
        self.api = api
        self.location = location ?? LocationService()
        #if DEBUG
        // `-ForageTab account` opens on a tab, for simulator screenshots (see ios/README.md).
        if let tab = UserDefaults.standard.string(forKey: "ForageTab").flatMap(AppTab.init(rawValue:)) {
            selectedTab = tab
        }
        #endif
    }

    var account: AccountUser? {
        if case .signedIn(let user) = session { return user }
        return nil
    }

    var isSignedIn: Bool { account != nil }

    /// Loads the account and AI status. Call once at launch.
    func bootstrap() async {
        await refreshAccount()
        await refreshAIStatus()
    }

    /// `GET /api/account`. A failure keeps the previous state (a cookie may still be valid).
    func refreshAccount() async {
        do {
            let state = try await api.send(API.Account.current)
            if let user = state.user {
                session = .signedIn(user)
            } else {
                becomeSignedOut()
            }
        } catch {
            if session == .checking { session = .signedOut }
        }
    }

    /// `GET /api/ai/status`. A failure counts as nothing connected, like the web.
    func refreshAIStatus() async {
        do {
            aiStatus = try await api.send(API.AI.status)
        } catch {
            if !error.isCancellation { aiStatus = .disconnected }
        }
    }

    /// `GET /api/lodestar`. Signed out or failed leaves it unknown (nil).
    func refreshLodestar() async {
        guard isSignedIn else {
            lodestar = nil
            return
        }
        do {
            lodestar = try await api.send(API.Lodestar.status)
        } catch {
            handle(error)
        }
    }

    /// Every feature routes errors through this: only 401 "Sign in first." drops to signed out.
    /// Returns the message to show (nil for cancellation).
    @discardableResult
    func handle(_ error: any Error) -> String? {
        if error.isCancellation { return nil }
        if let api = error as? APIError, api.isSignInRequired { becomeSignedOut() }
        return error.userMessage
    }

    /// Present an app-wide sheet, e.g. `present(.connectAI(nil))` or `present(.place(id:))`.
    func present(_ sheet: AppSheet) {
        self.sheet = sheet
    }

    /// Call after any visit or Want write.
    func listsChanged() {
        listsRevision += 1
    }

    /// Handles a link the system hands the app. Returns false for links it doesn't know.
    @discardableResult
    func open(_ url: URL) -> Bool {
        switch DeepLink.parse(url, webBase: api.baseURL) {
        case .resetPassword(let link):
            selectedTab = .account
            sheet = .resetPassword(link: link)
            return true
        case nil:
            return false
        }
    }

    // MARK: - Internal state changes (used by AppState+Session)

    func becomeSignedIn(_ user: AccountUser) {
        session = .signedIn(user)
        listsChanged()
    }

    func becomeSignedOut() {
        session = .signedOut
        lodestar = nil
        api.clearSessionCookie()
    }

    func setLodestar(_ status: LodestarStatus?) {
        lodestar = status
    }
}
