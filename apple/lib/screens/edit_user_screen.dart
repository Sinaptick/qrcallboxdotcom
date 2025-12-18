import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/user_model.dart';

class EditUserScreen extends StatefulWidget {
  final UserModel userToEdit;

  const EditUserScreen({
    super.key,
    required this.userToEdit,
  });

  @override
  State<EditUserScreen> createState() => _EditUserScreenState();
}

class _EditUserScreenState extends State<EditUserScreen> {
  late TextEditingController _firstNameController;
  late TextEditingController _lastNameController;
  late TextEditingController _emailController;
  late TextEditingController _storeNumberController;
  late TextEditingController _homeStoreController;
  late TextEditingController _allowedStoresController;
  late TextEditingController _jobTitleController;
  late TextEditingController _phoneController;

  bool _approved = true;
  bool _notificationsEnabled = true;
  bool _respectDoNotDisturb = true;
  bool _loading = false;

  @override
  void initState() {
    super.initState();

    _firstNameController = TextEditingController(text: widget.userToEdit.firstName);
    _lastNameController = TextEditingController(text: widget.userToEdit.lastName);
    _emailController = TextEditingController(text: widget.userToEdit.email);
    _storeNumberController = TextEditingController(text: widget.userToEdit.storeNumberString);
    _homeStoreController = TextEditingController(text: widget.userToEdit.homeStore?.toString() ?? '');
    _allowedStoresController = TextEditingController(text: widget.userToEdit.allowedStores?.join(', ') ?? '');
    _jobTitleController = TextEditingController(text: widget.userToEdit.jobTitle);
    _phoneController = TextEditingController(text: '');

    _loadUserDetails();
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _storeNumberController.dispose();
    _homeStoreController.dispose();
    _allowedStoresController.dispose();
    _jobTitleController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadUserDetails() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userToEdit.userId)
          .get();

      if (doc.exists) {
        final data = doc.data()!;
        setState(() {
          _approved = data['approved'] ?? true;
          _notificationsEnabled = data['notificationsEnabled'] ?? true;
          _respectDoNotDisturb = data['respectDoNotDisturb'] ?? true;

          if (data['phone'] != null) {
            _phoneController.text = data['phone'];
          }
        });
      }
    } catch (e) {
      print('Error loading user details: $e');
    }
  }

  Future<void> _saveChanges() async {
    // Validate required fields
    if (_firstNameController.text.trim().isEmpty ||
        _lastNameController.text.trim().isEmpty ||
        _emailController.text.trim().isEmpty ||
        _storeNumberController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please fill in all required fields'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _loading = true);

    try {
      // Parse allowed stores from comma-separated string
      final allowedStoresList = _allowedStoresController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      // Prepare update data
      final updates = {
        'firstName': _firstNameController.text.trim(),
        'lastName': _lastNameController.text.trim(),
        'fullName': '${_firstNameController.text.trim()} ${_lastNameController.text.trim()}',
        'email': _emailController.text.trim(),
        'storeNumber': _storeNumberController.text.trim(),
        'homeStore': _homeStoreController.text.trim().isNotEmpty
            ? _homeStoreController.text.trim()
            : _storeNumberController.text.trim(),
        'allowedStores': allowedStoresList.isNotEmpty
            ? allowedStoresList
            : [_storeNumberController.text.trim()],
        'jobTitle': _jobTitleController.text.trim(),
        'phone': _phoneController.text.trim(),
        'approved': _approved,
        'notificationsEnabled': _notificationsEnabled,
        'respectDoNotDisturb': _respectDoNotDisturb,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      // Update via API (for admin authentication)
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (token == null) {
        throw Exception('Not authenticated');
      }

      final response = await _updateUserViaAPI(token, updates);

      if (response) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('User updated successfully'),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.of(context).pop(true); // Return true to indicate success
        }
      } else {
        throw Exception('Failed to update user');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<bool> _updateUserViaAPI(String token, Map<String, dynamic> updates) async {
    try {
      // Use Cloud Function API endpoint
      final response = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userToEdit.userId)
          .update(updates);

      return true;
    } catch (e) {
      print('Error updating user: $e');
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit User'),
        actions: [
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16.0),
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else
            TextButton.icon(
              onPressed: _saveChanges,
              icon: const Icon(Icons.save, color: Colors.white),
              label: const Text(
                'Save',
                style: TextStyle(color: Colors.white),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Basic Information Section
          _buildSectionHeader('Basic Information'),
          _buildTextField(
            controller: _firstNameController,
            label: 'First Name',
            icon: Icons.person,
            required: true,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _lastNameController,
            label: 'Last Name',
            icon: Icons.person_outline,
            required: true,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _emailController,
            label: 'Email',
            icon: Icons.email,
            required: true,
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _phoneController,
            label: 'Phone',
            icon: Icons.phone,
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _jobTitleController,
            label: 'Job Title',
            icon: Icons.work,
          ),

          const SizedBox(height: 24),

          // Store Assignment Section
          _buildSectionHeader('Store Assignment'),
          _buildTextField(
            controller: _storeNumberController,
            label: 'Store Number',
            icon: Icons.store,
            required: true,
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _homeStoreController,
            label: 'Home Store',
            icon: Icons.home_work,
            keyboardType: TextInputType.number,
            helperText: 'Optional: Defaults to Store Number',
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _allowedStoresController,
            label: 'Allowed Stores',
            icon: Icons.storefront,
            helperText: 'Comma-separated list (e.g., 1234, 5678, 9012)',
            maxLines: 2,
          ),

          const SizedBox(height: 24),

          // Account Settings Section
          _buildSectionHeader('Account Settings'),
          Card(
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Account Approved'),
                  subtitle: const Text('User can access the system'),
                  value: _approved,
                  onChanged: (value) => setState(() => _approved = value),
                  secondary: Icon(
                    _approved ? Icons.check_circle : Icons.cancel,
                    color: _approved ? Colors.green : Colors.red,
                  ),
                ),
                const Divider(height: 1),
                SwitchListTile(
                  title: const Text('Notifications Enabled'),
                  subtitle: const Text('User receives push notifications'),
                  value: _notificationsEnabled,
                  onChanged: (value) => setState(() => _notificationsEnabled = value),
                  secondary: Icon(
                    Icons.notifications,
                    color: _notificationsEnabled ? Colors.blue : Colors.grey,
                  ),
                ),
                const Divider(height: 1),
                SwitchListTile(
                  title: const Text('Respect Do Not Disturb'),
                  subtitle: const Text('Honor device DND settings'),
                  value: _respectDoNotDisturb,
                  onChanged: (value) => setState(() => _respectDoNotDisturb = value),
                  secondary: Icon(
                    Icons.do_not_disturb,
                    color: _respectDoNotDisturb ? Colors.orange : Colors.grey,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),

          // Save Button
          ElevatedButton.icon(
            onPressed: _loading ? null : _saveChanges,
            icon: const Icon(Icons.save),
            label: Text(_loading ? 'Saving...' : 'Save Changes'),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
            ),
          ),

          const SizedBox(height: 16),

          // Cancel Button
          OutlinedButton.icon(
            onPressed: _loading ? null : () => Navigator.of(context).pop(),
            icon: const Icon(Icons.cancel),
            label: const Text('Cancel'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    bool required = false,
    TextInputType? keyboardType,
    String? helperText,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: required ? '$label *' : label,
        helperText: helperText,
        helperMaxLines: 2,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
        filled: true,
      ),
      keyboardType: keyboardType,
      maxLines: maxLines,
    );
  }
}
