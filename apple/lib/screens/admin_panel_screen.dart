import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import 'user_management_tab.dart';

class AdminPanelScreen extends StatelessWidget {
  const AdminPanelScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Admin Panel'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Active', icon: Icon(Icons.people)),
              Tab(text: 'All Users', icon: Icon(Icons.supervisor_account)),
              Tab(text: 'Manage', icon: Icon(Icons.edit)),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            ActiveAssociatesTab(),
            AllUsersTab(),
            UserManagementTab(),
          ],
        ),
      ),
    );
  }
}

class ActiveAssociatesTab extends StatefulWidget {
  const ActiveAssociatesTab({super.key});

  @override
  State<ActiveAssociatesTab> createState() => _ActiveAssociatesTabState();
}

class _ActiveAssociatesTabState extends State<ActiveAssociatesTab> {
  @override
  Widget build(BuildContext context) {
    final authService = Provider.of<AuthService>(context, listen: false);
    final firestoreService = Provider.of<FirestoreService>(context, listen: false);

    return FutureBuilder<UserModel?>(
      future: authService.getUserProfile(authService.currentUser!.uid),
      builder: (context, userSnapshot) {
        if (userSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final currentUser = userSnapshot.data;
        if (currentUser == null) {
          return const Center(child: Text('Error loading user profile'));
        }

        return FutureBuilder<List<UserModel>>(
          future: currentUser.isAdmin
              ? firestoreService.getAllUsers()
              : firestoreService.getUsersByStore(currentUser.storeNumberString),
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

        final allUsers = snapshot.data ?? [];
        final activeUsers = allUsers.where((user) => user.isOnShift).toList();

        if (activeUsers.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.person_off_outlined,
                    size: 64,
                    color: Colors.grey[400],
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No Active Associates',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'No associates are currently on shift',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          );
        }

        // Group users by store
        final Map<String, List<UserModel>> usersByStore = {};
        for (final user in activeUsers) {
          final storeNum = user.storeNumberString;
          if (!usersByStore.containsKey(storeNum)) {
            usersByStore[storeNum] = [];
          }
          usersByStore[storeNum]!.add(user);
        }

        // Sort stores
        final sortedStores = usersByStore.keys.toList()..sort();

        return RefreshIndicator(
          onRefresh: () async {
            setState(() {});
            await Future.delayed(const Duration(milliseconds: 500));
          },
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: sortedStores.length,
            itemBuilder: (context, index) {
              final storeNum = sortedStores[index];
              final users = usersByStore[storeNum]!;

              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      color: Theme.of(context).colorScheme.primaryContainer,
                      child: Row(
                        children: [
                          Icon(
                            Icons.store,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Store $storeNum',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.green[600],
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              '${users.length} active',
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
                    ...users.map((user) => ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Colors.green[600],
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
                              Text(user.jobTitle.isNotEmpty
                                  ? user.jobTitle
                                  : 'Associate'),
                              if (user.shiftEndTime != null)
                                Text(
                                  'Shift ends: ${user.shiftEndTime}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[600],
                                  ),
                                ),
                            ],
                          ),
                          trailing: Icon(
                            Icons.check_circle,
                            color: Colors.green[600],
                          ),
                        )),
                  ],
                ),
              );
            },
          ),
        );
          },
        );
      },
    );
  }
}

class AllUsersTab extends StatefulWidget {
  const AllUsersTab({super.key});

  @override
  State<AllUsersTab> createState() => _AllUsersTabState();
}

class _AllUsersTabState extends State<AllUsersTab> {
  @override
  Widget build(BuildContext context) {
    final authService = Provider.of<AuthService>(context, listen: false);
    final firestoreService = Provider.of<FirestoreService>(context, listen: false);

    return FutureBuilder<UserModel?>(
      future: authService.getUserProfile(authService.currentUser!.uid),
      builder: (context, userSnapshot) {
        if (userSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final currentUser = userSnapshot.data;
        if (currentUser == null) {
          return const Center(child: Text('Error loading user profile'));
        }

        return FutureBuilder<List<UserModel>>(
          future: currentUser.isAdmin
              ? firestoreService.getAllUsers()
              : firestoreService.getUsersByStore(currentUser.storeNumberString),
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

        final users = snapshot.data ?? [];

        if (users.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.people_outline, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    'No Users Found',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        // Group users by store
        final Map<String, List<UserModel>> usersByStore = {};
        for (final user in users) {
          final storeNum = user.storeNumberString;
          if (!usersByStore.containsKey(storeNum)) {
            usersByStore[storeNum] = [];
          }
          usersByStore[storeNum]!.add(user);
        }

        // Sort stores
        final sortedStores = usersByStore.keys.toList()..sort();

        return RefreshIndicator(
          onRefresh: () async {
            setState(() {});
            await Future.delayed(const Duration(milliseconds: 500));
          },
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: sortedStores.length,
            itemBuilder: (context, index) {
              final storeNum = sortedStores[index];
              final storeUsers = usersByStore[storeNum]!;
              final activeCount =
                  storeUsers.where((u) => u.isOnShift).length;

              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
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
                          Text(
                            '$activeCount/${storeUsers.length} active',
                            style: TextStyle(
                              color: Colors.grey[700],
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    ...storeUsers.map((user) => ListTile(
                          leading: CircleAvatar(
                            backgroundColor: user.isOnShift
                                ? Colors.green[600]
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
                              Text(user.jobTitle.isNotEmpty
                                  ? user.jobTitle
                                  : 'Associate'),
                              Text(
                                user.email,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey[600],
                                ),
                              ),
                            ],
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: user.isOnShift
                                  ? Colors.green[600]
                                  : Colors.grey[400],
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              user.isOnShift ? 'On Shift' : 'Off Shift',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        )),
                  ],
                ),
              );
            },
          ),
        );
          },
        );
      },
    );
  }
}
