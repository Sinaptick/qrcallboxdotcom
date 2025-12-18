//
//  NotificationService.swift
//  QRCallWatch
//
//  Handles push notifications and FCM token management
//

import Foundation
import UserNotifications
import Firebase
import FirebaseMessaging
import WatchKit

class NotificationService: NSObject, ObservableObject {
    static let shared = NotificationService()

    @Published var isAuthorized = false
    @Published var fcmToken: String?

    private let db = Firestore.firestore()

    override init() {
        super.init()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        checkAuthorizationStatus()
    }

    // MARK: - Authorization

    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] granted, error in
            DispatchQueue.main.async {
                self?.isAuthorized = granted
            }

            if let error = error {
                print("❌ Notification authorization error: \(error.localizedDescription)")
            } else {
                print("✅ Notification authorization: \(granted ? "granted" : "denied")")
            }
        }
    }

    private func checkAuthorizationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                self?.isAuthorized = settings.authorizationStatus == .authorized
            }
        }
    }

    // MARK: - FCM Registration

    func registerForRemoteNotifications() {
        WKExtension.shared().registerForRemoteNotifications()
        print("📱 Registering for remote notifications...")
    }

    func handleFCMToken(_ token: String) {
        self.fcmToken = token
        print("🔑 FCM Token received: \(token.prefix(20))...")

        // Save token to Firestore
        saveFCMTokenToFirestore(token)
    }

    private func saveFCMTokenToFirestore(_ token: String) {
        guard let userId = Auth.auth().currentUser?.uid else {
            print("⚠️ Cannot save FCM token - user not authenticated")
            return
        }

        db.collection("users").document(userId).updateData([
            "fcmTokenWatch": token,
            "fcmTokenWatchUpdatedAt": FieldValue.serverTimestamp(),
            "deviceType": "apple_watch"
        ]) { error in
            if let error = error {
                print("❌ Error saving FCM token: \(error.localizedDescription)")
            } else {
                print("✅ FCM token saved to Firestore")
            }
        }
    }

    // MARK: - Handle Notifications

    func handleNotification(userInfo: [AnyHashable: Any]) {
        print("📬 Received notification: \(userInfo)")

        // Extract scan data from notification
        if let scanId = userInfo["scanId"] as? String,
           let areaDescription = userInfo["areaDescription"] as? String {
            print("🔔 New scan request: \(areaDescription) (ID: \(scanId))")

            // Provide haptic feedback
            WKInterfaceDevice.current().play(.notification)
        }
    }
}

// MARK: - MessagingDelegate

extension NotificationService: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else {
            print("⚠️ FCM token is nil")
            return
        }

        handleFCMToken(token)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationService: UNUserNotificationCenterDelegate {
    // Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        handleNotification(userInfo: userInfo)

        // Show banner and play sound
        completionHandler([.banner, .sound])
    }

    // Handle notification tap
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        handleNotification(userInfo: userInfo)

        // Handle notification actions
        if response.actionIdentifier == "ASSIST_ACTION" {
            if let scanId = userInfo["scanId"] as? String {
                print("🤝 Assisting scan: \(scanId)")

                // Claim the scan
                Task {
                    do {
                        try await FirebaseService.shared.claimScan(scanId: scanId)
                        WKInterfaceDevice.current().play(.success)
                    } catch {
                        print("❌ Error claiming scan from notification: \(error.localizedDescription)")
                        WKInterfaceDevice.current().play(.failure)
                    }
                }
            }
        }

        completionHandler()
    }
}
