# QRCallBox ProGuard Rules - Security & Obfuscation Configuration

# Keep line numbers for debugging crashes in production
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Security: Remove debug information
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Firebase Rules - Required to prevent crashes
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-keepclassmembers class * {
    @com.google.firebase.firestore.PropertyName <methods>;
    @com.google.firebase.firestore.PropertyName <fields>;
}

# Keep data models for Firestore serialization
-keep class com.stable.qrcallbox.models.** { *; }

# Keep FCM messaging service
-keep class com.stable.qrcallbox.services.QRCallMessagingService { *; }

# Keep notification receiver
-keep class com.stable.qrcallbox.utils.NotificationActionReceiver { *; }

# OkHttp and Retrofit rules
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-keep class okhttp3.** { *; }
-keep class retrofit2.** { *; }

# Gson rules (if using Gson with Retrofit)
-keepattributes Signature
-keepattributes *Annotation*
-keep class sun.misc.Unsafe { *; }

# Coroutines rules
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# Material Design Components
-keep class com.google.android.material.** { *; }

# AndroidX rules
-keep class androidx.** { *; }

# Security: Obfuscate sensitive strings and methods
-obfuscationdictionary obfuscation-dictionary.txt
-classobfuscationdictionary obfuscation-dictionary.txt
-packageobfuscationdictionary obfuscation-dictionary.txt

# Additional security measures
-dontskipnonpubliclibraryclasses
-dontskipnonpubliclibraryclassmembers
-forceprocessing
-optimizationpasses 5

# Remove unnecessary code
-assumenosideeffects class java.lang.System {
    public static long currentTimeMillis();
    static java.lang.Class getCallerClass();
}

# Keep application class
-keep public class com.stable.qrcallbox.QRCallBoxApplication

# Keep activities, services, receivers
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver