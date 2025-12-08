
// Diagnostic endpoint to check user notification status
export const checkUserNotificationStatus = onCall(async (request) => {
  const email = request.data.email;

  if (!email) {
    throw new HttpsError('invalid-argument', 'Email is required');
  }

  try {
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email.toLowerCase())
      .get();

    if (usersSnapshot.empty) {
      throw new HttpsError('not-found', `No user found with email: ${email}`);
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    // Check current shift status
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
    const hour = now.getHours();
    const minute = now.getMinutes();

    let onShift = false;
    let shiftInfo = null;

    if (userData.workSchedule && userData.workSchedule[dayName]) {
      const daySchedule = userData.workSchedule[dayName];
      if (daySchedule.isWorkingDay) {
        const currentMinutes = hour * 60 + minute;
        const startMinutes = daySchedule.startHour * 60 + (daySchedule.startMinute || 0);
        const endMinutes = daySchedule.endHour * 60 + (daySchedule.endMinute || 0);
        onShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        shiftInfo = {
          day: dayName,
          start: `${daySchedule.startHour}:${String(daySchedule.startMinute || 0).padStart(2, '0')}`,
          end: `${daySchedule.endHour}:${String(daySchedule.endMinute || 0).padStart(2, '0')}`,
          currentTime: `${hour}:${String(minute).padStart(2, '0')}`
        };
      } else {
        shiftInfo = { day: dayName, status: 'Not a working day' };
      }
    } else {
      onShift = true; // No schedule = always on
      shiftInfo = { status: 'No schedule configured (receives all notifications)' };
    }

    const hasToken = userData.fcmToken && userData.fcmToken.length > 10;
    const notifEnabled = userData.notificationsEnabled !== false;
    const isApproved = userData.approved !== false;
    const canReceive = hasToken && notifEnabled && isApproved && onShift;

    return {
      success: true,
      user: {
        userId,
        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        email: userData.email,
        storeNumber: userData.storeNumber
      },
      fcmToken: {
        present: hasToken,
        length: userData.fcmToken ? userData.fcmToken.length : 0,
        preview: userData.fcmToken ? userData.fcmToken.substring(0, 30) + '...' : null,
        updatedAt: userData.fcmTokenUpdatedAt ? userData.fcmTokenUpdatedAt.toDate().toISOString() : null
      },
      settings: {
        notificationsEnabled: notifEnabled,
        approved: isApproved,
        respectDoNotDisturb: userData.respectDoNotDisturb !== false
      },
      shift: {
        onShift,
        ...shiftInfo
      },
      canReceiveNotifications: canReceive,
      blockingReasons: !canReceive ? [
        ...(!hasToken ? ['Missing or invalid FCM token'] : []),
        ...(!notifEnabled ? ['Notifications disabled'] : []),
        ...(!isApproved ? ['Account not approved'] : []),
        ...(!onShift ? ['Not currently on shift'] : [])
      ] : []
    };

  } catch (error) {
    logger.error('Error checking notification status:', error);
    throw new HttpsError('internal', error.message);
  }
});
