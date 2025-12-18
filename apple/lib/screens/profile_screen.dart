import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/fcm_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  UserModel? _userProfile;
  String? _fcmToken;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadFCMToken();
  }

  Future<void> _loadProfile() async {
    final authService = Provider.of<AuthService>(context, listen: false);
    final user = authService.currentUser;

    if (user != null) {
      final profile = await authService.getUserProfile(user.uid);
      if (mounted) {
        setState(() {
          _userProfile = profile;
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _loadFCMToken() async {
    final fcmService = Provider.of<FCMService>(context, listen: false);
    final token = await fcmService.getToken();
    if (mounted) {
      setState(() {
        _fcmToken = token;
      });
    }
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label copied to clipboard'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_userProfile == null) {
      return const Center(
        child: Text('Failed to load profile'),
      );
    }

    final user = _userProfile!;
    final authService = Provider.of<AuthService>(context, listen: false);
    final firebaseUser = authService.currentUser;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Profile Header
        Center(
          child: Column(
            children: [
              CircleAvatar(
                radius: 50,
                backgroundColor: Theme.of(context).colorScheme.primary,
                backgroundImage: firebaseUser?.photoURL != null
                    ? NetworkImage(firebaseUser!.photoURL!)
                    : null,
                child: firebaseUser?.photoURL == null
                    ? Text(
                        user.firstName.isNotEmpty
                            ? user.firstName[0].toUpperCase()
                            : 'U',
                        style: const TextStyle(
                          fontSize: 36,
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      )
                    : null,
              ),
              const SizedBox(height: 16),
              Text(
                user.fullName,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                user.email,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
              ),
              if (user.isAdmin)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Chip(
                    label: const Text('Administrator'),
                    avatar: const Icon(Icons.admin_panel_settings, size: 16),
                    backgroundColor: Colors.orange.shade100,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 32),

        // Profile Information
        const Text(
          'Profile Information',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Column(
            children: [
              _buildInfoTile(
                icon: Icons.badge,
                title: 'Job Title',
                value: user.jobTitle.isNotEmpty ? user.jobTitle : 'Not set',
              ),
              const Divider(height: 1),
              _buildInfoTile(
                icon: Icons.store,
                title: 'Store Number',
                value: user.storeNumberString.isNotEmpty
                    ? user.storeNumberString
                    : 'Not assigned',
              ),
              const Divider(height: 1),
              _buildInfoTile(
                icon: Icons.business,
                title: 'Access Level',
                value: user.access ?? 'store',
              ),
              if (user.homeStore != null) ...[
                const Divider(height: 1),
                _buildInfoTile(
                  icon: Icons.home_work,
                  title: 'Home Store',
                  value: user.homeStore.toString(),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 32),

        // System Information
        const Text(
          'System Information',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Column(
            children: [
              _buildInfoTile(
                icon: Icons.fingerprint,
                title: 'User ID',
                value: user.userId,
                onTap: () => _copyToClipboard(user.userId, 'User ID'),
                trailing: const Icon(Icons.copy, size: 18),
              ),
              const Divider(height: 1),
              _buildInfoTile(
                icon: Icons.notifications,
                title: 'FCM Token',
                value: _fcmToken ?? 'Loading...',
                subtitle: 'Tap to copy',
                onTap: _fcmToken != null
                    ? () => _copyToClipboard(_fcmToken!, 'FCM Token')
                    : null,
                trailing: _fcmToken != null
                    ? const Icon(Icons.copy, size: 18)
                    : null,
              ),
              const Divider(height: 1),
              _buildInfoTile(
                icon: Icons.info_outline,
                title: 'App Version',
                value: '1.7.28 (Build 43)',
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),

        // Debug Information (only for admins)
        if (user.isAdmin) ...[
          const Text(
            'Debug Information',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Raw User Data',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    user.toMap().toString(),
                    style: const TextStyle(
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildInfoTile({
    required IconData icon,
    required String title,
    required String value,
    String? subtitle,
    VoidCallback? onTap,
    Widget? trailing,
  }) {
    return ListTile(
      leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
      title: Text(title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.white.withOpacity(0.9)
                  : Colors.black87,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
          ],
        ],
      ),
      trailing: trailing,
      onTap: onTap,
    );
  }
}
