import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/scan_model.dart';
import '../services/firestore_service.dart';

class ScanListItem extends StatefulWidget {
  final ScanModel scan;
  final String userId;
  final String userName;

  const ScanListItem({
    super.key,
    required this.scan,
    required this.userId,
    required this.userName,
  });

  @override
  State<ScanListItem> createState() => _ScanListItemState();
}

class _ScanListItemState extends State<ScanListItem> {
  bool _isProcessing = false;

  Future<void> _handleAssist() async {
    setState(() => _isProcessing = true);

    try {
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      final success = await firestoreService.claimScan(
        widget.scan.scanId,
        widget.userId,
        widget.userName,
      );

      if (!mounted) return;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 8),
                Text('Assisting customer at ${widget.scan.areaDescription}'),
              ],
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 3),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.white),
                SizedBox(width: 8),
                Text('This request was already claimed by another associate'),
              ],
            ),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _handleIgnore() async {
    setState(() => _isProcessing = true);

    try {
      final firestoreService = Provider.of<FirestoreService>(context, listen: false);
      await firestoreService.ignoreScan(
        widget.scan.scanId,
        widget.userId,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.visibility_off, color: Colors.white),
              SizedBox(width: 8),
              Text('Request hidden'),
            ],
          ),
          duration: Duration(seconds: 2),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Color _getElapsedTimeColor() {
    final elapsed = widget.scan.elapsedTime;
    if (elapsed.inMinutes < 2) {
      return Colors.green;
    } else if (elapsed.inMinutes < 5) {
      return Colors.orange;
    } else {
      return Colors.red;
    }
  }

  String _formatTimestamp() {
    final scanTime = widget.scan.timestamp.toDate();
    final hour = scanTime.hour > 12 ? scanTime.hour - 12 : scanTime.hour;
    final period = scanTime.hour >= 12 ? 'PM' : 'AM';
    final minute = scanTime.minute.toString().padLeft(2, '0');
    return '$hour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final elapsedColor = _getElapsedTimeColor();
    final isClaimed = widget.scan.isClaimed;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with area and time
            Row(
              children: [
                Icon(
                  Icons.location_on,
                  color: isClaimed ? Colors.blue : colorScheme.primary,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.scan.areaDescription,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: elapsedColor.withAlpha(51), // 20% opacity
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.timer,
                        size: 16,
                        color: elapsedColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        widget.scan.elapsedTimeString,
                        style: TextStyle(
                          color: elapsedColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Timestamp
            Row(
              children: [
                Icon(
                  Icons.access_time,
                  size: 16,
                  color: Colors.grey[600],
                ),
                const SizedBox(width: 8),
                Text(
                  'Request sent at ${_formatTimestamp()}',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),

            // Show who's assisting if claimed
            if (isClaimed && widget.scan.claimedByName != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.withAlpha(26), // 10% opacity
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Colors.blue.withAlpha(51), // 20% opacity
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.how_to_reg,
                      size: 20,
                      color: Colors.blue[700],
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${widget.scan.claimedByName} is assisting',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.blue[700],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Action buttons (only for pending scans)
            if (!isClaimed) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _isProcessing ? null : _handleAssist,
                      icon: _isProcessing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.check_circle),
                      label: const Text('Assist'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isProcessing ? null : _handleIgnore,
                      icon: const Icon(Icons.close),
                      label: const Text('Ignore'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.grey[700],
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
