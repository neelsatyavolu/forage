import MapKit
import SwiftUI

/// The Lists pins on Apple Maps (free MapKit). Been pins carry the score; tapping one opens the place.
struct ListsMapView: View {
    let pins: [ListPin]
    let label: String
    let onOpen: (String) -> Void

    var body: some View {
        Map(initialPosition: .automatic) {
            ForEach(pins) { pin in
                Annotation(pin.name, coordinate: CLLocationCoordinate2D(latitude: pin.lat, longitude: pin.lng)) {
                    Button { onOpen(pin.id) } label: { PinBadge(pin: pin) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(pin.label.isEmpty ? pin.name : "\(pin.name), \(pin.label)")
                }
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls { MapCompass() }
        // Rebuild when the pins change so the camera fits the new set.
        .id(pins.map(\.id))
        .frame(height: 380)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.hairline, lineWidth: Sizes.hairline))
        .accessibilityLabel(label)
    }
}

/// A flat pin: an accent capsule with the score, or a small dot for unscored and Want places.
private struct PinBadge: View {
    let pin: ListPin

    var body: some View {
        if pin.label.isEmpty {
            Circle()
                .fill(pin.kind == .want ? Color.card : Color.accent)
                .overlay(Circle().strokeBorder(Color.accent, lineWidth: 2))
                .frame(width: 14, height: 14)
        } else {
            Text(pin.label)
                .font(.forage(.monoMedium, size: 12, relativeTo: .caption))
                .monospacedDigit()
                .foregroundStyle(Color.accentOn)
                .padding(.horizontal, Spacing.sm)
                .frame(height: 22)
                .background(Color.accent, in: Capsule())
        }
    }
}
