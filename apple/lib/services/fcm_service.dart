import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';

class FCMService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  // Notification action callback
  Function(String scanId, String action)? onNotificationAction;

  // Initialize FCM and local notifications
  Future<void> initialize() async {
    // Request permission (critical for iOS)
    final settings = await _messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );

    // Always log permission status (important for debugging)
    print('🔔 FCM Permission status: ${settings.authorizationStatus}');

    // Initialize local notifications for foreground messages
    await _initializeLocalNotifications();

    // Configure FCM message handlers
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Handle notification that opened the app from terminated state
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    }
  }

  // Initialize local notifications plugin
  Future<void> _initializeLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');

    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    final initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _handleLocalNotificationTap,
    );

    // Create notification channel for Android
    const androidChannel = AndroidNotificationChannel(
      'assistance_requests',
      'Assistance Requests',
      description: 'Notifications for customer assistance requests',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(androidChannel);
  }

  // Validate notification payload
  bool _validateNotificationPayload(Map<String, dynamic> data) {
    // Check for required fields
    if (!data.containsKey('scanId')) {
      if (kDebugMode) {
        print('Invalid notification payload: missing scanId');
      }
      return false;
    }

    final scanId = data['scanId'];

    // Validate scanId type and format
    if (scanId is! String) {
      if (kDebugMode) {
        print('Invalid notification payload: scanId is not a string');
      }
      return false;
    }

    // Validate scanId length
    if (scanId.isEmpty || scanId.length > 100) {
      if (kDebugMode) {
        print('Invalid notification payload: scanId length invalid');
      }
      return false;
    }

    return true;
  }

  // Handle foreground messages (display local notification)
  void _handleForegroundMessage(RemoteMessage message) {
    if (kDebugMode) {
      print('Foreground message: ${message.messageId}');
    }

    final notification = message.notification;
    final data = message.data;

    // Validate payload before processing
    if (!_validateNotificationPayload(data)) {
      if (kDebugMode) {
        print('Ignoring notification with invalid payload');
      }
      return;
    }

    if (notification != null) {
      _showLocalNotification(
        title: notification.title ?? 'Customer Needs Assistance',
        body: notification.body ?? '',
        payload: data['scanId'] ?? '',
      );
    }
  }

  // Show local notification
  Future<void> _showLocalNotification({
    required String title,
    required String body,
    required String payload,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'assistance_requests',
      'Assistance Requests',
      channelDescription: 'Notifications for customer assistance requests',
      importance: Importance.high,
      priority: Priority.high,
      actions: <AndroidNotificationAction>[
        AndroidNotificationAction(
          'assist',
          'Assist',
          showsUserInterface: true,
        ),
        AndroidNotificationAction(
          'ignore',
          'Ignore',
          showsUserInterface: false,
        ),
      ],
    );

    const iosDetails = DarwinNotificationDetails(
      categoryIdentifier: 'ASSISTANCE_REQUEST',
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      payload.hashCode,
      title,
      body,
      details,
      payload: payload,
    );
  }

  // Handle notification tap from background/terminated
  void _handleNotificationTap(RemoteMessage message) {
    if (kDebugMode) {
      print('Notification tapped: ${message.messageId}');
    }

    // Validate payload before processing
    if (!_validateNotificationPayload(message.data)) {
      if (kDebugMode) {
        print('Ignoring notification tap with invalid payload');
      }
      return;
    }

    final scanId = message.data['scanId'] as String;
    if (onNotificationAction != null) {
      onNotificationAction!(scanId, 'open');
    }
  }

  // Handle local notification tap
  void _handleLocalNotificationTap(NotificationResponse response) {
    if (kDebugMode) {
      print('Local notification action: ${response.actionId}');
    }

    final scanId = response.payload ?? '';
    final action = response.actionId ?? 'open';

    // Validate payload
    if (scanId.isEmpty || scanId.length > 100) {
      if (kDebugMode) {
        print('Invalid local notification payload');
      }
      return;
    }

    if (onNotificationAction != null) {
      onNotificationAction!(scanId, action);
    }
  }

  // Get FCM token
  Future<String?> getToken() async {
    try {
      final token = await _messaging.getToken();
      // Always log token status (important for debugging)
      if (token != null) {
        print('✅ FCM Token obtained: ${token.substring(0, 60)}...');
      } else {
        print('❌ FCM Token is NULL - check permissions and APNS setup');
      }
      return token;
    } catch (e) {
      print('❌ Error getting FCM token: $e');
      return null;
    }
  }

  // Listen for token refresh
  void onTokenRefresh(Function(String) callback) {
    _messaging.onTokenRefresh.listen(callback);
  }

  // Subscribe to topic
  Future<void> subscribeToTopic(String topic) async {
    try {
      await _messaging.subscribeToTopic(topic);
      if (kDebugMode) {
        print('Subscribed to topic: $topic');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error subscribing to topic: $e');
      }
    }
  }

  // Unsubscribe from topic
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _messaging.unsubscribeFromTopic(topic);
      if (kDebugMode) {
        print('Unsubscribed from topic: $topic');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error unsubscribing from topic: $e');
      }
    }
  }
}

// Background message handler (must be top-level function)
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (kDebugMode) {
    print('Background message: ${message.messageId}');
  }
  // Handle background message
}
