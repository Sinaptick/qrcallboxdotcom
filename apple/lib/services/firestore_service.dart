import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/scan_model.dart';
import '../models/user_model.dart';

class FirestoreService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Get scans for a specific store (real-time stream)
  // Includes pending scans and claimed scans from the last 15 minutes
  // Filters out scans ignored by the current user
  // Automatically marks scans as ignored after 10 minutes
  Stream<List<ScanModel>> getScansForStore(String storeNumber, String userId) {
    // Calculate 24 hours ago
    final twentyFourHoursAgo = DateTime.now().subtract(const Duration(hours: 24));

    return _firestore
        .collection('scans')
        .where('storeNumber', isEqualTo: storeNumber)
        .where('timestamp', isGreaterThan: Timestamp.fromDate(twentyFourHoursAgo))
        .orderBy('timestamp', descending: true)
        .limit(50)
        .snapshots()
        .asyncMap((snapshot) async {
      final now = DateTime.now();
      final fifteenMinutesAgo = now.subtract(const Duration(minutes: 15));
      final tenMinutesAgo = now.subtract(const Duration(minutes: 10));

      final filteredScans = <ScanModel>[];

      for (final doc in snapshot.docs) {
        final scan = ScanModel.fromFirestore(doc);
        final scanTime = scan.timestamp.toDate();
        final scanAge = now.difference(scanTime);

        // Skip scans older than 15 minutes entirely
        if (scanAge.inMinutes >= 15) {
          continue;
        }

        // Skip pending scans older than 10 minutes (server handles auto-ignoring via scheduled function)
        // The server-side Cloud Function 'autoIgnoreOldScans' runs every 5 minutes to mark these as 'auto_ignored'
        if (scan.status == 'pending' && scanAge.inMinutes >= 10) {
          continue; // Don't show in UI - will be auto-ignored by server
        }

        // Skip scans already auto-ignored by server
        if (scan.status == 'auto_ignored') {
          continue;
        }

        // Filter out scans manually ignored by this user
        if (scan.ignoredBy != null && scan.ignoredBy!.contains(userId)) {
          continue;
        }

        // Include pending scans (under 10 minutes old)
        if (scan.status == 'pending') {
          filteredScans.add(scan);
          continue;
        }

        // Include claimed scans from the last 15 minutes
        if (scan.status == 'claimed' && scan.claimedAt != null) {
          final claimedTime = scan.claimedAt!.toDate();
          if (claimedTime.isAfter(fifteenMinutesAgo)) {
            filteredScans.add(scan);
          }
        }
      }

      return filteredScans;
    });
  }

  // Get all pending scans (for admin)
  Stream<List<ScanModel>> getAllPendingScans() {
    return _firestore
        .collection('scans')
        .where('status', isEqualTo: 'pending')
        .orderBy('timestamp', descending: true)
        .limit(100)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) => ScanModel.fromFirestore(doc)).toList();
    });
  }

  // Claim a scan (assist button action with validation)
  Future<bool> claimScan(String scanId, String userId, String userName) async {
    // Input validation
    if (scanId.isEmpty || scanId.length > 100) {
      throw ArgumentError('Invalid scan ID');
    }
    if (userId.isEmpty || userId.length > 128) {
      throw ArgumentError('Invalid user ID');
    }
    if (userName.isEmpty || userName.length > 100) {
      throw ArgumentError('Invalid user name');
    }

    try {
      final scanRef = _firestore.collection('scans').doc(scanId);

      // Use transaction to prevent race conditions
      return await _firestore.runTransaction<bool>((transaction) async {
        final scanDoc = await transaction.get(scanRef);

        if (!scanDoc.exists) {
          throw Exception('Scan does not exist');
        }

        final scanData = scanDoc.data()!;
        final currentStatus = scanData['status'];

        // Check if scan is still pending
        if (currentStatus != 'pending') {
          return false; // Already claimed by someone else
        }

        // Claim the scan
        transaction.update(scanRef, {
          'status': 'claimed',
          'claimedBy': userId,
          'claimedByName': userName,
          'claimedAt': FieldValue.serverTimestamp(),
        });

        return true;
      });
    } catch (e) {
      if (kDebugMode) {
        print('Error claiming scan: $e');
      }
      return false;
    }
  }

  // Release a scan (ignore button action)
  Future<void> releaseScan(String scanId) async {
    try {
      await _firestore.collection('scans').doc(scanId).update({
        'status': 'pending',
        'claimedBy': FieldValue.delete(),
        'claimedByName': FieldValue.delete(),
        'claimedAt': FieldValue.delete(),
      });
    } catch (e) {
      if (kDebugMode) {
        print('Error releasing scan: $e');
      }
      rethrow;
    }
  }

  // Ignore a scan (hide it for this user only)
  Future<void> ignoreScan(String scanId, String userId) async {
    try {
      await _firestore.collection('scans').doc(scanId).update({
        'ignoredBy': FieldValue.arrayUnion([userId]),
      });
    } catch (e) {
      if (kDebugMode) {
        print('Error ignoring scan: $e');
      }
      rethrow;
    }
  }

  // Mark scan as resolved
  Future<void> resolveScan(String scanId) async {
    try {
      await _firestore.collection('scans').doc(scanId).update({
        'status': 'resolved',
      });
    } catch (e) {
      if (kDebugMode) {
        print('Error resolving scan: $e');
      }
      rethrow;
    }
  }

  // Get user profile stream
  Stream<UserModel?> getUserStream(String uid) {
    return _firestore.collection('users').doc(uid).snapshots().map((doc) {
      if (doc.exists) {
        return UserModel.fromFirestore(doc);
      }
      return null;
    });
  }

  // Get user data (one-time fetch)
  Future<Map<String, dynamic>?> getUserData(String uid) async {
    // Validate UID
    if (uid.isEmpty || uid.length > 128) {
      throw ArgumentError('Invalid user ID');
    }

    try {
      final doc = await _firestore.collection('users').doc(uid).get();
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (e) {
      if (kDebugMode) {
        print('Error getting user data: $e');
      }
      rethrow;
    }
  }

  // Update a single user field
  Future<void> updateUserField(String uid, String field, dynamic value) async {
    // Validate UID
    if (uid.isEmpty || uid.length > 128) {
      throw ArgumentError('Invalid user ID');
    }

    // Validate field name
    if (field.isEmpty || field.length > 50) {
      throw ArgumentError('Invalid field name');
    }

    // Validate specific fields
    if (field == 'storeNumber' && value != null) {
      final storeStr = value.toString();
      if (storeStr.isEmpty || storeStr.length > 10) {
        throw ArgumentError('Invalid store number');
      }
    }

    try {
      await _firestore.collection('users').doc(uid).update({
        field: value,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (kDebugMode) {
        print('Updated $field for user $uid');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error updating user field: $e');
      }
      rethrow;
    }
  }

  // Get all users (admin only)
  Future<List<UserModel>> getAllUsers() async {
    try {
      final snapshot = await _firestore.collection('users').get();
      return snapshot.docs.map((doc) => UserModel.fromFirestore(doc)).toList();
    } catch (e) {
      if (kDebugMode) {
        print('Error getting all users: $e');
      }
      return [];
    }
  }

  // Get users by store number
  Future<List<UserModel>> getUsersByStore(String storeNumber) async {
    try {
      final snapshot = await _firestore
          .collection('users')
          .where('storeNumber', isEqualTo: storeNumber)
          .get();
      return snapshot.docs.map((doc) => UserModel.fromFirestore(doc)).toList();
    } catch (e) {
      if (kDebugMode) {
        print('Error getting users by store: $e');
      }
      return [];
    }
  }

  // Add response to scan (with validation)
  Future<void> addScanResponse(String scanId, Map<String, dynamic> response) async {
    // Input validation
    if (scanId.isEmpty || scanId.length > 100) {
      throw ArgumentError('Invalid scan ID');
    }

    // Validate response structure
    if (!response.containsKey('timestamp') || !response.containsKey('userId')) {
      throw ArgumentError('Response must contain timestamp and userId');
    }

    // Sanitize and limit message length
    final sanitizedResponse = <String, dynamic>{
      'timestamp': response['timestamp'],
      'userId': response['userId'],
    };

    if (response.containsKey('message') && response['message'] is String) {
      final message = (response['message'] as String).trim();
      sanitizedResponse['message'] = message.length > 500 ? message.substring(0, 500) : message;
    }

    if (response.containsKey('action') && response['action'] is String) {
      sanitizedResponse['action'] = (response['action'] as String).trim();
    }

    try {
      await _firestore.collection('scans').doc(scanId).update({
        'responses': FieldValue.arrayUnion([sanitizedResponse]),
      });
    } catch (e) {
      if (kDebugMode) {
        print('Error adding scan response: $e');
      }
      rethrow;
    }
  }

  // Update user work schedule (with validation)
  Future<void> updateWorkSchedule(String uid, Map<String, Map<String, dynamic>> schedule) async {
    // Validate UID
    if (uid.isEmpty || uid.length > 128) {
      throw ArgumentError('Invalid user ID');
    }

    // Validate schedule structure (Android format)
    final validDays = {'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'};

    for (final entry in schedule.entries) {
      if (!validDays.contains(entry.key.toLowerCase())) {
        throw ArgumentError('Invalid day: ${entry.key}');
      }

      final daySchedule = entry.value;

      // Validate required fields
      if (!daySchedule.containsKey('isWorkingDay')) {
        throw ArgumentError('Missing isWorkingDay for ${entry.key}');
      }
      if (!daySchedule.containsKey('startHour') || !daySchedule.containsKey('startMinute')) {
        throw ArgumentError('Missing start time for ${entry.key}');
      }
      if (!daySchedule.containsKey('endHour') || !daySchedule.containsKey('endMinute')) {
        throw ArgumentError('Missing end time for ${entry.key}');
      }

      // Validate time values
      final startHour = daySchedule['startHour'] as int;
      final startMinute = daySchedule['startMinute'] as int;
      final endHour = daySchedule['endHour'] as int;
      final endMinute = daySchedule['endMinute'] as int;

      if (startHour < 0 || startHour > 23) {
        throw ArgumentError('Invalid startHour: $startHour');
      }
      if (startMinute < 0 || startMinute > 59) {
        throw ArgumentError('Invalid startMinute: $startMinute');
      }
      if (endHour < 0 || endHour > 23) {
        throw ArgumentError('Invalid endHour: $endHour');
      }
      if (endMinute < 0 || endMinute > 59) {
        throw ArgumentError('Invalid endMinute: $endMinute');
      }
    }

    try {
      await _firestore.collection('users').doc(uid).update({
        'workSchedule': schedule,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (kDebugMode) {
        print('Work schedule updated in Firestore for user $uid');
        print('Schedule format: Android-compatible (isWorkingDay, startHour, etc.)');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error updating work schedule: $e');
      }
      rethrow;
    }
  }

  // Update FCM token (with validation)
  Future<void> updateFCMToken(String uid, String fcmToken) async {
    // Validate UID
    if (uid.isEmpty || uid.length > 128) {
      throw ArgumentError('Invalid user ID');
    }

    // Validate FCM token format
    if (fcmToken.isEmpty || fcmToken.length > 200) {
      throw ArgumentError('Invalid FCM token');
    }

    try {
      await _firestore.collection('users').doc(uid).update({
        'fcmToken': fcmToken,
        'fcmTokenUpdatedAt': FieldValue.serverTimestamp(),
      });
      if (kDebugMode) {
        print('FCM token updated in Firestore for user $uid');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error updating FCM token: $e');
      }
      rethrow;
    }
  }

  // Get available areas for a store (from recent scans)
  Future<List<String>> getAvailableAreas(String storeNumber) async {
    // Validate store number
    if (storeNumber.isEmpty || storeNumber.length > 10) {
      throw ArgumentError('Invalid store number');
    }

    try {
      // Query recent scans for this store (last 30 days)
      final thirtyDaysAgo = DateTime.now().subtract(const Duration(days: 30));

      final querySnapshot = await _firestore
          .collection('scans')
          .where('storeNumber', isEqualTo: storeNumber)
          .where('timestamp', isGreaterThan: Timestamp.fromDate(thirtyDaysAgo))
          .get();

      // Extract unique area descriptions
      final areas = <String>{};
      for (final doc in querySnapshot.docs) {
        final data = doc.data();
        final area = data['areaDescription'] as String?;
        if (area != null && area.isNotEmpty) {
          areas.add(area);
        }
      }

      // Return sorted list
      final sortedAreas = areas.toList()..sort();
      if (kDebugMode) {
        print('Found ${sortedAreas.length} areas for store $storeNumber');
      }
      return sortedAreas;
    } catch (e) {
      if (kDebugMode) {
        print('Error loading available areas: $e');
      }
      rethrow;
    }
  }
}
