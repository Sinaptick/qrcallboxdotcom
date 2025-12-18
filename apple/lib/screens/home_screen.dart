import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../models/scan_model.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import '../services/fcm_service.dart';
import '../widgets/scan_list_item.dart';
import 'settings_screen.dart';
import 'profile_screen.dart';
import 'login_screen.dart';
import 'admin_panel_screen.dart';
import 'leaderboard_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;
  UserModel? _currentUser;
  bool _hasShiftSettings = true;
  bool _checkedShiftSettings = false;
  Timer? _shiftStatusTimer;
  StreamSubscription<String>? _tokenRefreshSubscription;

  @override
  void initState() {
    super.initState();
    _safeInitialize();
  }

  Future<void> _safeInitialize() async {
    try {
      print('🔵 Starting _initializeUser');
      await _initializeUser();
      print('✅ _initializeUser complete');
    } catch (e) {
      print('❌ Error in _initializeUser: $e');
    }

    try {
      print('🔵 Starting _setupFCM');
      await _setupFCM();
      print('✅ _setupFCM complete');
    } catch (e) {
      print('❌ Error in _setupFCM: $e');
    }

    try {
      print('🔵 Starting _checkShiftSettings');
      await _checkShiftSettings();
      print('✅ _checkShiftSettings complete');
    } catch (e) {
      print('❌ Error in _checkShiftSettings: $e');
    }

    try {
      print('🔵 Starting _startShiftStatusTimer');
      _startShiftStatusTimer();
      print('✅ _startShiftStatusTimer complete');
    } catch (e) {
      print('❌ Error in _startShiftStatusTimer: $e');
    }
  }

  @override
  void dispose() {
    _shiftStatusTimer?.cancel();
    _tokenRefreshSubscription?.cancel();
    super.dispose();
  }

  /// Start a timer to update shift status every minute
  void _startShiftStatusTimer() {
    _shiftStatusTimer = Timer.periodic(const Duration(minutes: 1), (timer) {
      if (mounted && _currentUser != null) {
        // Trigger a rebuild to recalculate shift status
        setState(() {
          // The shift status is computed dynamically in UserModel getters
        });
      }
    });
  }

  Future<void> _initializeUser() async {
    final authService = Provider.of<AuthService>(context, listen: false);
    final user = authService.currentUser;

    if (user != null) {
      final userProfile = await authService.getUserProfile(user.uid);
      if (mounted) {
        setState(() {
          _currentUser = userProfile;
        });
      }
    }
  }

  Future<void> _setupFCM() async {
    print('📱 _setupFCM called');
    final fcmService = Provider.of<FCMService>(context, listen: false);
    final authService = Provider.of<AuthService>(context, listen: false);

    // Get FCM token with error handling
    try {
      final token = await fcmService.getToken();
      print('📱 Token from FCM service: ${token != null ? "EXISTS" : "NULL"}');
      if (token != null && mounted) {
        // Update token in Firestore
        final user = authService.currentUser;
        if (user != null) {
          print('📱 Updating FCM token in Firestore for user: ${user.uid}');
          await authService.updateFCMToken(user.uid, token);
          print('✅ FCM token updated in Firestore');
        } else {
          print('❌ No current user - cannot update FCM token');
        }
      } else {
        print('❌ Token is null or widget unmounted - cannot update FCM token');
      }
    } catch (e) {
      print('❌ Error setting up FCM token: $e');
      // Don't crash the app - FCM can be set up later
    }

    // Handle notification actions
    fcmService.onNotificationAction = (scanId, action) {
      print('Notification action: $action for scan: $scanId');
      // Navigate to home tab and handle action
      if (action == 'assist') {
        if (mounted) {
          setState(() => _selectedIndex = 0);
        }
        // Auto-claim logic could go here
      }
    };

    // Listen for token refresh - store subscription for proper disposal
    _tokenRefreshSubscription = FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
      final user = authService.currentUser;
      if (user != null && mounted) {
        try {
          await authService.updateFCMToken(user.uid, newToken);
          print('✅ Token refreshed and updated in Firestore');
        } catch (e) {
          print('❌ Error updating refreshed token: $e');
        }
      }
    });
  }

  Future<void> _checkShiftSettings() async {
    final prefs = await SharedPreferences.getInstance();

    // Check if any day is enabled in the schedule
    bool hasAnyDayEnabled = false;
    final days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    for (final day in days) {
      final enabled = prefs.getBool('schedule_${day}_enabled') ?? false;
      if (enabled) {
        hasAnyDayEnabled = true;
        break;
      }
    }

    setState(() {
      _hasShiftSettings = hasAnyDayEnabled;
      _checkedShiftSettings = true;
    });

    // Show first-time setup dialog if no shift settings
    if (!hasAnyDayEnabled && mounted) {
      // Check if we've shown the prompt before
      final hasSeenPrompt = prefs.getBool('shift_setup_prompt_shown') ?? false;

      if (!hasSeenPrompt) {
        // Wait a bit for UI to settle
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted) {
          _showShiftSetupPrompt();
          await prefs.setBool('shift_setup_prompt_shown', true);
        }
      }
    }
  }

  void _showShiftSetupPrompt() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.schedule, color: Colors.blue),
            SizedBox(width: 8),
            Text('Set Your Work Schedule'),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'To receive notifications only during your shifts, please set up your work schedule.',
              style: TextStyle(fontSize: 16),
            ),
            SizedBox(height: 12),
            Text(
              'You can:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.check_circle, size: 16, color: Colors.green),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Set specific hours for each day'),
                ),
              ],
            ),
            SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.check_circle, size: 16, color: Colors.green),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Enable/disable days as needed'),
                ),
              ],
            ),
            SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.check_circle, size: 16, color: Colors.green),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Update anytime in Settings'),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Skip for Now'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              setState(() => _selectedIndex = 1); // Switch to Settings tab
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
            ),
            child: const Text('Set Schedule'),
          ),
        ],
      ),
    );
  }

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });

    // Re-check shift settings and reload user profile when returning to home tab
    if (index == 0) {
      _checkShiftSettings();
      _initializeUser(); // Reload user profile to get updated schedule
    }
  }

  String _getRemainingShiftTime(String shiftEndTime) {
    try {
      // Parse the shift end time (format: "HH:mm")
      final parts = shiftEndTime.split(':');
      if (parts.length != 2) return '';

      final hours = int.parse(parts[0]);
      final minutes = int.parse(parts[1]);

      // Get current time
      final now = DateTime.now();

      // Create shift end DateTime for today
      var shiftEnd = DateTime(now.year, now.month, now.day, hours, minutes);

      // If shift end time is earlier than current time, it means shift ends tomorrow
      if (shiftEnd.isBefore(now)) {
        shiftEnd = shiftEnd.add(const Duration(days: 1));
      }

      // Calculate difference
      final difference = shiftEnd.difference(now);

      if (difference.inMinutes < 1) {
        return '(shift ending)';
      } else if (difference.inHours < 1) {
        return '(${difference.inMinutes}m left)';
      } else {
        final h = difference.inHours;
        final m = difference.inMinutes % 60;
        return '(${h}h ${m}m left)';
      }
    } catch (e) {
      return '';
    }
  }

  Future<void> _handleLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      final authService = Provider.of<AuthService>(context, listen: false);
      await authService.signOut();

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> pages = [
      _buildDashboardPage(),
      const SettingsScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('QRCallBox'),
        actions: [
          IconButton(
            icon: const Icon(Icons.emoji_events),
            tooltip: 'Leaderboard',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const LeaderboardScreen(),
                ),
              );
            },
          ),
          if (_currentUser?.isAdmin ?? false)
            IconButton(
              icon: const Icon(Icons.admin_panel_settings),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const AdminPanelScreen(),
                  ),
                );
              },
            ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _handleLogout,
          ),
        ],
      ),
      body: pages[_selectedIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _onItemTapped,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardPage() {
    if (_currentUser == null) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading profile...'),
          ],
        ),
      );
    }

    final storeNumber = _currentUser?.storeNumberString;

    if (storeNumber == null || storeNumber.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.warning_amber_rounded,
                size: 64,
                color: Colors.orange,
              ),
              const SizedBox(height: 16),
              const Text(
                'Store Assignment Required',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Please contact your administrator to assign you to a store.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      'Welcome, ${_currentUser?.firstName ?? "User"}!',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: (_currentUser?.isOnShift ?? false)
                          ? Colors.green[600]
                          : Colors.grey[400],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          (_currentUser?.isOnShift ?? false)
                              ? Icons.check_circle
                              : Icons.remove_circle_outline,
                          size: 16,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          (_currentUser?.isOnShift ?? false)
                              ? 'On Shift${_currentUser?.shiftEndTime != null ? ' until ${_currentUser!.shiftEndTime}' : ''}'
                              : 'Off Shift',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    Icons.store,
                    size: 18,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Store $storeNumber',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _currentUser?.jobTitle ?? "Associate",
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ],
              ),
              if (_currentUser?.isOnShift == true && _currentUser?.shiftEndTime != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      Icon(
                        Icons.access_time,
                        size: 14,
                        color: Colors.green[700],
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _getRemainingShiftTime(_currentUser!.shiftEndTime!),
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.green[700],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),

        // Shift settings reminder banner
        if (!_hasShiftSettings && _checkedShiftSettings)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: Colors.orange[100],
            child: Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: Colors.orange[800], size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Set Your Work Schedule',
                        style: TextStyle(
                          color: Colors.orange[900],
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Configure shift times to receive notifications during work hours',
                        style: TextStyle(
                          color: Colors.orange[800],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => setState(() => _selectedIndex = 1),
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.orange[700],
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  child: const Text('Set Now', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ),

        // Scans list
        Expanded(
          child: StreamBuilder<List<ScanModel>>(
            stream: Provider.of<FirestoreService>(context, listen: false)
                .getScansForStore(storeNumber, _currentUser!.userId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, size: 64, color: Colors.red),
                        const SizedBox(height: 16),
                        Text('Error: ${snapshot.error}'),
                      ],
                    ),
                  ),
                );
              }

              final scans = snapshot.data ?? [];

              if (scans.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.check_circle_outline,
                          size: 64,
                          color: Colors.green,
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'No Active Requests',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'All customers have been assisted!',
                          style: TextStyle(color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: () async {
                  // Refresh is automatic with stream
                  await Future.delayed(const Duration(milliseconds: 500));
                },
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: scans.length,
                  itemBuilder: (context, index) {
                    final scan = scans[index];
                    return ScanListItem(
                      scan: scan,
                      userId: _currentUser!.userId,
                      userName: _currentUser!.fullName,
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
