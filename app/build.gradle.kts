import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---- The UI lives in web/: template.html (HTML + CSS) and src/*.js, built into one assets/index.html, plus web/fonts.
// The scripts are inlined, in order, inside one function scope where the template has /*PAYDAY_SCRIPTS*/.
// Generated, never committed. The app ships with no household data: a new install starts with first-run setup.
val generatedAssets = layout.buildDirectory.dir("generated/payday-assets")
val paydayScripts = listOf("calc.js", "migrate.js", "analysis.js", "export.js", "ui.js")
val generatePaydayPage by tasks.registering {
    description = "Builds the app's assets (index.html + fonts) from web/."
    val template = rootProject.file("web/template.html")
    val src = rootProject.file("web/src")
    val fonts = rootProject.file("web/fonts")
    inputs.file(template)
    inputs.dir(src)
    inputs.dir(fonts)
    outputs.dir(generatedAssets)
    doLast {
        val outDir = generatedAssets.get().asFile
        outDir.deleteRecursively()
        fonts.copyRecursively(File(outDir, "fonts"))
        val marker = "/*PAYDAY_SCRIPTS*/"
        val page = template.readText()
        check(page.split(marker).size == 2) { "web/template.html must contain $marker exactly once" }
        val scripts = paydayScripts.joinToString("\n") { name ->
            val f = File(src, name)
            check(f.isFile) { "missing web/src/$name" }
            val text = f.readText()
            check(!text.contains("</script", ignoreCase = true)) { "web/src/$name must not contain </script" }
            "/* ===== $name ===== */\n$text"
        }
        File(outDir, "index.html").writeText(page.replace(marker, "(function(){\n\"use strict\";\n$scripts\n})();"))
    }
}

// ---- Signing: the release key is never in the repo. Provide it through environment variables. ----
val keystorePath: String? = System.getenv("PAYDAY_KEYSTORE")
val keystorePass: String? = System.getenv("PAYDAY_KEYSTORE_PASS")

android {
    namespace = "uk.whiteboard.payday"
    compileSdk = 36

    defaultConfig {
        applicationId = "uk.whiteboard.payday"
        minSdk = 29
        targetSdk = 36
        versionCode = 22
        versionName = "2.13"
    }

    signingConfigs {
        create("release") {
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = keystorePass
                keyAlias = "payday"
                keyPassword = keystorePass
                // Match 1.3's signature (v3) as well as v2.
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else null
        }
    }

    sourceSets {
        getByName("main").assets.srcDir(generatedAssets)
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                // Robolectric downloads its Android runtime from Maven Central; use the mirror.
                it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2/")
                it.systemProperty("robolectric.dependency.repo.id", "central-mirror")
            }
        }
    }

    lint {
        abortOnError = true
        // These checks look up newer library and SDK versions online; check versions by hand before a release instead.
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "OldTargetApi")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

tasks.named("preBuild") { dependsOn(generatePaydayPage) }

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.biometric:biometric:1.1.0")
    // The daily reminder check (2.2). The only new dependency.
    implementation("androidx.work:work-runtime:2.11.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation("androidx.test:core:1.7.0")
    testImplementation("androidx.test.ext:junit:1.3.0")
    testImplementation("androidx.work:work-testing:2.11.2")
}
