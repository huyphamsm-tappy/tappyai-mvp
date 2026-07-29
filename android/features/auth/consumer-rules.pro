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

# Round-2 audit fix: the rules above only cover this module's OWN @Serializable types
# (AuthRoute etc). supabase-kt/auth-kt ship zero consumer ProGuard rules of their own (confirmed
# by unzipping the release AARs), so their DTOs — e.g. UserSession, UserInfo, decoded on every
# login/refresh/OTP/OAuth response — were unprotected and R8 could strip/rename them in a real
# minified build, breaking sign-in silently (only reachable via an authenticated network call, so
# a plain install+launch smoke test never caught it).
-keep,includedescriptorclasses class io.github.jan.supabase.**$$serializer { *; }
-keepclassmembers class io.github.jan.supabase.** {
    *** Companion;
}
-keepclasseswithmembers class io.github.jan.supabase.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Google Identity / Credential Manager credential classes are parceled via reflection.
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep class androidx.credentials.** { *; }
