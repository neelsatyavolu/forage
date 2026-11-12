import SwiftUI

/// A labelled text input (the web's `Field` + `inputClass`): mono 12 mute label above, card
/// fill, `fieldBorder` hairline, 4 pt radius, accent border when focused. `error` shows in
/// danger mono 12 below; otherwise `hint` in mute.
struct ForageField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var hint: String?
    var error: String?
    var mono = false
    var secure = false
    var contentType: UITextContentType?
    var keyboard: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    var submitLabel: SubmitLabel = .done
    var onSubmit: () -> Void = {}

    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            if !label.isEmpty {
                Text(label).textStyle(.label).foregroundStyle(Color.mute)
            }
            input
                .font(mono ? TextStyle.mono.font : TextStyle.bodySmall.font)
                .foregroundStyle(Color.ink)
                .tint(Color.accent)
                .textContentType(contentType)
                .keyboardType(keyboard)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled(mono || secure || keyboard == .emailAddress)
                .submitLabel(submitLabel)
                .onSubmit(onSubmit)
                .focused($focused)
                .padding(.horizontal, Spacing.md)
                .frame(minHeight: Sizes.control)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .strokeBorder(borderColor, lineWidth: Sizes.hairline)
                )
                .animation(Motion.fast, value: focused)
            if let error {
                InlineError(message: error)
            } else if let hint {
                Text(hint).textStyle(.caption).foregroundStyle(Color.mute)
            }
        }
    }

    @ViewBuilder private var input: some View {
        let prompt = Text(placeholder).foregroundStyle(Color.mute)
        if secure {
            SecureField(label, text: $text, prompt: prompt)
        } else {
            TextField(label, text: $text, prompt: prompt)
        }
    }

    private var borderColor: Color {
        if error != nil { return .danger }
        return focused ? .accent : .fieldBorder
    }
}
