import SwiftUI

/// Near me: recommendations around the device's location (`POST /api/recs`).
/// Placeholder from the scaffold; owned by the Near feature.
struct NearRootView: View {
    var body: some View {
        NavigationStack {
            TabScreen(title: "Near me", signedOutMessage: "Sign in to see places picked for you nearby.") {
                EmptyStateView(message: "Recommendations near you will show here.")
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
