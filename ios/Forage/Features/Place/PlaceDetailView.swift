import SwiftUI

/// The shared place screen (`GET /api/places/{id}`), presented with `app.present(.place(id:))`.
/// Placeholder from the scaffold; owned by the Place feature.
struct PlaceDetailView: View {
    let placeId: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                EmptyStateView(message: "Place details will show here.")
                    .padding(Sizes.sheetPadding)
            }
            .background(Color.card)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.buttonStyle(.forage(.quiet))
                }
            }
        }
    }
}
