# supabase-kt models its requests/responses with kotlinx.serialization, same reflective
# `Companion.serializer()` lookup pattern as core:network's Retrofit converter — reusing the
# same documented kotlinx.serialization consumer rules here since this is a separate
# @Serializable class hierarchy (AuthRoute, Supabase's own DTOs) under minification.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.tappyai.features.auth.**$$serializer { *; }
-keepclassmembers class com.tappyai.features.auth.** {
    *** Companion;
}
-keepclasseswithmembers class com.tappyai.features.auth.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Google Identity / Credential Manager credential classes are parceled via reflection.
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep class androidx.credentials.** { *; }
