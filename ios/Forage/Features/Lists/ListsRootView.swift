import SwiftUI

/// Lists: Been and Want to try, as rows or on a map (`GET /api/visits`, `GET /api/want`).
/// Placeholder from the scaffold; owned by the Lists feature.
struct ListsRootView: View {
    var body: some View {
        NavigationStack {
            TabScreen(title: "Lists", signedOutMessage: "Sign in to keep the places you've been and want to try.") {
                EmptyStateView(message: "Places you log and save will show here.")
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
