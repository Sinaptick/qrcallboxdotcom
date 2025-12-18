//
//  QRCallWatchApp.swift
//  QRCallWatch
//
//  QRCall Watch App Entry Point
//  Initializes Firebase and manages app lifecycle
//

import SwiftUI
import Firebase

@main
struct QRCallWatchApp: App {
    @StateObject private var firebaseService = FirebaseService.shared
    @StateObject private var notificationService = NotificationService.shared

    init() {
        // Configure Firebase
        FirebaseApp.configure()
        print("🔥 Firebase configured for watchOS")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(firebaseService)
                .environmentObject(notificationService)
                .onAppear {
                    // Request notification permissions
                    notificationService.requestAuthorization()

                    // Register for remote notifications
                    notificationService.registerForRemoteNotifications()

                    // Start listening for scan updates if authenticated
                    if firebaseService.isAuthenticated {
                        firebaseService.startListeningForScans()
                    }
                }
        }
    }
}
