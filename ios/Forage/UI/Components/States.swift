import SwiftUI

/// The state of one async load. Keep it in a feature's @Observable model.
enum LoadState<Value: Sendable>: Sendable {
    case idle
    case loading
    case loaded(Value)
    case failed(String)

    var value: Value? {
        if case .loaded(let value) = self { return value }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var errorMessage: String? {
        if case .failed(let message) = self { return message }
        return nil
    }
}

/// Nothing here yet: a serif line in body color and at most one ghost action (the web's `EmptyState`).
struct EmptyStateView: View {
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Text(message).textStyle(.lede).foregroundStyle(Color.bodyText)
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.forage(.ghost, small: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The API's sentence as written, plus "Try again".
struct ErrorStateView: View {
    let message: String
    var retryTitle = "Try again"
    var retry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            InlineError(message: message)
            if let retry {
                Button(retryTitle, action: retry).buttonStyle(.forage(.ghost, small: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Loading blocks: breathing rows (no shimmer; spinners only inside buttons).
struct LoadingRows: View {
    var count = 4
    var height: CGFloat = 56

    var body: some View {
        VStack(spacing: Spacing.sm) {
            ForEach(0..<count, id: \.self) { _ in Skeleton(height: height) }
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}

/// Error text: danger mono 12 (form errors, failed requests).
struct InlineError: View {
    let message: String

    var body: some View {
        Text(message)
            .textStyle(.label)
            .foregroundStyle(Color.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel("Error: \(message)")
    }
}

/// A neutral notice in body color ("If an account exists for that address…").
struct InlineNotice: View {
    let message: String

    var body: some View {
        Text(message)
            .textStyle(.bodySmall)
            .foregroundStyle(Color.bodyText)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
