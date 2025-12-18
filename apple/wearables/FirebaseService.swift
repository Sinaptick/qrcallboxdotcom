//
//  FirebaseService.swift
//  QRCallWatch
//
//  Manages Firebase authentication and Firestore data
//

import Foundation
import Firebase
import FirebaseAuth
import FirebaseFirestore
import WatchConnectivity

class FirebaseService: NSObject, ObservableObject {
    static let shared = FirebaseService()

    @Published var isAuthenticated = false
    @Published var pendingScans: [ScanRequest] = []
    @Published var userStore: String?
    @Published var userName: String?

    private let db = Firestore.firestore()
    private var scansListener: ListenerRegistration?
    private var currentUserId: String?

    override init() {
        super.init()
        setupAuthListener()
        setupWatchConnectivity()
    }

    // MARK: - Authentication

    private func setupAuthListener() {
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self = self else { return }

            self.isAuthenticated = user != nil
            self.currentUserId = user?.uid

            if let userId = user?.uid {
                print("✅ User authenticated: \(userId)")
                self.loadUserProfile(userId: userId)
                self.startListeningForScans()
            } else {
                print("❌ User not authenticated")
                self.stopListeningForScans()
                self.userStore = nil
                self.userName = nil
                self.pendingScans = []
            }
        }
    }

    // MARK: - User Profile

    private func loadUserProfile(userId: String) {
        db.collection("users").document(userId).getDocument { [weak self] snapshot, error in
            guard let self = self else { return }

            if let error = error {
                print("❌ Error loading user profile: \(error.localizedDescription)")
                return
            }

            guard let data = snapshot?.data() else {
                print("⚠️ No user profile data found")
                return
            }

            // Handle storeNumber as String or Number
            if let storeNum = data["storeNumber"] as? String {
                self.userStore = storeNum
            } else if let storeNum = data["storeNumber"] as? Int {
                self.userStore = String(storeNum)
            }

            // Get user name
            let firstName = data["firstName"] as? String ?? ""
            let lastName = data["lastName"] as? String ?? ""
            self.userName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)

            print("✅ User profile loaded - Store: \(self.userStore ?? "unknown"), Name: \(self.userName ?? "unknown")")
        }
    }

    // MARK: - Scans Listener

    func startListeningForScans() {
        guard let storeNumber = userStore else {
            print("⚠️ Cannot listen for scans - no store number")
            return
        }

        print("👂 Starting to listen for scans at store: \(storeNumber)")

        scansListener = db.collection("scans")
            .whereField("storeNumber", isEqualTo: storeNumber)
            .whereField("status", isEqualTo: "pending")
            .order(by: "timestamp", descending: true)
            .limit(to: 20)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }

                if let error = error {
                    print("❌ Error listening for scans: \(error.localizedDescription)")
                    return
                }

                guard let documents = snapshot?.documents else {
                    print("⚠️ No scan documents found")
                    return
                }

                self.pendingScans = documents.compactMap { doc -> ScanRequest? in
                    let data = doc.data()

                    guard let areaDescription = data["areaDescription"] as? String,
                          let storeNum = data["storeNumber"] as? String,
                          let timestamp = (data["timestamp"] as? Timestamp)?.dateValue()
                    else {
                        return nil
                    }

                    return ScanRequest(
                        id: doc.documentID,
                        storeNumber: storeNum,
                        areaDescription: areaDescription,
                        timestamp: timestamp,
                        status: data["status"] as? String ?? "pending"
                    )
                }

                print("📋 Loaded \(self.pendingScans.count) pending scans")
            }
    }

    func stopListeningForScans() {
        scansListener?.remove()
        scansListener = nil
        print("🔇 Stopped listening for scans")
    }

    // MARK: - Claim Scan

    func claimScan(scanId: String) async throws {
        guard let userId = currentUserId,
              let userName = userName else {
            throw NSError(domain: "FirebaseService", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "User not authenticated"
            ])
        }

        let scanRef = db.collection("scans").document(scanId)

        do {
            try await db.runTransaction({ (transaction, errorPointer) -> Any? in
                let scanDocument: DocumentSnapshot
                do {
                    try scanDocument = transaction.getDocument(scanRef)
                } catch let fetchError as NSError {
                    errorPointer?.pointee = fetchError
                    return nil
                }

                guard let data = scanDocument.data(),
                      let status = data["status"] as? String else {
                    let error = NSError(domain: "FirebaseService", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "Scan not found"
                    ])
                    errorPointer?.pointee = error
                    return nil
                }

                // Check if already claimed
                if status != "pending" {
                    let error = NSError(domain: "FirebaseService", code: 3, userInfo: [
                        NSLocalizedDescriptionKey: "Scan already claimed by another associate"
                    ])
                    errorPointer?.pointee = error
                    return nil
                }

                // Claim the scan
                transaction.updateData([
                    "status": "claimed",
                    "claimedBy": userId,
                    "claimedByName": userName,
                    "claimedAt": FieldValue.serverTimestamp(),
                    "claimedVia": "apple_watch"
                ], forDocument: scanRef)

                return nil
            })

            print("✅ Successfully claimed scan: \(scanId)")
        } catch {
            print("❌ Error claiming scan: \(error.localizedDescription)")
            throw error
        }
    }

    // MARK: - Watch Connectivity

    private func setupWatchConnectivity() {
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
            print("⌚ Watch Connectivity activated")
        }
    }
}

// MARK: - WCSessionDelegate

extension FirebaseService: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error = error {
            print("❌ Watch Connectivity activation error: \(error.localizedDescription)")
        } else {
            print("✅ Watch Connectivity activated with state: \(activationState.rawValue)")
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        // Handle messages from iPhone app
        print("📨 Received message from iPhone: \(message)")

        if let authToken = message["authToken"] as? String {
            // Handle authentication token from iPhone
            print("🔐 Received auth token from iPhone")
        }

        if let userStore = message["userStore"] as? String {
            DispatchQueue.main.async {
                self.userStore = userStore
                self.startListeningForScans()
            }
        }
    }
}
