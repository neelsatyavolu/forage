import SwiftUI

/// Ask: describe what you want, get three picks with reasons (`POST /api/recs/ask`).
/// Placeholder from the scaffold; owned by the Ask feature.
struct AskRootView: View {
    var body: some View {
        NavigationStack {
            TabScreen(title: "Ask", signedOutMessage: "Sign in to ask for a place to eat.") {
                EmptyStateView(message: "Ask for what you feel like and get three picks nearby.")
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
