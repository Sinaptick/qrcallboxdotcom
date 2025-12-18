import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/theme_provider.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final Map<String, TimeRange> _schedule = {
    'Monday': TimeRange(),
    'Tuesday': TimeRange(),
    'Wednesday': TimeRange(),
    'Thursday': TimeRange(),
    'Friday': TimeRange(),
    'Saturday': TimeRange(),
    'Sunday': TimeRange(),
  };

  bool _notificationsEnabled = true;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  bool _isLoading = true;
  String _storeNumber = '';
  final TextEditingController _storeNumberController = TextEditingController();

  // Area notification preferences
  List<String> _selectedAreas = [];
  List<String> _availableAreas = [];
  bool _loadingAreas = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();

    // Load store number and work schedule from Firestore
    Map<String, dynamic>? firestoreSchedule;
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      final user = authService.currentUser;

      if (user != null) {
        final userData = await firestoreService.getUserData(user.uid);
        if (userData != null) {
          // Load store number
          if (userData['storeNumber'] != null) {
            _storeNumber = userData['storeNumber'].toString();
            _storeNumberController.text = _storeNumber;
          }

          // Load work schedule from Firestore (prioritize over local storage)
          if (userData['workSchedule'] != null) {
            firestoreSchedule = userData['workSchedule'] as Map<String, dynamic>;
          }

          // Load notification area preferences
          if (userData['notificationAreas'] != null) {
            _selectedAreas = List<String>.from(userData['notificationAreas']);
          }
        }

        // Load available areas for this store
        if (_storeNumber.isNotEmpty) {
          _loadAvailableAreas(_storeNumber);
        }
      }
    } catch (e) {
      print('Error loading data from Firestore: $e');
    }

    setState(() {
      _notificationsEnabled = prefs.getBool('notifications_enabled') ?? true;
      _soundEnabled = prefs.getBool('sound_enabled') ?? true;
      _vibrationEnabled = prefs.getBool('vibration_enabled') ?? true;

      // Load schedule - prioritize Firestore over local storage
      for (final day in _schedule.keys) {
        final dayLower = day.toLowerCase();

        // Try to load from Firestore first (Android-compatible format)
        if (firestoreSchedule != null && firestoreSchedule.containsKey(dayLower)) {
          final dayData = firestoreSchedule[dayLower] as Map<String, dynamic>;
          final isWorkingDay = dayData['isWorkingDay'] as bool? ?? false;
          final startHour = dayData['startHour'] as int? ?? 9;
          final startMinute = dayData['startMinute'] as int? ?? 0;
          final endHour = dayData['endHour'] as int? ?? 17;
          final endMinute = dayData['endMinute'] as int? ?? 0;

          _schedule[day]!.enabled = isWorkingDay;
          _schedule[day]!.start = TimeOfDay(hour: startHour, minute: startMinute);
          _schedule[day]!.end = TimeOfDay(hour: endHour, minute: endMinute);

          // Update local storage to match Firestore
          prefs.setBool('schedule_${day}_enabled', isWorkingDay);
          prefs.setInt('schedule_${day}_start_hour', startHour);
          prefs.setInt('schedule_${day}_start_minute', startMinute);
          prefs.setInt('schedule_${day}_end_hour', endHour);
          prefs.setInt('schedule_${day}_end_minute', endMinute);
        } else {
          // Fall back to local storage if Firestore doesn't have schedule
          final enabled = prefs.getBool('schedule_${day}_enabled') ?? false;
          final startHour = prefs.getInt('schedule_${day}_start_hour') ?? 9;
          final startMinute = prefs.getInt('schedule_${day}_start_minute') ?? 0;
          final endHour = prefs.getInt('schedule_${day}_end_hour') ?? 17;
          final endMinute = prefs.getInt('schedule_${day}_end_minute') ?? 0;

          _schedule[day]!.enabled = enabled;
          _schedule[day]!.start = TimeOfDay(hour: startHour, minute: startMinute);
          _schedule[day]!.end = TimeOfDay(hour: endHour, minute: endMinute);
        }
      }

      _isLoading = false;
    });
  }

  @override
  void dispose() {
    _storeNumberController.dispose();
    super.dispose();
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setBool('notifications_enabled', _notificationsEnabled);
    await prefs.setBool('sound_enabled', _soundEnabled);
    await prefs.setBool('vibration_enabled', _vibrationEnabled);

    // Save schedule to SharedPreferences
    for (final entry in _schedule.entries) {
      final day = entry.key;
      final range = entry.value;

      await prefs.setBool('schedule_${day}_enabled', range.enabled);
      await prefs.setInt('schedule_${day}_start_hour', range.start.hour);
      await prefs.setInt('schedule_${day}_start_minute', range.start.minute);
      await prefs.setInt('schedule_${day}_end_hour', range.end.hour);
      await prefs.setInt('schedule_${day}_end_minute', range.end.minute);
    }

    // Save schedule to Firestore
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      final user = authService.currentUser;

      if (user != null) {
        // Convert schedule to Firestore format (matching Android format)
        final Map<String, Map<String, dynamic>> firestoreSchedule = {};

        for (final entry in _schedule.entries) {
          final day = entry.key.toLowerCase();
          final range = entry.value;

          if (range.enabled) {
            firestoreSchedule[day] = {
              'isWorkingDay': true,
              'startHour': range.start.hour,
              'startMinute': range.start.minute,
              'endHour': range.end.hour,
              'endMinute': range.end.minute,
            };
          } else {
            // Disabled day
            firestoreSchedule[day] = {
              'isWorkingDay': false,
              'startHour': 9,
              'startMinute': 0,
              'endHour': 17,
              'endMinute': 0,
            };
          }
        }

        await firestoreService.updateWorkSchedule(user.uid, firestoreSchedule);
      }
    } catch (e) {
      print('Error saving schedule to Firestore: $e');
      // Don't block the UI, just log the error
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle, color: Colors.white),
              SizedBox(width: 8),
              Text('Settings saved'),
            ],
          ),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _loadAvailableAreas(String storeNumber) async {
    setState(() {
      _loadingAreas = true;
    });

    try {
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      final areas = await firestoreService.getAvailableAreas(storeNumber);

      setState(() {
        _availableAreas = areas;
        _loadingAreas = false;
      });
    } catch (e) {
      print('Error loading available areas: $e');
      setState(() {
        _loadingAreas = false;
      });
    }
  }

  Future<void> _saveAreaPreferences() async {
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      final user = authService.currentUser;

      if (user != null) {
        await firestoreService.updateUserField(user.uid, 'notificationAreas', _selectedAreas);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.white),
                  SizedBox(width: 8),
                  Text('Area preferences saved'),
                ],
              ),
              backgroundColor: Colors.green,
              duration: Duration(seconds: 2),
            ),
          );
        }
      }
    } catch (e) {
      print('Error saving area preferences: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white),
                const SizedBox(width: 8),
                Text('Error saving preferences: $e'),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  Future<void> _selectTime(String day, bool isStart) async {
    final currentTime = isStart ? _schedule[day]!.start : _schedule[day]!.end;

    final selectedTime = await showTimePicker(
      context: context,
      initialTime: currentTime,
    );

    if (selectedTime != null) {
      setState(() {
        if (isStart) {
          _schedule[day]!.start = selectedTime;
        } else {
          _schedule[day]!.end = selectedTime;
        }
      });
      _saveSettings();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Appearance Section
        const Text(
          'Appearance',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        _buildAppearanceSettings(),
        const SizedBox(height: 32),

        // Store Assignment Section
        const Text(
          'Store Assignment',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Update your store assignment if you transfer to a new location',
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey,
          ),
        ),
        const SizedBox(height: 16),
        _buildStoreSettings(),
        const SizedBox(height: 32),

        // Notifications Section
        const Text(
          'Notifications',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        _buildNotificationSettings(),
        const SizedBox(height: 32),

        // Area Preferences Section - DISABLED: Need to implement getAvailableAreas
        // const Text(
        //   'Notification Areas',
        //   style: TextStyle(
        //     fontSize: 20,
        //     fontWeight: FontWeight.bold,
        //   ),
        // ),
        // const SizedBox(height: 8),
        // const Text(
        //   'Select which store areas you want to receive notifications for. Leave all unchecked to receive notifications for all areas.',
        //   style: TextStyle(
        //     fontSize: 14,
        //     color: Colors.grey,
        //   ),
        // ),
        // const SizedBox(height: 16),
        // _buildAreaPreferences(),
        // const SizedBox(height: 32),

        // Work Schedule Section
        const Text(
          'Work Schedule',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Set your work hours to receive notifications only during your shifts',
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey,
          ),
        ),
        const SizedBox(height: 16),
        _buildScheduleSettings(),
      ],
    );
  }

  Widget _buildAppearanceSettings() {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, child) {
        return Card(
          child: Column(
            children: [
              SwitchListTile(
                title: const Text('Dark Mode'),
                subtitle: const Text('Use dark theme'),
                value: themeProvider.isDarkMode,
                secondary: Icon(
                  themeProvider.isDarkMode
                      ? Icons.dark_mode
                      : Icons.light_mode,
                ),
                onChanged: (value) {
                  themeProvider.toggleTheme();
                },
              ),
              const Divider(height: 1),
              ListTile(
                title: const Text('Theme Mode'),
                subtitle: Text(
                  themeProvider.themeMode == ThemeMode.system
                      ? 'System default'
                      : themeProvider.themeMode == ThemeMode.light
                          ? 'Light'
                          : 'Dark',
                ),
                trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                onTap: () {
                  _showThemeModeDialog(themeProvider);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _showThemeModeDialog(ThemeProvider themeProvider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Theme Mode'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<ThemeMode>(
              title: const Text('System Default'),
              subtitle: const Text('Follow system settings'),
              value: ThemeMode.system,
              groupValue: themeProvider.themeMode,
              onChanged: (value) {
                themeProvider.setThemeMode(value!);
                Navigator.pop(context);
              },
            ),
            RadioListTile<ThemeMode>(
              title: const Text('Light'),
              subtitle: const Text('Always use light theme'),
              value: ThemeMode.light,
              groupValue: themeProvider.themeMode,
              onChanged: (value) {
                themeProvider.setThemeMode(value!);
                Navigator.pop(context);
              },
            ),
            RadioListTile<ThemeMode>(
              title: const Text('Dark'),
              subtitle: const Text('Always use dark theme'),
              value: ThemeMode.dark,
              groupValue: themeProvider.themeMode,
              onChanged: (value) {
                themeProvider.setThemeMode(value!);
                Navigator.pop(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStoreSettings() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _storeNumberController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: 'Store Number',
                border: OutlineInputBorder(),
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _updateStoreNumber,
                icon: const Icon(Icons.save),
                label: const Text('Update Store'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _updateStoreNumber() async {
    final newStoreNumber = _storeNumberController.text.trim();

    if (newStoreNumber.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.error, color: Colors.white),
              SizedBox(width: 8),
              Text('Please enter a store number'),
            ],
          ),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    // Validate it's a number
    final storeNum = int.tryParse(newStoreNumber);
    if (storeNum == null || storeNum <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.error, color: Colors.white),
              SizedBox(width: 8),
              Text('Please enter a valid store number'),
            ],
          ),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      final user = authService.currentUser;

      if (user != null) {
        await firestoreService.updateUserField(user.uid, 'storeNumber', newStoreNumber);

        setState(() {
          _storeNumber = newStoreNumber;
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.white),
                  const SizedBox(width: 8),
                  Text('Store updated to $newStoreNumber'),
                ],
              ),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    } catch (e) {
      print('Error updating store number: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white),
                const SizedBox(width: 8),
                Text('Error updating store: $e'),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  Widget _buildAreaPreferences() {
    if (_loadingAreas) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Center(
            child: CircularProgressIndicator(),
          ),
        ),
      );
    }

    if (_availableAreas.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const Icon(Icons.info_outline, size: 48, color: Colors.grey),
              const SizedBox(height: 8),
              const Text(
                'No areas found',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 4),
              Text(
                _storeNumber.isEmpty
                    ? 'Set your store number to see available areas'
                    : 'No QR codes have been scanned at this store yet',
                style: const TextStyle(fontSize: 14, color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Column(
        children: [
          // Select All / Deselect All button
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      setState(() {
                        if (_selectedAreas.length == _availableAreas.length) {
                          _selectedAreas.clear();
                        } else {
                          _selectedAreas = List.from(_availableAreas);
                        }
                      });
                    },
                    icon: Icon(
                      _selectedAreas.length == _availableAreas.length
                          ? Icons.deselect
                          : Icons.select_all,
                    ),
                    label: Text(
                      _selectedAreas.length == _availableAreas.length
                          ? 'Deselect All'
                          : 'Select All',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  onPressed: _saveAreaPreferences,
                  icon: const Icon(Icons.save),
                  label: const Text('Save'),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          // Area checkboxes
          ..._availableAreas.map((area) {
            final isSelected = _selectedAreas.contains(area);
            return CheckboxListTile(
              title: Text(area),
              value: isSelected,
              onChanged: (value) {
                setState(() {
                  if (value == true) {
                    _selectedAreas.add(area);
                  } else {
                    _selectedAreas.remove(area);
                  }
                });
              },
            );
          }).toList(),
        ],
      ),
    );
  }

  Widget _buildNotificationSettings() {
    return Card(
      child: Column(
        children: [
          SwitchListTile(
            title: const Text('Enable Notifications'),
            subtitle: const Text('Receive customer assistance requests'),
            value: _notificationsEnabled,
            onChanged: (value) {
              setState(() => _notificationsEnabled = value);
              _saveSettings();
            },
          ),
          const Divider(height: 1),
          SwitchListTile(
            title: const Text('Sound'),
            subtitle: const Text('Play notification sound'),
            value: _soundEnabled,
            onChanged: _notificationsEnabled
                ? (value) {
                    setState(() => _soundEnabled = value);
                    _saveSettings();
                  }
                : null,
          ),
          const Divider(height: 1),
          SwitchListTile(
            title: const Text('Vibration'),
            subtitle: const Text('Vibrate on notification'),
            value: _vibrationEnabled,
            onChanged: _notificationsEnabled
                ? (value) {
                    setState(() => _vibrationEnabled = value);
                    _saveSettings();
                  }
                : null,
          ),
        ],
      ),
    );
  }

  Widget _buildScheduleSettings() {
    return Card(
      child: Column(
        children: _schedule.entries.map((entry) {
          final day = entry.key;
          final range = entry.value;

          return Column(
            children: [
              ListTile(
                title: Text(
                  day,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                trailing: Switch(
                  value: range.enabled,
                  onChanged: (value) {
                    setState(() => range.enabled = value);
                    _saveSettings();
                  },
                ),
              ),
              if (range.enabled)
                Padding(
                  padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _selectTime(day, true),
                          child: Text(
                            '${range.start.format(context)}',
                            style: const TextStyle(fontSize: 16),
                          ),
                        ),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 8),
                        child: Text('to', style: TextStyle(fontSize: 16)),
                      ),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _selectTime(day, false),
                          child: Text(
                            '${range.end.format(context)}',
                            style: const TextStyle(fontSize: 16),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (day != 'Sunday') const Divider(height: 1),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class TimeRange {
  bool enabled;
  TimeOfDay start;
  TimeOfDay end;

  TimeRange({
    this.enabled = false,
    this.start = const TimeOfDay(hour: 9, minute: 0),
    this.end = const TimeOfDay(hour: 17, minute: 0),
  });
}
