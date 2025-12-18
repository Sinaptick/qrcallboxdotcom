//
//  ScanRequest.swift
//  QRCallWatch
//
//  Data model for customer assistance requests
//

import Foundation

struct ScanRequest: Identifiable, Codable {
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

        if minutes < 1 {
            return "Just now"
        } else if minutes == 1 {
            return "1 min"
        } else if minutes < 60 {
            return "\(minutes) mins"
        } else {
            let hours = minutes / 60
            let remainingMins = minutes % 60
            if hours == 1 {
                return remainingMins > 0 ? "1h \(remainingMins)m" : "1 hour"
            } else {
                return remainingMins > 0 ? "\(hours)h \(remainingMins)m" : "\(hours) hours"
            }
        }
    }

    var priorityLevel: Priority {
        let minutes = elapsedMinutes
        if minutes < 2 {
            return .low
        } else if minutes < 5 {
            return .medium
        } else {
            return .high
        }
    }

    enum Priority {
        case low, medium, high

        var color: String {
            switch self {
            case .low: return "green"
            case .medium: return "orange"
            case .high: return "red"
            }
        }
    }
}

// MARK: - Sample Data (for Previews)

extension ScanRequest {
    static let sample = ScanRequest(
        id: "scan123",
        storeNumber: "1458",
        areaDescription: "Electronics - TV Wall",
        timestamp: Date().addingTimeInterval(-180), // 3 minutes ago
        status: "pending"
    )

    static let samples = [
        ScanRequest(
            id: "scan1",
            storeNumber: "1458",
            areaDescription: "Electronics - TV Wall",
            timestamp: Date().addingTimeInterval(-120),
            status: "pending"
        ),
        ScanRequest(
            id: "scan2",
            storeNumber: "1458",
            areaDescription: "Appliances - Washers",
            timestamp: Date().addingTimeInterval(-300),
            status: "pending"
        ),
        ScanRequest(
            id: "scan3",
            storeNumber: "1458",
            areaDescription: "Home Decor",
            timestamp: Date().addingTimeInterval(-60),
            status: "pending"
        )
    ]
}
