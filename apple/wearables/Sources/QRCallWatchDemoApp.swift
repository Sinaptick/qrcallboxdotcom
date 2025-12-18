//
//  QRCallWatchDemoApp.swift
//  QRCallWatchDemo
//
//  QRCall Watch App Demo - Simulator Version
//

import SwiftUI

@main
struct QRCallWatchDemoApp: App {
    @StateObject private var viewModel = DemoViewModel()

    var body: some Scene {
        WindowGroup {
            DemoContentView()
                .environmentObject(viewModel)
        }
    }
}

// MARK: - Demo ViewModel

class DemoViewModel: ObservableObject {
    @Published var pendingScans: [ScanRequest] = []
    @Published var userName = "Demo User"
    @Published var userStore = "1458"
    @Published var isAuthenticated = true

    init() {
        // Load sample data
        loadSampleData()
    }

    func loadSampleData() {
        pendingScans = [
            ScanRequest(
                id: "scan1",
                storeNumber: "1458",
                areaDescription: "Electronics - TV Wall",
                timestamp: Date().addingTimeInterval(-120), // 2 mins ago
                status: "pending"
            ),
            ScanRequest(
                id: "scan2",
                storeNumber: "1458",
                areaDescription: "Appliances - Washers",
                timestamp: Date().addingTimeInterval(-300), // 5 mins ago
                status: "pending"
            ),
            ScanRequest(
                id: "scan3",
                storeNumber: "1458",
                areaDescription: "Home Decor",
                timestamp: Date().addingTimeInterval(-60), // 1 min ago
                status: "pending"
            ),
            ScanRequest(
                id: "scan4",
                storeNumber: "1458",
                areaDescription: "Garden Center",
                timestamp: Date().addingTimeInterval(-420), // 7 mins ago
                status: "pending"
            )
        ]
    }

    func claimScan(scanId: String) async throws {
        // Simulate API delay
        try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second

        // Remove from pending list
        DispatchQueue.main.async {
            self.pendingScans.removeAll { $0.id == scanId }
        }
    }

    func addNewScan() {
        let areas = ["Paint Department", "Plumbing", "Lighting", "Outdoor Living", "Tool Rental"]
        let randomArea = areas.randomElement() ?? "Store"

        let newScan = ScanRequest(
            id: "scan\(Int.random(in: 100...999))",
            storeNumber: userStore,
            areaDescription: randomArea,
            timestamp: Date(),
            status: "pending"
        )

        DispatchQueue.main.async {
            self.pendingScans.insert(newScan, at: 0)
        }
    }
}
