//
//  QRCallWatchPreview.swift
//
//  Open this file in Xcode and use the Canvas preview to see the watch interface
//  No build required - just enable Canvas in Xcode (Cmd+Option+Return)
//

import SwiftUI

// MARK: - Models

struct ScanRequest: Identifiable {
    let id: String
    let storeNumber: String
    let areaDescription: String
    let timestamp: Date
    let status: String

    var elapsedMinutes: Int {
        let elapsed = Date().timeIntervalSince(timestamp)
        return Int(elapsed / 60)
    }

    var elapsedTimeString: String {
        let minutes = elapsedMinutes
        if minutes < 1 { return "Just now" }
        else if minutes == 1 { return "1 min" }
        else if minutes < 60 { return "\(minutes) mins" }
        else {
            let hours = minutes / 60
            let remainingMins = minutes % 60
            return hours == 1 ? "1h \(remainingMins)m" : "\(hours)h \(remainingMins)m"
        }
    }

    var priorityLevel: Priority {
        if elapsedMinutes < 2 { return .low }
        else if elapsedMinutes < 5 { return .medium }
        else { return .high }
    }

    enum Priority {
        case low, medium, high
        var color: Color {
            switch self {
            case .low: return .green
            case .medium: return .orange
            case .high: return .red
            }
        }
    }
}

// MARK: - Main View

struct WatchMainView: View {
    @State private var scans: [ScanRequest] = [
        ScanRequest(id: "1", storeNumber: "1458", areaDescription: "Electronics - TV Wall", timestamp: Date().addingTimeInterval(-120), status: "pending"),
        ScanRequest(id: "2", storeNumber: "1458", areaDescription: "Appliances", timestamp: Date().addingTimeInterval(-300), status: "pending"),
        ScanRequest(id: "3", storeNumber: "1458", areaDescription: "Home Decor", timestamp: Date().addingTimeInterval(-60), status: "pending")
    ]

    var body: some View {
        NavigationView {
            List(scans) { scan in
                NavigationLink(destination: ScanDetailView(scan: scan, onAssist: {
                    scans.removeAll { $0.id == scan.id }
                })) {
                    ScanRow(scan: scan)
                }
            }
            .navigationTitle("Requests (\(scans.count))")
        }
    }
}

struct ScanRow: View {
    let scan: ScanRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(scan.areaDescription)
                .font(.headline)
                .lineLimit(2)

            HStack {
                Image(systemName: "clock.fill")
                    .font(.caption)
                    .foregroundColor(scan.priorityLevel.color)

                Text(scan.elapsedTimeString)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ScanDetailView: View {
    let scan: ScanRequest
    let onAssist: () -> Void
    @Environment(\.dismiss) var dismiss
    @State private var isAssisting = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Priority Badge
                HStack {
                    Circle()
                        .fill(scan.priorityLevel.color)
                        .frame(width: 10, height: 10)

                    Text(priorityText)
                        .font(.caption2)
                        .foregroundColor(scan.priorityLevel.color)

                    Spacer()
                }

                // Location
                VStack(alignment: .leading, spacing: 6) {
                    Label("Location", systemImage: "location.fill")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Text(scan.areaDescription)
                        .font(.title3)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider()

                // Wait Time
                VStack(alignment: .leading, spacing: 6) {
                    Label("Wait Time", systemImage: "clock.fill")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Text(scan.elapsedTimeString)
                        .font(.title3)
                        .foregroundColor(scan.priorityLevel.color)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider()

                // Store
                VStack(alignment: .leading, spacing: 6) {
                    Label("Store", systemImage: "building.2.fill")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Text("Store \(scan.storeNumber)")
                        .font(.title3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()

                // Assist Button
                Button(action: handleAssist) {
                    if isAssisting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Label("I'll Assist", systemImage: "hand.raised.fill")
                            .font(.headline)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(isAssisting)
            }
            .padding()
        }
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var priorityText: String {
        switch scan.priorityLevel {
        case .low: return "Normal"
        case .medium: return "Medium"
        case .high: return "High Priority"
        }
    }

    private func handleAssist() {
        isAssisting = true

        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            onAssist()
            dismiss()
        }
    }
}

// MARK: - Previews

#Preview("Request List", traits: .fixedLayout(width: 184, height: 224)) {
    WatchMainView()
}

#Preview("Scan Detail", traits: .fixedLayout(width: 184, height: 224)) {
    NavigationView {
        ScanDetailView(
            scan: ScanRequest(
                id: "1",
                storeNumber: "1458",
                areaDescription: "Electronics - TV Wall",
                timestamp: Date().addingTimeInterval(-300),
                status: "pending"
            ),
            onAssist: {}
        )
    }
}

#Preview("Single Scan Row", traits: .fixedLayout(width: 184, height: 60)) {
    ScanRow(
        scan: ScanRequest(
            id: "1",
            storeNumber: "1458",
            areaDescription: "Electronics - TV Wall",
            timestamp: Date().addingTimeInterval(-300),
            status: "pending"
        )
    )
    .padding()
}

#Preview("Empty State", traits: .fixedLayout(width: 184, height: 224)) {
    NavigationView {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40))
                .foregroundColor(.green)

            Text("All Clear")
                .font(.headline)

            Text("No pending requests")
                .font(.caption)
                .foregroundColor(.gray)
        }
    }
}
