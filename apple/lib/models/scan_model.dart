import 'package:cloud_firestore/cloud_firestore.dart';

class ScanModel {
  final String scanId;
  final String storeNumber;
  final Timestamp timestamp;
  final int? timestampMs;
  final String qrCode;
  final String areaDescription;
  final String? ipAddress;
  final String? claimedBy;
  final String? claimedByName;
  final Timestamp? claimedAt;
  final String status; // 'pending', 'claimed', 'resolved'
  final List<dynamic>? responses;
  final List<dynamic>? ignoredBy; // List of user IDs who ignored this scan

  ScanModel({
    required this.scanId,
    required this.storeNumber,
    required this.timestamp,
    this.timestampMs,
    required this.qrCode,
    required this.areaDescription,
    this.ipAddress,
    this.claimedBy,
    this.claimedByName,
    this.claimedAt,
    required this.status,
    this.responses,
    this.ignoredBy,
  });

  factory ScanModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ScanModel(
      scanId: doc.id,
      storeNumber: data['storeNumber']?.toString() ?? '',
      timestamp: data['timestamp'] ?? Timestamp.now(),
      timestampMs: data['timestampMs'],
      qrCode: data['qrCode'] ?? '',
      areaDescription: data['areaDescription'] ?? '',
      ipAddress: data['ipAddress'],
      claimedBy: data['claimedBy'],
      claimedByName: data['claimedByName'],
      claimedAt: data['claimedAt'],
      status: data['status'] ?? 'pending',
      responses: data['responses'],
      ignoredBy: data['ignoredBy'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'storeNumber': storeNumber,
      'timestamp': timestamp,
      if (timestampMs != null) 'timestampMs': timestampMs,
      'qrCode': qrCode,
      'areaDescription': areaDescription,
      if (ipAddress != null) 'ipAddress': ipAddress,
      if (claimedBy != null) 'claimedBy': claimedBy,
      if (claimedByName != null) 'claimedByName': claimedByName,
      if (claimedAt != null) 'claimedAt': claimedAt,
      'status': status,
      if (responses != null) 'responses': responses,
      if (ignoredBy != null) 'ignoredBy': ignoredBy,
    };
  }

  bool get isPending => status == 'pending';
  bool get isClaimed => status == 'claimed';
  bool get isResolved => status == 'resolved';

  Duration get elapsedTime {
    final now = DateTime.now();
    final scanTime = timestamp.toDate();
    return now.difference(scanTime);
  }

  String get elapsedTimeString {
    final elapsed = elapsedTime;
    if (elapsed.inMinutes < 1) {
      return 'Just now';
    } else if (elapsed.inMinutes < 60) {
      return '${elapsed.inMinutes}m ago';
    } else if (elapsed.inHours < 24) {
      return '${elapsed.inHours}h ago';
    } else {
      return '${elapsed.inDays}d ago';
    }
  }
}
