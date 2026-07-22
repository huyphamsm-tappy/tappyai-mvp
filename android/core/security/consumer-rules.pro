# androidx.security:security-crypto is built on Google Tink, which registers crypto
# primitives via reflection — R8 will strip these without explicit keep rules, breaking
# EncryptedSharedPreferences at runtime under minification (staging/release builds).
# This is the rule set Tink's own documentation recommends for consumers.
-keep class com.google.crypto.tink.** { *; }
-keep interface com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-keepclassmembers class * extends com.google.crypto.tink.shaded.protobuf.GeneratedMessageLite {
    <fields>;
}
