import SwiftUI

/// Explore: an area or a Lodestar trip, a mode, then recs (`POST /api/explore/recs`).
/// Placeholder from the scaffold; owned by the Explore feature.
struct ExploreRootView: View {
    var body: some View {
        NavigationStack {
            TabScreen(title: "Explore", signedOutMessage: "Sign in to explore places to eat anywhere.") {
                EmptyStateView(message: "Pick an area or a trip to see places for it.")
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
