import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/user_model.dart';
import 'edit_user_screen.dart';

enum SearchFilter { store, email, name }

class UserManagementTab extends StatefulWidget {
  const UserManagementTab({super.key});

  @override
  State<UserManagementTab> createState() => _UserManagementTabState();
}

class _UserManagementTabState extends State<UserManagementTab> {
  SearchFilter _selectedFilter = SearchFilter.store;
  final TextEditingController _searchController = TextEditingController();
  List<UserModel> _searchResults = [];
  bool _loading = false;
  String? _errorMessage;
  bool _hasSearched = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _performSearch() async {
    if (_searchController.text.trim().isEmpty) {
      setState(() {
        _errorMessage = 'Please enter a search term';
      });
      return;
    }

    setState(() {
      _loading = true;
      _errorMessage = null;
      _searchResults = [];
      _hasSearched = true;
    });

    try {
      final searchTerm = _searchController.text.trim();
      QuerySnapshot querySnapshot;

      switch (_selectedFilter) {
        case SearchFilter.store:
          // Search by store number
          querySnapshot = await FirebaseFirestore.instance
              .collection('users')
              .where('storeNumber', isEqualTo: searchTerm)
              .get();
          break;

        case SearchFilter.email:
          // Search by email (partial match using lowercase)
          querySnapshot = await FirebaseFirestore.instance
              .collection('users')
              .where('email', isGreaterThanOrEqualTo: searchTerm.toLowerCase())
              .where('email', isLessThanOrEqualTo: '${searchTerm.toLowerCase()}\uf8ff')
              .get();
          break;

        case SearchFilter.name:
          // Search by full name (partial match using lowercase)
          final lowerSearch = searchTerm.toLowerCase();
          final allUsers = await FirebaseFirestore.instance
              .collection('users')
              .get();

          querySnapshot = allUsers;
          // Filter manually for name search
          final filtered = allUsers.docs.where((doc) {
            final data = doc.data() as Map<String, dynamic>;
            final fullName = (data['fullName'] ?? '').toString().toLowerCase();
            final firstName = (data['firstName'] ?? '').toString().toLowerCase();
            final lastName = (data['lastName'] ?? '').toString().toLowerCase();
            return fullName.contains(lowerSearch) ||
                   firstName.contains(lowerSearch) ||
                   lastName.contains(lowerSearch);
          }).toList();

          querySnapshot = _MockQuerySnapshot(filtered);
          break;
      }

      final users = querySnapshot.docs
          .map((doc) {
            try {
              final data = doc.data() as Map<String, dynamic>;

              // Handle storeNumber which can be string or number
              final storeNumber = data['storeNumber'];
              final storeNumberString = storeNumber?.toString() ?? '';

              return UserModel(
                userId: doc.id,
                email: data['email'] ?? '',
                firstName: data['firstName'] ?? '',
                lastName: data['lastName'] ?? '',
                storeNumber: storeNumberString,
                homeStore: data['homeStore'],
                allowedStores: (data['allowedStores'] as List?)
                    ?.map((e) => e.toString())
                    .toList() ?? [],
                jobTitle: data['jobTitle'] ?? '',
                approved: data['approved'] ?? true,
              );
            } catch (e) {
              print('Error parsing user document ${doc.id}: $e');
              return null;
            }
          })
          .whereType<UserModel>()
          .toList();

      setState(() {
        _searchResults = users;
        _loading = false;
        if (users.isEmpty) {
          _errorMessage = 'No users found';
        }
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _errorMessage = 'Search failed: $e';
      });
      print('Search error: $e');
    }
  }

