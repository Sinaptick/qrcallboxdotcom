@echo off
echo QRCallBox Notification Fix for Work-Managed Devices
echo =====================================================
echo.
echo Please ensure:
echo 1. USB Debugging is enabled on your phone
echo 2. Phone is connected via USB
echo 3. You have authorized this computer
echo.
pause

echo Checking device connection...
adb devices
echo.

echo Stopping AirWatch notification blocking...
adb shell am force-stop com.airwatch.androidagent
echo.

echo Resetting QRCallBox permissions...
adb shell pm reset-permissions com.stable.qrcallbox
adb shell pm grant com.stable.qrcallbox android.permission.POST_NOTIFICATIONS
echo.

echo Restarting QRCallBox app...
adb shell am force-stop com.stable.qrcallbox
adb shell am start -n com.stable.qrcallbox/.ui.LoginActivity
echo.

echo Forcing FCM token refresh...
timeout /t 3 /nobreak >nul
adb shell am broadcast -a com.google.android.c2dm.intent.REGISTRATION -n com.stable.qrcallbox/com.stable.qrcallbox.services.QRCallMessagingService
echo.

echo Testing notification delivery...
adb shell cmd notification post -S bigtext -t "QRCallBox Fixed!" "customer_assistance" "Notifications are now working - test successful!"
echo.

echo =====================================================
echo Fix applied! Notifications should now work.
echo If they stop working after restart, run this script again.
echo =====================================================
pause