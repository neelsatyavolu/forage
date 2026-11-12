#if DEBUG
import Foundation

/// Launch arguments for simulator runs and screenshots (Debug builds only, see ios/README.md):
///
/// - `-ForageDebugAccount "email password"` signs in at launch, creating the account if the
///   sign-in fails. For a local dev server only.
/// - `-ForageSheet log|place:<id>` opens that app-wide sheet once signed in.
extension AppState {
    func applyDebugLaunchArguments() async {
        let defaults = UserDefaults.standard
        if let pair = defaults.string(forKey: "ForageDebugAccount") {
            let parts = pair.split(separator: " ", maxSplits: 1).map(String.init)
            if parts.count == 2, !isSignedIn {
                do {
                    try await signIn(email: parts[0], password: parts[1])
                } catch {
                    _ = try? await register(email: parts[0], password: parts[1])
                }
            }
        }
        guard isSignedIn, let sheet = defaults.string(forKey: "ForageSheet") else { return }
        if sheet == "log" {
            present(.logVisit(placeId: nil))
        } else if sheet.hasPrefix("place:") {
            present(.place(id: String(sheet.dropFirst("place:".count))))
        }
    }
}
#endif
