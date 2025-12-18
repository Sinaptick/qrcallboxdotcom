import 'package:flutter/foundation.dart';

class ShiftCalculator {
  /// Calculate if user is currently on shift based on their work schedule
  /// Returns a map with isOnShift status and shift end time
  static Map<String, dynamic> calculateShiftStatus(Map<String, dynamic>? workSchedule) {
    if (workSchedule == null || workSchedule.isEmpty) {
      // No schedule set - default to always on shift
      return {
        'isOnShift': true,
        'shiftEndTime': null,
      };
    }

    final now = DateTime.now();
    final dayName = _getDayName(now.weekday);

    if (kDebugMode) {
      print('Calculating shift status for $dayName at ${now.hour}:${now.minute.toString().padLeft(2, '0')}');
    }

    // Check if schedule exists for today
    final daySchedule = workSchedule[dayName.toLowerCase()];

    if (daySchedule == null || daySchedule is! Map) {
      if (kDebugMode) {
        print('No schedule for $dayName - user is off shift');
      }
      return {
        'isOnShift': false,
        'shiftEndTime': null,
      };
    }

    // Check if user is working this day (Android format)
    final isWorkingDay = daySchedule['isWorkingDay'] as bool?;
    if (isWorkingDay == false) {
      if (kDebugMode) {
        print('$dayName is not a working day - user is off shift');
      }
      return {
        'isOnShift': false,
        'shiftEndTime': null,
      };
    }

    // Support both Android format (startHour, startMinute) and old iOS format (start, end)
    int startMinutes;
    int endMinutes;
    String? endTimeDisplay;

    // Try Android format first
    if (daySchedule.containsKey('startHour') && daySchedule.containsKey('startMinute')) {
      final startHour = daySchedule['startHour'] as int?;
      final startMinute = daySchedule['startMinute'] as int?;
      final endHour = daySchedule['endHour'] as int?;
      final endMinute = daySchedule['endMinute'] as int?;

      if (startHour == null || startMinute == null || endHour == null || endMinute == null) {
        if (kDebugMode) {
          print('Missing hour/minute values for $dayName - user is off shift');
        }
        return {
          'isOnShift': false,
          'shiftEndTime': null,
        };
      }

      startMinutes = startHour * 60 + startMinute;
      endMinutes = endHour * 60 + endMinute;
      endTimeDisplay = '${endHour.toString().padLeft(2, '0')}:${endMinute.toString().padLeft(2, '0')}';

      if (kDebugMode) {
        print('Using Android format: ${startHour}:${startMinute} - ${endHour}:${endMinute}');
      }
    }
    // Fall back to old iOS format
    else if (daySchedule.containsKey('start') && daySchedule.containsKey('end')) {
      final startTime = daySchedule['start'] as String?;
      final endTime = daySchedule['end'] as String?;

      if (startTime == null || endTime == null) {
        if (kDebugMode) {
          print('Missing start/end time for $dayName - user is off shift');
        }
        return {
          'isOnShift': false,
          'shiftEndTime': null,
        };
      }

      final parsedStart = _parseTimeToMinutes(startTime);
      final parsedEnd = _parseTimeToMinutes(endTime);

      if (parsedStart == null || parsedEnd == null) {
        if (kDebugMode) {
          print('Invalid time format for $dayName - user is off shift');
        }
        return {
          'isOnShift': false,
          'shiftEndTime': null,
        };
      }

      startMinutes = parsedStart;
      endMinutes = parsedEnd;
      endTimeDisplay = endTime;

      if (kDebugMode) {
        print('Using iOS format: $startTime - $endTime');
      }
    }
    // No valid schedule format found
    else {
      if (kDebugMode) {
        print('No valid schedule format for $dayName - user is off shift');
      }
      return {
        'isOnShift': false,
        'shiftEndTime': null,
      };
    }

    final currentMinutes = now.hour * 60 + now.minute;
    final isOnShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

    if (kDebugMode) {
      print('Shift calculation: start=$startMinutes min, end=$endMinutes min, current=$currentMinutes min');
      print('Result: ${isOnShift ? "ON" : "OFF"} shift');
    }

    return {
      'isOnShift': isOnShift,
      'shiftEndTime': isOnShift ? endTimeDisplay : null,
    };
  }

  /// Parse time string (HH:mm or H:mm) to minutes since midnight
  static int? _parseTimeToMinutes(String time) {
    try {
      // Handle both "HH:mm" and "H:mm" formats
      final parts = time.trim().split(':');
      if (parts.length != 2) return null;

      final hour = int.parse(parts[0]);
      final minute = int.parse(parts[1]);

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
      }

      return hour * 60 + minute;
    } catch (e) {
      if (kDebugMode) {
        print('Error parsing time "$time": $e');
      }
      return null;
    }
  }

  /// Get day name from weekday number (1=Monday, 7=Sunday)
  static String _getDayName(int weekday) {
    switch (weekday) {
      case 1:
        return 'Monday';
      case 2:
        return 'Tuesday';
      case 3:
        return 'Wednesday';
      case 4:
        return 'Thursday';
      case 5:
        return 'Friday';
      case 6:
        return 'Saturday';
      case 7:
        return 'Sunday';
      default:
        return 'Monday';
    }
  }

  /// Format time for display (e.g., "5:30 PM")
  static String formatTime(String time24) {
    try {
      final parts = time24.split(':');
      if (parts.length != 2) return time24;

      int hour = int.parse(parts[0]);
      final minute = parts[1];

      final period = hour >= 12 ? 'PM' : 'AM';
      if (hour > 12) hour -= 12;
      if (hour == 0) hour = 12;

      return '$hour:$minute $period';
    } catch (e) {
      return time24;
    }
  }
}
