import 'package:cloud_firestore/cloud_firestore.dart';
import '../utils/shift_calculator.dart';

class UserModel {
  final String userId; // Changed from uid to match canonical schema
  final String email;
  final String firstName;
  final String lastName;
  final String jobTitle;
  final dynamic storeNumber; // Can be string or number
  final dynamic homeStore; // For market/region users
  final List<dynamic>? allowedStores; // List of stores user can access
  final String? fcmToken;
  final Timestamp? fcmTokenUpdatedAt;
  final Timestamp? updatedAt;
  final Map<String, dynamic>? pendingChanges;
  final String? access; // 'store', 'market', 'region', 'business_unit'
  final Map<String, dynamic>? workSchedule; // Work schedule configuration
  final bool approved; // Account approval status

  // Computed properties based on workSchedule
  bool get isOnShift {
    final status = ShiftCalculator.calculateShiftStatus(workSchedule);
    return status['isOnShift'] as bool;
  }

  String? get shiftEndTime {
    final status = ShiftCalculator.calculateShiftStatus(workSchedule);
    return status['shiftEndTime'] as String?;
  }

  UserModel({
    required this.userId,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.jobTitle,
    required this.storeNumber,
    this.homeStore,
    this.allowedStores,
    this.fcmToken,
    this.fcmTokenUpdatedAt,
    this.updatedAt,
    this.pendingChanges,
    this.access,
    this.workSchedule,
    this.approved = false, // Default to false if not specified
  });

  factory UserModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserModel(
      userId: doc.id,
      email: data['email'] ?? '',
      firstName: data['firstName'] ?? '',
      lastName: data['lastName'] ?? '',
      jobTitle: data['jobTitle'] ?? '',
      storeNumber: data['storeNumber'],
      homeStore: data['homeStore'],
      allowedStores: data['allowedStores'] as List<dynamic>?,
      fcmToken: data['fcmToken'],
      fcmTokenUpdatedAt: data['fcmTokenUpdatedAt'],
      updatedAt: data['updatedAt'],
      pendingChanges: data['pendingChanges'],
      access: data['access'],
      workSchedule: data['workSchedule'] as Map<String, dynamic>?,
      approved: data['approved'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'firstName': firstName,
      'lastName': lastName,
      'jobTitle': jobTitle,
      'storeNumber': storeNumber,
      if (homeStore != null) 'homeStore': homeStore,
      if (allowedStores != null) 'allowedStores': allowedStores,
      if (fcmToken != null) 'fcmToken': fcmToken,
      if (fcmTokenUpdatedAt != null) 'fcmTokenUpdatedAt': fcmTokenUpdatedAt,
      'updatedAt': FieldValue.serverTimestamp(),
      if (pendingChanges != null) 'pendingChanges': pendingChanges,
      if (access != null) 'access': access,
    };
  }

  String get fullName => '$firstName $lastName';

  // IMPORTANT: This is a client-side hint only for UI purposes
  // NEVER trust this for authorization - server-side Custom Claims are used for actual access control
  // To update admin status, use Cloud Function: setAdminClaim
  bool get isAdmin => email == 'sinaptick@gmail.com';

  String get storeNumberString => storeNumber.toString();
}
