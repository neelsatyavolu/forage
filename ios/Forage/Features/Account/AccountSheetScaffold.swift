import SwiftUI

/// The web's Dialog on iOS: a fixed header (16 pt medium title, close button), a hairline and a
/// scrolling body on the card fill.
struct AccountSheetScaffold<Content: View>: View {
    let title: String
    var onClose: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .textStyle(.headline)
                    .foregroundStyle(Color.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                IconButton(systemName: "xmark", accessibilityLabel: "Close", action: onClose)
            }
            .padding(.leading, Sizes.sheetPadding)
            .padding(.trailing, Spacing.sm)
            .padding(.vertical, Spacing.xs)
            Hairline()
            ScrollView {
                content()
                    .padding(Sizes.sheetPadding)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.card)
    }
}
