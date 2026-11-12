import MapKit
import SwiftUI

/// A small Apple map of one place with Directions (opens Apple Maps; free MapKit).
struct PlaceMapPreview: View {
    let place: Place

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 600,
                                                            longitudinalMeters: 600)),
                interactionModes: []) {
                Marker(place.name, coordinate: coordinate).tint(Color.accent)
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.hairline, lineWidth: Sizes.hairline))
            .accessibilityLabel("Map of \(place.name)")
            HStack {
                if let address = place.address ?? place.city {
                    Text(address).textStyle(.caption).foregroundStyle(Color.mute).lineLimit(2)
                }
                Spacer(minLength: Spacing.md)
                Button("Directions", action: openDirections).buttonStyle(.forage(.link, small: true))
            }
        }
    }

    private func openDirections() {
        let item = MKMapItem(location: CLLocation(latitude: place.lat, longitude: place.lng), address: nil)
        item.name = place.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
    }
}

/// Google's live details, shown only when the server returned them (never stored on the device).
struct PlaceLiveSection: View {
    let live: LiveDetails
    let openURL: (URL) -> Void

    var body: some View {
        SectionRule(label: "From Google") {
            VStack(alignment: .leading, spacing: Spacing.md) {
                let line = PlaceDetailModel.liveLine(live)
                if !line.isEmpty { Text(line).textStyle(.mono).foregroundStyle(Color.bodyText) }
                if let summary = live.summary {
                    Text(summary).textStyle(.lede).foregroundStyle(Color.bodyText)
                }
                if !live.hours.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        ForEach(live.hours, id: \.self) { Text($0) }
                    }
                    .textStyle(.label)
                    .foregroundStyle(Color.mute)
                }
                links
            }
        }
    }

    private var links: some View {
        FlowLayout(spacing: Spacing.lg) {
            if let phone = live.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Link(phone, destination: url).textStyle(.bodySmall).tint(Color.accent)
            }
            if let site = live.website.flatMap(URL.init(string:)), site.scheme?.hasPrefix("http") == true {
                Button("Website") { openURL(site) }.buttonStyle(.forage(.link, small: true))
            }
            if let maps = live.mapsUrl.flatMap(URL.init(string:)), maps.scheme == "https" {
                Button("Open in Google Maps") { openURL(maps) }.buttonStyle(.forage(.link, small: true))
            }
        }
    }
}
