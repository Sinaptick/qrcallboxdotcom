//
//  ContentView.swift
//  QRCallWatch
//
//  Main interface for QRCall Apple Watch app
//  Shows pending customer assistance requests
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var firebaseService: FirebaseService
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Pending Requests
            RequestListView()
                .tag(0)

            // Tab 2: Settings
            SettingsView()
                .tag(1)
        }
        .tabViewStyle(.page)
    }
}

struct RequestListView: View {
    @EnvironmentObject var firebaseService: FirebaseService

    var body: some View {
        NavigationView {
            if firebaseService.isAuthenticated {
                if firebaseService.pendingScans.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.green)

                        Text("All Clear")
                            .font(.headline)

                        Text("No pending requests")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .padding()
                } else {
                    List(firebaseService.pendingScans) { scan in
                        NavigationLink(destination: RequestDetailView(scan: scan)) {
                            ScanRowView(scan: scan)
                        }
                    }
                    .navigationTitle("Requests")
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.blue)

                    Text("Not Signed In")
                        .font(.headline)

                    Text("Open QRCall on your iPhone to sign in")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding()
            }
        }
    }
}

struct ScanRowView: View {
    let scan: ScanRequest

    var elapsedTime: String {
        let elapsed = Date().timeIntervalSince(scan.timestamp)
        let minutes = Int(elapsed / 60)

        if minutes < 1 {
            return "Just now"
        } else if minutes == 1 {
            return "1 min ago"
        } else {
            return "\(minutes) mins ago"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(scan.areaDescription)
                .font(.headline)

            HStack {
                Image(systemName: "clock")
                    .font(.caption)
                    .foregroundColor(.orange)

                Text(elapsedTime)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
        .padding(.vertical, 4)
    }
}

struct RequestDetailView: View {
    @EnvironmentObject var firebaseService: FirebaseService
    @Environment(\.dismiss) var dismiss

    let scan: ScanRequest
    @State private var isAssisting = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
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
                        .foregroundColor(.orange)
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
            }
            .padding()
        }
        .navigationTitle("Request Details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func handleAssist() {
        isAssisting = true

        Task {
            do {
                try await firebaseService.claimScan(scanId: scan.id)

                // Provide haptic feedback
                WKInterfaceDevice.current().play(.success)

                // Dismiss after short delay
                try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                dismiss()
            } catch {
                print("❌ Error claiming scan: \(error.localizedDescription)")
                WKInterfaceDevice.current().play(.failure)
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

struct SettingsView: View {
    @EnvironmentObject var firebaseService: FirebaseService
    @EnvironmentObject var notificationService: NotificationService

    var body: some View {
        List {
            Section("Account") {
                if firebaseService.isAuthenticated {
                    HStack {
                        Text("Store")
                        Spacer()
                        Text(firebaseService.userStore ?? "—")
                            .foregroundColor(.gray)
                    }

                    HStack {
                        Text("Name")
                        Spacer()
                        Text(firebaseService.userName ?? "—")
                            .foregroundColor(.gray)
                    }
                } else {
                    Text("Not signed in")
                        .foregroundColor(.gray)
                }
            }

            Section("Notifications") {
                HStack {
                    Text("Status")
                    Spacer()
                    Text(notificationService.isAuthorized ? "Enabled" : "Disabled")
                        .foregroundColor(notificationService.isAuthorized ? .green : .red)
                }
            }

            Section("Debug") {
                HStack {
                    Text("FCM Token")
                    Spacer()
                    Text(notificationService.fcmToken != nil ? "✓" : "✗")
                        .foregroundColor(notificationService.fcmToken != nil ? .green : .red)
                }

                Button("Refresh Token") {
                    notificationService.registerForRemoteNotifications()
                }
            }
        }
        .navigationTitle("Settings")
    }
}

#Preview {
    ContentView()
        .environmentObject(FirebaseService.shared)
        .environmentObject(NotificationService.shared)
}
