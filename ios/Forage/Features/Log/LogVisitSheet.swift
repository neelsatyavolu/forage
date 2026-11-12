import SwiftUI

/// Log a visit (`POST /api/visits`, then comparisons), presented with
/// `app.present(.logVisit(placeId:))`. Placeholder from the scaffold; owned by the Log feature.
struct LogVisitSheet: View {
    let placeId: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                EmptyStateView(message: "Logging a visit will happen here.")
                    .padding(Sizes.sheetPadding)
            }
            .background(Color.card)
            .navigationTitle("Log a visit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.buttonStyle(.forage(.quiet))
                }
            }
        }
    }
}
