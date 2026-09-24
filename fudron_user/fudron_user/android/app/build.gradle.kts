import java.io.FileInputStream
import java.util.Properties

val keystoreProperties = Properties()

val keystorePropertiesFile =
    rootProject.file("key.properties")

if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(
        FileInputStream(keystorePropertiesFile)
    )
}

plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.appzeto.food_user_application"
    ndkVersion = "28.2.13676358"

    compileSdk = 36

    defaultConfig {
        applicationId = "com.appzeto.food"

        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion

        versionCode = flutter.versionCode
        versionName = flutter.versionName

        multiDexEnabled = true

        manifestPlaceholders["MAPS_API_KEY"] = "[GCP_API_KEY]"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17

        isCoreLibraryDesugaringEnabled = true
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(
                org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
            )
        }
    }

    signingConfigs {
        create("release") {
            keyAlias =
                keystoreProperties["keyAlias"] as String?

            keyPassword =
                keystoreProperties["keyPassword"] as String?

            storeFile =
                keystoreProperties["storeFile"]?.let {
                    rootProject.file(it)
                }

            storePassword =
                keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            signingConfig =
                signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring(
        "com.android.tools:desugar_jdk_libs:2.1.4"
    )

    implementation(
        "androidx.multidex:multidex:2.0.1"
    )
}