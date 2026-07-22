# Retrofit does reflection on method/parameter annotations and generic signatures at runtime —
# without these, R8 strips the metadata it needs under minification (staging/release builds).
# This is Retrofit's own documented R8 rule set (see Retrofit's README "R8 / ProGuard" section).
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, RuntimeVisibleTypeAnnotations, AnnotationDefault
-keepattributes Signature
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

# OkHttp references optional JVM-only platforms not present on Android — safe to ignore.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# kotlinx.serialization resolves `Companion.serializer()` reflectively for every
# `@Serializable` model this app defines — keep those lookups intact under minification.
# This is kotlinx.serialization's own documented consumer rule set.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.tappyai.**$$serializer { *; }
-keepclassmembers class com.tappyai.** {
    *** Companion;
}
-keepclasseswithmembers class com.tappyai.** {
    kotlinx.serialization.KSerializer serializer(...);
}