  Future<void> _editUser(UserModel user) async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => EditUserScreen(userToEdit: user),
      ),
    );

    // Refresh search results if user was updated
    if (result == true) {
      _performSearch();
    }
  }

  void _clearSearch() {
    setState(() {
      _searchController.clear();
      _searchResults = [];
      _errorMessage = null;
      _hasSearched = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Search Header
        Container(
          padding: const EdgeInsets.all(16),
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'User Management',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Search and edit user profiles',
                style: TextStyle(fontSize: 14),
              ),
              const SizedBox(height: 16),

              // Filter Chips
              Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(
                    label: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.store, size: 16),
                        SizedBox(width: 4),
                        Text('Store'),
                      ],
                    ),
                    selected: _selectedFilter == SearchFilter.store,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() {
                          _selectedFilter = SearchFilter.store;
                          _clearSearch();
                        });
                      }
                    },
                  ),
                  ChoiceChip(
                    label: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.email, size: 16),
                        SizedBox(width: 4),
                        Text('Email'),
                      ],
                    ),
                    selected: _selectedFilter == SearchFilter.email,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() {
                          _selectedFilter = SearchFilter.email;
                          _clearSearch();
                        });
                      }
                    },
                  ),
                  ChoiceChip(
                    label: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.person, size: 16),
                        SizedBox(width: 4),
                        Text('Name'),
                      ],
                    ),
                    selected: _selectedFilter == SearchFilter.name,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() {
                          _selectedFilter = SearchFilter.name;
                          _clearSearch();
                        });
                      }
                    },
                  ),
                ],
              ),

              const SizedBox(height: 12),

              // Search Bar
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      decoration: InputDecoration(
                        hintText: _getSearchHint(),
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _searchController.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: _clearSearch,
                              )
                            : null,
                        border: const OutlineInputBorder(),
                        filled: true,
                        fillColor: Colors.white,
                      ),
                      onSubmitted: (_) => _performSearch(),
                      keyboardType: _selectedFilter == SearchFilter.store
                          ? TextInputType.number
                          : TextInputType.text,
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: _loading ? null : _performSearch,
                    icon: _loading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.search),
                    label: const Text('Search'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 16,
                      ),
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Search Results
        Expanded(
          child: _buildSearchResults(),
        ),
      ],
    );
  }

  String _getSearchHint() {
    switch (_selectedFilter) {
      case SearchFilter.store:
        return 'Enter store number (e.g., 1458)';
      case SearchFilter.email:
        return 'Enter email address';
      case SearchFilter.name:
        return 'Enter first or last name';
    }
  }

  Widget _buildSearchResults() {
    if (!_hasSearched) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.search,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            const Text(
              'Search for Users',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                'Select a filter and enter a search term to find users',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.grey[600],
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_loading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Searching...'),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.error_outline,
                size: 64,
                color: _searchResults.isEmpty ? Colors.orange : Colors.red,
              ),
              const SizedBox(height: 16),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _clearSearch,
                icon: const Icon(Icons.refresh),
                label: const Text('Clear Search'),
              ),
            ],
          ),
        ),
      );
    }

    if (_searchResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.inbox,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            const Text(
              'No Users Found',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Try a different search term',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    // Group results by store
    final Map<String, List<UserModel>> usersByStore = {};
    for (final user in _searchResults) {
      final storeNum = user.storeNumberString;
      if (!usersByStore.containsKey(storeNum)) {
        usersByStore[storeNum] = [];
      }
      usersByStore[storeNum]!.add(user);
    }

    final sortedStores = usersByStore.keys.toList()..sort();

    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: sortedStores.length,
      itemBuilder: (context, index) {
        final storeNum = sortedStores[index];
        final storeUsers = usersByStore[storeNum]!;

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Store Header
              Container(
                padding: const EdgeInsets.all(12),
                color: Theme.of(context).colorScheme.secondaryContainer,
                child: Row(
                  children: [
                    Icon(
                      Icons.store,
                      color: Theme.of(context).colorScheme.secondary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Store $storeNum',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.blue[600],
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${storeUsers.length} user${storeUsers.length != 1 ? 's' : ''}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // User List
              ...storeUsers.map((user) => ListTile(
                    leading: CircleAvatar(
                      backgroundColor: user.approved
                          ? Colors.blue[600]
                          : Colors.grey[400],
                      child: Text(
                        user.firstName.isNotEmpty
                            ? user.firstName[0].toUpperCase()
                            : '?',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    title: Text(
                      user.fullName,
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.email),
                        if (user.jobTitle.isNotEmpty)
                          Text(
                            user.jobTitle,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!user.approved)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.orange[700],
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text(
                              'Pending',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        const SizedBox(width: 8),
                        Icon(
                          Icons.edit,
                          color: Colors.blue[600],
                        ),
                      ],
                    ),
                    onTap: () => _editUser(user),
                  )),
            ],
          ),
        );
      },
    );
  }
}

// Mock QuerySnapshot for manual filtering
class _MockQuerySnapshot extends QuerySnapshot<Map<String, dynamic>> {
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> _docs;

  _MockQuerySnapshot(this._docs);

  @override
  List<QueryDocumentSnapshot<Map<String, dynamic>>> get docs => _docs;

  @override
  List<DocumentChange<Map<String, dynamic>>> get docChanges => [];

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  int get size => _docs.length;
}
