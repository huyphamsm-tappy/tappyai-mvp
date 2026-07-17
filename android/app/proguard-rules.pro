# Add project specific ProGuard rules here.
#
# release/staging both run with isMinifyEnabled = true (app/build.gradle.kts) — every rule below
# protects code R8 would otherwise strip/rename purely by static analysis, because the real
# caller is reflection (kotlinx.serialization) or a dynamic proxy (Retrofit), which R8 can't see.
# Hilt/Dagger and Compose ship their own consumer ProGuard rules bundled in their AARs and need
# no manual rules here.

# ---- kotlinx.serialization ---------------------------------------------------------------
# Official recommended rules (https://github.com/Kotlin/kotlinx.serialization#android) — without
# these, R8 strips/renames the generated $$serializer companion classes every @Serializable DTO
# in this app relies on, breaking every request/response body at runtime in a release build only.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep every @Serializable model + its generated serializer under this app's own package root
# (DTOs live in `com.tappyai.app.**.data` and `com.tappyai.core.**`, both covered).
-keep,includedescriptorclasses class com.tappyai.**$$serializer { *; }
-keepclassmembers class com.tappyai.** {
    *** Companion;
}
-keepclasseswithmembers class com.tappyai.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ---- Retrofit -----------------------------------------------------------------------------
# Official recommended rules (https://square.github.io/retrofit/) — Retrofit builds its request
# adapters from annotated interface methods via reflection at runtime; without these, R8's
# default obfuscation/shrinking of interface methods breaks every *Api interface in the app.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault

-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

-dontwarn org.codehaus.mojo.animal_sniffer.*
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*

-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>

# ---- OkHttp -------------------------------------------------------------------------------
-dontwarn okhttp3.**
-dontwarn okio.**

# ---- kotlin.coroutines ----------------------------------------------------------------------
-dontwarn kotlinx.coroutines.**
