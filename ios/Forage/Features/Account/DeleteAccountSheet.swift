import SwiftUI

/// "Delete account" (App Store 5.1.1(v)): password, then a destructive confirmation, then
/// `DELETE /api/account`. Copy from the web's `DeleteSection`.
struct DeleteAccountSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model = DeleteAccountModel()
    @State private var confirming = false

    var body: some View {
        AccountSheetScaffold(title: "Delete account", onClose: { dismiss() }) {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                Text("Deletes your account, visits, lists, taste profile, AI connections and Lodestar link. This can't be undone.")
                    .textStyle(.body).foregroundStyle(Color.bodyText)
                if let email = app.account?.email {
                    Text("Signed in as \(email)").textStyle(.label).foregroundStyle(Color.mute)
                }
                ForageField(label: "Password", text: $model.password, error: model.error, secure: true,
                            contentType: .password, autocapitalization: .never, submitLabel: .done, onSubmit: askToConfirm)
                Button(model.isBusy ? "Deleting…" : "Delete my account", action: askToConfirm)
                    .buttonStyle(.forage(.destructive, fullWidth: true, isLoading: model.isBusy))
                    .disabled(model.isBusy)
            }
        }
        .confirmationDialog("Delete your account?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Delete my account", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Everything saved to it goes too. This can't be undone.")
        }
    }

    private func askToConfirm() {
        guard model.canSubmit else {
            Task { await delete() } // shows "Enter your password to delete your account."
            return
        }
        confirming = true
    }

    private func delete() async {
        let deleted = await model.delete(using: { try await app.deleteAccount(password: $0) }, report: { error in
            error.isCancellation ? nil : error.userMessage
        })
        if deleted || !app.isSignedIn { dismiss() }
    }
}
