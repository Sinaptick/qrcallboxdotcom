import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import '../models/user_model.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  List<ResponderStats> _leaderboard = [];
  bool _isLoading = true;
  String _selectedPeriod = 'daily';
  bool _showHelp = false;
  UserModel? _currentUser;
  String? _selectedStore;
  List<String> _availableStores = [];

  @override
  void initState() {
    super.initState();
    _loadCurrentUser();
  }

  Future<void> _loadCurrentUser() async {
    try {
      final uid = _auth.currentUser?.uid;
      if (uid == null) return;

      final doc = await _firestore.collection('users').doc(uid).get();
      if (doc.exists) {
        final data = doc.data()!;

        // Handle storeNumber which can be string or number
        final storeNumber = data['storeNumber'];
        final storeNumberString = storeNumber?.toString() ?? '';

        _currentUser = UserModel(
          userId: uid,
          email: data['email'] ?? '',
          firstName: data['firstName'] ?? '',
          lastName: data['lastName'] ?? '',
          storeNumber: storeNumberString,
          homeStore: data['homeStore'],
          allowedStores: (data['allowedStores'] as List?)
              ?.map((e) => e.toString())
              .toList() ?? [],
          jobTitle: data['jobTitle'] ?? '',
          approved: data['approved'] ?? false,
        );

        // Set selected store to user's store
        _selectedStore = _currentUser!.storeNumberString;

        // If admin, load available stores
        if (_currentUser!.isAdmin) {
          await _loadAvailableStores();
        }

        // Load leaderboard for selected store
        _loadLeaderboard();
      }
    } catch (e) {
      print('Error loading current user: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadAvailableStores() async {
    try {
      // Get all unique store numbers from users collection
      final usersSnapshot = await _firestore.collection('users').get();
      final stores = usersSnapshot.docs
          .map((doc) {
            final storeNumber = doc.data()['storeNumber'];
            return storeNumber?.toString() ?? '';
          })
          .where((s) => s.isNotEmpty)
          .toSet()
          .toList()
        ..sort();

      setState(() {
        _availableStores = stores;
      });
    } catch (e) {
      print('Error loading available stores: $e');
    }
  }

  Future<void> _loadLeaderboard() async {
    if (_selectedStore == null || _selectedStore!.isEmpty) {
      setState(() => _isLoading = false);
      return;
    }

    setState(() => _isLoading = true);

    try {
      // Calculate date range
      final now = DateTime.now();
      DateTime startDate;

      switch (_selectedPeriod) {
        case 'daily':
          startDate = DateTime(now.year, now.month, now.day);
          break;
        case 'weekly':
          final dayOfWeek = now.weekday;
          startDate = now.subtract(Duration(days: dayOfWeek - 1));
          startDate = DateTime(startDate.year, startDate.month, startDate.day);
          break;
        case 'monthly':
          startDate = DateTime(now.year, now.month, 1);
          break;
        default:
          startDate = DateTime(now.year, now.month, now.day);
      }

      // Query scans for selected store only
      final querySnapshot = await _firestore
          .collection('scans')
          .where('storeNumber', isEqualTo: _selectedStore)
          .where('timestamp', isGreaterThan: Timestamp.fromDate(startDate))
          .orderBy('timestamp', descending: true)
          .limit(500)
          .get();

      // Aggregate stats by responder
      final Map<String, ResponderStats> responderMap = {};

      for (final doc in querySnapshot.docs) {
        final data = doc.data();
        final scanTimestamp = (data['timestamp'] as Timestamp?)?.toDate();
        if (scanTimestamp == null) continue;

        // Process claimed assists (in-app assists)
        final claimedByName = data['claimedByName'] as String?;
        if (claimedByName != null && claimedByName.isNotEmpty) {
          final claimedAt = (data['claimedAt'] as Timestamp?)?.toDate();
          if (claimedAt != null) {
            // Filter by business hours (6 AM - 11 PM)
            final hour = claimedAt.hour;
            if (hour >= 6 && hour <= 22) {
              if (!responderMap.containsKey(claimedByName)) {
                responderMap[claimedByName] = ResponderStats(
                  name: claimedByName,
                  assists: 0,
                  ignores: 0,
                  timeouts: 0,
                  totalResponseTime: 0,
                  fastestResponse: double.infinity,
                  slowestResponse: 0,
                  responseTimes: [],
                );
              }

              final stats = responderMap[claimedByName]!;
              final responseTimeMs = claimedAt.difference(scanTimestamp).inMilliseconds;
              final responseTimeSeconds = responseTimeMs ~/ 1000;

              stats.assists++;
              stats.responseTimes.add(responseTimeMs);
              stats.totalResponseTime += responseTimeSeconds;
              stats.fastestResponse = stats.fastestResponse < responseTimeSeconds
                  ? stats.fastestResponse
                  : responseTimeSeconds.toDouble();
              stats.slowestResponse = stats.slowestResponse > responseTimeSeconds
                  ? stats.slowestResponse
                  : responseTimeSeconds.toDouble();
            }
          }
        }

        // Process responses array (notification button interactions)
        final responses = data['responses'] as List<dynamic>?;
        if (responses != null) {
          for (final response in responses) {
            final responseMap = response as Map<String, dynamic>?;
            if (responseMap == null) continue;

            final userName = responseMap['userName'] as String?;
            if (userName == null || userName.isEmpty) continue;

            final responseTimestamp = (responseMap['timestamp'] as Timestamp?)?.toDate();
            if (responseTimestamp == null) continue;

            // Filter by business hours
            final hour = responseTimestamp.hour;
            if (hour < 6 || hour > 22) continue;

            if (!responderMap.containsKey(userName)) {
              responderMap[userName] = ResponderStats(
                name: userName,
                assists: 0,
                ignores: 0,
                timeouts: 0,
                totalResponseTime: 0,
                fastestResponse: double.infinity,
                slowestResponse: 0,
                responseTimes: [],
              );
            }

            final stats = responderMap[userName]!;
            final action = responseMap['action'] as String?;

            if (action == 'assist') {
              final responseTimeMs = responseMap['responseTime'] as int? ??
                  responseTimestamp.difference(scanTimestamp).inMilliseconds;
              final responseTimeSeconds = responseTimeMs ~/ 1000;

              stats.assists++;
              stats.responseTimes.add(responseTimeMs);
              stats.totalResponseTime += responseTimeSeconds;
              stats.fastestResponse = stats.fastestResponse < responseTimeSeconds
                  ? stats.fastestResponse
                  : responseTimeSeconds.toDouble();
              stats.slowestResponse = stats.slowestResponse > responseTimeSeconds
                  ? stats.slowestResponse
                  : responseTimeSeconds.toDouble();
            } else if (action == 'ignore') {
              // Separate manual ignores from timeouts
              final source = responseMap['source'] as String?;
              if (source == 'timeout') {
                stats.timeouts++;
              } else {
                stats.ignores++;
              }
            }
          }
        }
      }

      // Sort by weighted score
      final sortedList = responderMap.values.toList()
        ..sort((a, b) => b.weightedScore.compareTo(a.weightedScore));

      setState(() {
        _leaderboard = sortedList.take(10).toList();
        _isLoading = false;
      });
    } catch (e) {
      print('Error loading leaderboard: $e');
      setState(() => _isLoading = false);
    }
  }

  String _getRankEmoji(int index) {
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    return index < emojis.length ? emojis[index] : '${index + 1}';
  }

  String _formatTime(double seconds) {
    final mins = seconds ~/ 60;
    final secs = (seconds % 60).round();
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  String _getPeriodLabel() {
    switch (_selectedPeriod) {
      case 'daily':
        return 'Today';
      case 'weekly':
        return 'This Week';
      case 'monthly':
        return 'This Month';
      default:
        return 'Today';
    }
  }

  void _showHelpDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('🏆 How Rankings Work'),
        content: const SingleChildScrollView(
          child: Text(
            'Your score is based on:\n\n'
            '✅ Assists: +100 pts each\n\n'
            '⚡ Speed Bonus: Up to +25 pts\n'
            '  • <30s: +25  • 30-60s: +15\n'
            '  • 1-2min: +10  • 2-3min: +5\n'
            '  • 3-5min: 0  • >5min: -10\n\n'
            '❌ Manual Ignore: -5 pts\n'
            '  (you clicked "ignore")\n\n'
            '⏱️ Timeout: -50 pts\n'
            '  (no response for 15 minutes)\n\n'
            'Respond quickly to rank higher! 🚀',
            style: TextStyle(fontSize: 14),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('🏆 Leaderboard'),
        actions: [
          IconButton(
            icon: Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: Colors.blue[700],
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text(
                  '?',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
            onPressed: _showHelpDialog,
            tooltip: 'How rankings work',
          ),
        ],
      ),
      body: Column(
        children: [
          // Period and Store selector
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              border: Border(
                bottom: BorderSide(
                  color: Theme.of(context).dividerColor,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Store $_selectedStore',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_getPeriodLabel()} • Business Hours Only',
                            style: TextStyle(
                              fontSize: 13,
                              color: Theme.of(context).colorScheme.onPrimaryContainer.withOpacity(0.8),
                            ),
                          ),
                        ],
                      ),
                    ),
                    DropdownButton<String>(
                      value: _selectedPeriod,
                      items: const [
                        DropdownMenuItem(value: 'daily', child: Text('Daily')),
                        DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                        DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                      ],
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _selectedPeriod = value);
                          _loadLeaderboard();
                        }
                      },
                    ),
                  ],
                ),
                // Admin store selector
                if (_currentUser?.isAdmin == true && _availableStores.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      children: [
                        const Icon(Icons.store, size: 16),
                        const SizedBox(width: 8),
                        const Text('View Store:', style: TextStyle(fontSize: 14)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: DropdownButton<String>(
                            value: _selectedStore,
                            isExpanded: true,
                            items: _availableStores.map((store) {
                              return DropdownMenuItem(
                                value: store,
                                child: Text('Store $store'),
                              );
                            }).toList(),
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => _selectedStore = value);
                                _loadLeaderboard();
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          // Leaderboard list
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _leaderboard.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24.0),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.emoji_events_outlined,
                                size: 64,
                                color: Colors.grey[400],
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'No responses yet',
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.grey[600],
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Be the first to assist a customer!',
                                style: TextStyle(color: Colors.grey[500]),
                              ),
                            ],
                          ),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadLeaderboard,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: _leaderboard.length,
                          itemBuilder: (context, index) {
                            final stats = _leaderboard[index];
                            final score = stats.weightedScore;

                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              child: ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                leading: CircleAvatar(
                                  backgroundColor: index < 3
                                      ? Colors.amber[700]
                                      : Theme.of(context).colorScheme.primaryContainer,
                                  child: Text(
                                    _getRankEmoji(index),
                                    style: const TextStyle(fontSize: 24),
                                  ),
                                ),
                                title: Text(
                                  stats.name,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16,
                                  ),
                                ),
                                subtitle: Text(
                                  '${stats.assists} assist${stats.assists != 1 ? 's' : ''} • ${stats.ignores} ignore${stats.ignores != 1 ? 's' : ''} • ${stats.timeouts} timeout${stats.timeouts != 1 ? 's' : ''}',
                                  style: TextStyle(
                                    color: Colors.grey[600],
                                    fontSize: 13,
                                  ),
                                ),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      score.toString(),
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 20,
                                        color: score >= 0 ? Colors.green[700] : Colors.red[700],
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Score • ${_formatTime(stats.avgResponseTime)} avg',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.grey[600],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class ResponderStats {
  final String name;
  int assists;
  int ignores;
  int timeouts;
  int totalResponseTime;
  double fastestResponse;
  double slowestResponse;
  final List<int> responseTimes; // In milliseconds

  ResponderStats({
    required this.name,
    required this.assists,
    required this.ignores,
    required this.timeouts,
    required this.totalResponseTime,
    required this.fastestResponse,
    required this.slowestResponse,
    required this.responseTimes,
  });

  double get avgResponseTime => assists > 0 ? totalResponseTime / assists : 0;

  int get weightedScore {
    int score = 0;

    // Base assist points
    score += assists * 100;

    // Speed bonus calculation
    for (final responseTimeMs in responseTimes) {
      final responseTimeSeconds = responseTimeMs / 1000.0;
      if (responseTimeSeconds < 30) {
        score += 25; // <30s: +25 pts
      } else if (responseTimeSeconds < 60) {
        score += 15; // 30-60s: +15 pts
      } else if (responseTimeSeconds < 120) {
        score += 10; // 1-2min: +10 pts
      } else if (responseTimeSeconds < 180) {
        score += 5; // 2-3min: +5 pts
      } else if (responseTimeSeconds < 300) {
        score += 0; // 3-5min: 0 pts
      } else {
        score -= 10; // >5min: -10 pts
      }
    }

    // Penalties
    score -= ignores * 5; // Manual ignore: -5 pts
    score -= timeouts * 50; // Timeout: -50 pts

    return score;
  }
}
