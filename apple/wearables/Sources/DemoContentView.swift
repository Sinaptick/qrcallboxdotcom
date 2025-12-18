//
//  DemoContentView.swift
//  QRCallWatchDemo
//
//  Main interface for QRCall Apple Watch demo
//

import SwiftUI

struct DemoContentView: View {
    @EnvironmentObject var viewModel: DemoViewModel
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Pending Requests
            DemoRequestListView()
                .tag(0)

            // Tab 2: Settings
            DemoSettingsView()
                .tag(1)
        }
        .tabViewStyle(.page)
    }
}

struct DemoRequestListView: View {
    @EnvironmentObject var viewModel: DemoViewModel

    var body: some View {
        NavigationView {
            if viewModel.pendingScans.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.green)

                    Text("All Clear")
                        .font(.headline)

                    Text("No pending requests")
                        .font(.caption)
                        .foregroundColor(.gray)

                    Button(action: {
                        viewModel.addNewScan()
                    }) {
                        Label("Add Demo", systemImage: "plus.circle")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .padding(.top, 8)
                }
                .padding()
            } else {
                List {
                    ForEach(viewModel.pendingScans) { scan in
                        NavigationLink(destination: DemoRequestDetailView(scan: scan)) {
                            DemoScanRowView(scan: scan)
                        }
                    }
                }
                .navigationTitle("Requests (\(viewModel.pendingScans.count))")
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button(action: {
                            viewModel.addNewScan()
                        }) {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
        }
    }
}

struct DemoScanRowView: View {
    let scan: ScanRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(scan.areaDescription)
                .font(.headline)
                .lineLimit(2)

            HStack {
                Image(systemName: "clock.fill")
                    .font(.caption)
                    .foregroundColor(priorityColor)

                Text(scan.elapsedTimeString)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
        .padding(.vertical, 4)
    }

    var priorityColor: Color {
        switch scan.priorityLevel {
        case .low: return .green
        case .medium: return .orange
        case .high: return .red
        }
    }
}

struct DemoRequestDetailView: View {
    @EnvironmentObject var viewModel: DemoViewModel
    @Environment(\.dismiss) var dismiss

    let scan: ScanRequest
    @State private var isAssisting = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Priority Badge
                HStack {
                    Circle()
                        .fill(priorityColor)
                        .frame(width: 12, height: 12)

                    Text(priorityText)
                        .font(.caption)
                        .foregroundColor(priorityColor)

                    Spacer()
                }

                // Location
                VStack(alignment: .leading, spacing: 8) {
                    Label("Location", systemImage: "location.fill")
                        .font(.caption)
                        .foregroundColor(.gray)

                    Text(scan.areaDescription)
                        .font(.title3)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider()

                // Wait Time
                VStack(alignment: .leading, spacing: 8) {
                    Label("Wait Time", systemImage: "clock.fill")
                        .font(.caption)
                        .foregroundColor(.gray)

                    Text(timeAgo(from: scan.timestamp))
                        .font(.title3)
                        .foregroundColor(priorityColor)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider()

                // Store Number
                VStack(alignment: .leading, spacing: 8) {
                    Label("Store", systemImage: "building.2.fill")
                        .font(.caption)
                        .foregroundColor(.gray)

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
                .controlSize(.large)

                // Ignore Button
                Button(action: {
                    dismiss()
                }) {
                    Text("Ignore")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("Request Details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var priorityColor: Color {
        switch scan.priorityLevel {
        case .low: return .green
        case .medium: return .orange
        case .high: return .red
        }
    }

    private var priorityText: String {
        switch scan.priorityLevel {
        case .low: return "Normal Priority"
        case .medium: return "Medium Priority"
        case .high: return "High Priority"
        }
    }

    private func handleAssist() {
        isAssisting = true

        Task {
            do {
                try await viewModel.claimScan(scanId: scan.id)
                dismiss()
            } catch {
                print("Error claiming scan: \(error.localizedDescription)")
            }

            isAssisting = false
        }
    }

    private func timeAgo(from date: Date) -> String {
        let elapsed = Date().timeIntervalSince(date)
        let minutes = Int(elapsed / 60)

        if minutes < 1 {
            return "Just now"
        } else if minutes == 1 {
            return "1 minute"
        } else if minutes < 60 {
            return "\(minutes) minutes"
        } else {
            let hours = minutes / 60
            return hours == 1 ? "1 hour" : "\(hours) hours"
        }
    }
}

struct DemoSettingsView: View {
    @EnvironmentObject var viewModel: DemoViewModel

    var body: some View {
        List {
            Section("Account") {
                HStack {
                    Text("Store")
                    Spacer()
                    Text(viewModel.userStore)
                        .foregroundColor(.gray)
                }

                HStack {
                    Text("Name")
                    Spacer()
                    Text(viewModel.userName)
                        .foregroundColor(.gray)
                }

                HStack {
                    Text("Status")
                    Spacer()
                    Text("Demo Mode")
                        .foregroundColor(.orange)
                }
            }

            Section("Pending Requests") {
                HStack {
                    Text("Active")
                    Spacer()
                    Text("\(viewModel.pendingScans.count)")
                        .foregroundColor(.blue)
                        .fontWeight(.semibold)
                }

                Button("Add Demo Request") {
                    viewModel.addNewScan()
                }

                Button("Clear All") {
                    viewModel.pendingScans.removeAll()
                }
                .foregroundColor(.red)
            }

            Section("About") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.0 (Demo)")
                        .foregroundColor(.gray)
                }
            }
        }
        .navigationTitle("Settings")
    }
}

#Preview {
    DemoContentView()
        .environmentObject(DemoViewModel())
}
