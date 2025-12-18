import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/user_model.dart';
import 'dart:io' show Platform;

// Exception for incomplete user profiles that need store number
class IncompleteProfileException implements Exception {
  final String displayName;
  final String email;

  IncompleteProfileException(this.displayName, this.email);

  @override
  String toString() => 'User profile incomplete - needs store number';
}

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email'],
    // iOS requires explicit iOS client ID from GoogleService-Info.plist
    clientId: '611687644130-rblcqohnsalv5sf7950mndtn6fm01cu7.apps.googleusercontent.com',
  );
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Get current user
  User? get currentUser => _auth.currentUser;

  // Auth state changes stream
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  // Password strength validation
  String? validatePassword(String password) {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!password.contains(RegExp(r'[!@#$%^&*(),.?":{}|<>]'))) {
      return 'Password must contain at least one special character (!@#\$%^&*(),.?":{}|<>)';
    }
    return null; // Password is valid
  }

  // Register new user with email and password
  Future<UserCredential?> registerUser({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required String storeNumber,
  }) async {
    // Validate password strength before attempting registration
    final passwordError = validatePassword(password);
    if (passwordError != null) {
      throw Exception(passwordError);
    }

    // Validate email format
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!emailRegex.hasMatch(email)) {
      throw Exception('Invalid email address format');
    }

    // Validate name fields
    if (firstName.trim().isEmpty || firstName.length > 50) {
      throw Exception('First name must be between 1 and 50 characters');
    }
    if (lastName.trim().isEmpty || lastName.length > 50) {
      throw Exception('Last name must be between 1 and 50 characters');
    }

    // Validate store number
    if (storeNumber.trim().isEmpty || storeNumber.length > 20) {
      throw Exception('Store number must be between 1 and 20 characters');
    }

    try {
      // Create auth account
      final UserCredential userCredential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      final user = userCredential.user!;
      final fullName = '$firstName $lastName';

      // Create user document in Firestore
      await _firestore.collection('users').doc(user.uid).set({
        'userId': user.uid,
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'fullName': fullName,
        'storeNumber': storeNumber,
        'role': 'user',
        'fcmToken': '',
        'isOnShift': false,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
        'groupMeId': '',
        'notificationsEnabled': true,
        'respectDoNotDisturb': true,
        'approved': true,
      });

      return userCredential;
    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'email-already-in-use':
          throw Exception('An account with this email already exists.');
        case 'invalid-email':
          throw Exception('Invalid email address.');
        case 'weak-password':
          throw Exception('Password is too weak. Please use a stronger password.');
        default:
          throw Exception('Registration failed: ${e.message}');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error registering user: $e');
      }
      rethrow;
    }
  }

  // Sign in with email and password
  Future<UserCredential?> signInWithEmail(String email, String password) async {
    try {
      final UserCredential userCredential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Check if user exists in Firestore
      final userDoc = _firestore.collection('users').doc(userCredential.user!.uid);
      final docSnapshot = await userDoc.get();

      if (!docSnapshot.exists) {
        await _auth.signOut();
        throw Exception('Account not found. Please contact support.');
      }

      // Check if account is approved
      final userData = docSnapshot.data();
      if (userData?['approved'] == false) {
        await _auth.signOut();
        throw Exception('Your account is pending approval. Please wait for administrator activation.');
      }

      return userCredential;
    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'user-not-found':
          throw Exception('No account found with this email.');
        case 'wrong-password':
          throw Exception('Incorrect password.');
        case 'invalid-email':
          throw Exception('Invalid email address.');
        case 'user-disabled':
          throw Exception('This account has been disabled.');
        default:
          throw Exception('Authentication failed: ${e.message}');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error signing in with email: $e');
      }
      rethrow;
    }
  }

  // Sign in with Google
  Future<UserCredential?> signInWithGoogle() async {
    try {
      // Trigger the authentication flow
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();

      if (googleUser == null) {
        // User canceled the sign-in
        return null;
      }

      // Obtain the auth details from the request
      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;

      // Create a new credential
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      // Sign in to Firebase with the Google credential
      final UserCredential userCredential = await _auth.signInWithCredential(credential);

      // Check if user profile is complete
      final userDoc = _firestore.collection('users').doc(userCredential.user!.uid);
      final docSnapshot = await userDoc.get();

      if (!docSnapshot.exists || docSnapshot.data()?['storeNumber'] == null || docSnapshot.data()?['storeNumber'] == '') {
        // User needs to complete profile with store number
        throw IncompleteProfileException(
          userCredential.user?.displayName ?? '',
          userCredential.user?.email ?? '',
        );
      }

      // Check if account is approved
      final userData = docSnapshot.data();
      if (userData?['approved'] == false) {
        await _auth.signOut();
        throw Exception('Your account is pending approval. Please wait for administrator activation.');
      }

      return userCredential;
    } catch (e) {
      if (kDebugMode) {
        print('Error signing in with Google: $e');
      }
      rethrow;
    }
  }

  // Sign in with Apple
  Future<UserCredential?> signInWithApple() async {
    try {
      // Check if running on iOS
      if (!Platform.isIOS) {
        throw Exception('Apple Sign-In is only available on iOS devices');
      }

      // Request credential for the currently signed in Apple account
      final appleCredential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      // Create an `OAuthCredential` from the credential returned by Apple
      final oauthCredential = OAuthProvider("apple.com").credential(
        idToken: appleCredential.identityToken,
        accessToken: appleCredential.authorizationCode,
      );

      // Sign in to Firebase with the Apple credential
      final UserCredential userCredential = await _auth.signInWithCredential(oauthCredential);

      // Check if user profile is complete
      final userDoc = _firestore.collection('users').doc(userCredential.user!.uid);
      final docSnapshot = await userDoc.get();

      if (!docSnapshot.exists || docSnapshot.data()?['storeNumber'] == null || docSnapshot.data()?['storeNumber'] == '') {
        // Get name from Apple credential
        String displayName = '';
        if (appleCredential.givenName != null || appleCredential.familyName != null) {
          displayName = '${appleCredential.givenName ?? ''} ${appleCredential.familyName ?? ''}'.trim();
        } else {
          displayName = userCredential.user?.displayName ?? '';
        }

        // User needs to complete profile with store number
        throw IncompleteProfileException(
          displayName,
          appleCredential.email ?? userCredential.user?.email ?? '',
        );
      }

      // Check if account is approved
      final userData = docSnapshot.data();
      if (userData?['approved'] == false) {
        await _auth.signOut();
        throw Exception('Your account is pending approval. Please wait for administrator activation.');
      }

      return userCredential;
    } catch (e) {
      if (kDebugMode) {
        print('Error signing in with Apple: $e');
      }
      rethrow;
    }
  }

  // Ensure user profile exists in Firestore
  Future<void> _ensureUserProfile(User user) async {
    final userDoc = _firestore.collection('users').doc(user.uid);
    final docSnapshot = await userDoc.get();

    if (!docSnapshot.exists) {
      // Create a basic user profile
      final nameParts = (user.displayName ?? '').split(' ');
      final firstName = nameParts.isNotEmpty ? nameParts[0] : '';
      final lastName = nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';

      await userDoc.set({
        'email': user.email,
        'firstName': firstName,
        'lastName': lastName,
        'jobTitle': '',
        'storeNumber': '', // Will need to be set by admin
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
  }

  // Get user profile from Firestore
  Future<UserModel?> getUserProfile(String uid) async {
    try {
      final doc = await _firestore.collection('users').doc(uid).get();
      if (doc.exists) {
        return UserModel.fromFirestore(doc);
      }
      return null;
    } catch (e) {
      if (kDebugMode) {
        print('Error getting user profile: $e');
      }
      return null;
    }
  }

  // Update user profile
  Future<void> updateUserProfile(String uid, Map<String, dynamic> data) async {
    try {
      await _firestore.collection('users').doc(uid).update(data);
    } catch (e) {
      if (kDebugMode) {
        print('Error updating user profile: $e');
      }
      rethrow;
    }
  }

  // Complete OAuth user registration (for users authenticated via Google/Apple)
  Future<void> completeOAuthRegistration({
    required String firstName,
    required String lastName,
    required String storeNumber,
  }) async {
    try {
      final user = _auth.currentUser;
      if (user == null) {
        throw Exception('No authenticated user found');
      }

      // Validate inputs
      if (firstName.trim().isEmpty || firstName.length > 50) {
        throw Exception('First name must be between 1 and 50 characters');
      }
      if (lastName.trim().isEmpty || lastName.length > 50) {
        throw Exception('Last name must be between 1 and 50 characters');
      }
      if (storeNumber.trim().isEmpty || storeNumber.length > 20) {
        throw Exception('Store number must be between 1 and 20 characters');
      }

      final fullName = '$firstName $lastName';

      // Create or update user document in Firestore
      await _firestore.collection('users').doc(user.uid).set({
        'userId': user.uid,
        'email': user.email,
        'firstName': firstName,
        'lastName': lastName,
        'fullName': fullName,
        'storeNumber': storeNumber,
        'role': 'user',
        'fcmToken': '',
        'isOnShift': false,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
        'groupMeId': '',
        'notificationsEnabled': true,
        'respectDoNotDisturb': true,
        'approved': true,
      }, SetOptions(merge: true));
    } catch (e) {
      if (kDebugMode) {
        print('Error completing OAuth registration: $e');
      }
      rethrow;
    }
  }

  // Update FCM token
  Future<void> updateFCMToken(String uid, String token) async {
    try {
      // Get device info
      final deviceName = await _getDeviceName();
      final platform = Platform.isIOS ? 'ios' : 'android';

      // Get current tokens array
      final userDoc = await _firestore.collection('users').doc(uid).get();
      final userData = userDoc.data();
      List<dynamic> fcmTokens = userData?['fcmTokens'] ?? [];

      // Check if this token already exists - with null safety
      final existingIndex = fcmTokens.indexWhere((t) {
        if (t is Map<String, dynamic>) {
          return t['token'] == token;
        }
        return false;
      });

      final now = Timestamp.now();

      if (existingIndex >= 0) {
        // Update existing token - reconstruct the entry to update lastSeen
        final existingToken = fcmTokens[existingIndex] as Map<String, dynamic>;
        fcmTokens[existingIndex] = {
          'token': token,
          'platform': platform,
          'deviceName': deviceName,
          'addedAt': existingToken['addedAt'] ?? now,
          'lastSeen': now,
        };
      } else {
        // Add new token to array
        fcmTokens.add({
          'token': token,
          'platform': platform,
          'deviceName': deviceName,
          'addedAt': now,
          'lastSeen': now,
        });
      }

      // Keep backward compatibility with single fcmToken field
      await _firestore.collection('users').doc(uid).set({
        'fcmToken': token, // For backward compatibility
        'fcmTokens': fcmTokens, // New multi-device array
        'fcmTokenUpdatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      if (kDebugMode) {
        print('✅ FCM token updated: $platform - $deviceName');
        print('   Total devices: ${fcmTokens.length}');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error updating FCM token: $e');
      }
      rethrow;
    }
  }

  // Get device name for token tracking
  Future<String> _getDeviceName() async {
    try {
      if (Platform.isIOS) {
        // For iOS, we can use device info from UIDevice
        // For now, return a generic name (can be enhanced with device_info_plus package)
        return 'iOS Device';
      } else {
        return 'Android Device';
      }
    } catch (e) {
      return 'Unknown Device';
    }
  }

  // Sign out
  Future<void> signOut() async {
    try {
      await Future.wait([
        _auth.signOut(),
        _googleSignIn.signOut(),
      ]);
    } catch (e) {
      if (kDebugMode) {
        print('Error signing out: $e');
      }
      rethrow;
    }
  }
}
