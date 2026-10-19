package uk.whiteboard.payday

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import androidx.core.content.edit
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowToast
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class MainActivityTest {

    private val json = """{"app":"payday-transfers","version":4,"savedAt":"x","config":{"bills":[]},"months":{},"wealth":{}}"""

    /**
     * FileProvider caches each app's folder paths in a static map. Robolectric gives every test a new
     * cache folder, so clear it (on a phone the folder never changes while the app runs).
     */
    @org.junit.Before fun clearFileProviderCache() {
        val f = androidx.core.content.FileProvider::class.java.getDeclaredField("sCache")
        f.isAccessible = true
        (f.get(null) as MutableMap<*, *>).clear()
    }

    private fun launch() = Robolectric.buildActivity(MainActivity::class.java).setup().get()

    /** Simulate whether the phone has a fingerprint/face/screen lock set up. */
    private fun phoneHasScreenLock(yes: Boolean) {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        org.robolectric.shadow.api.Shadow.extract<org.robolectric.shadows.ShadowBiometricManager>(
            ctx.getSystemService(android.hardware.biometrics.BiometricManager::class.java)
        ).setCanAuthenticate(yes)
        shadowOf(ctx.getSystemService(android.app.KeyguardManager::class.java)).setIsDeviceSecure(yes)
    }

    private fun setLockPref(on: Boolean) =
        ApplicationProvider.getApplicationContext<Context>()
            .getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE).edit { putBoolean(MainActivity.KEY_LOCK, on) }

    private fun request(url: String) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse(url)
        override fun isForMainFrame() = true
        override fun isRedirect() = false
        override fun hasGesture() = true
        override fun getMethod() = "GET"
        override fun getRequestHeaders(): MutableMap<String, String> = mutableMapOf()
    }

    @Test fun loadsTheSamePageUrlAsVersions10To13() {
        // Same URL = same storage origin, so localStorage data from 1.3 is still there after the update.
        val a = launch()
        assertEquals("file:///android_asset/index.html", shadowOf(a.web).lastLoadedUrl)
    }

    @Test fun webViewSettingsAreLockedDown() {
        val s = launch().web.settings
        assertTrue(s.javaScriptEnabled)
        assertTrue(s.domStorageEnabled)
        assertFalse(s.allowFileAccess)
        assertFalse(s.allowContentAccess)
    }

    @Test fun exposesTheBridgeToThePage() {
        val a = launch()
        assertTrue(shadowOf(a.web).getJavascriptInterface("PaydayNative") is NativeBridge)
    }

    @Test fun refusesToNavigateAwayFromTheBundledPage() {
        val a = launch()
        val client = shadowOf(a.web).webViewClient
        assertTrue(client.shouldOverrideUrlLoading(a.web, request("https://example.com/")))
        assertTrue(client.shouldOverrideUrlLoading(a.web, request("file:///data/data/uk.whiteboard.payday/shared_prefs/payday.xml")))
        assertFalse(client.shouldOverrideUrlLoading(a.web, request("file:///android_asset/index.html#wealth")))
    }

    @Test fun backLeavesTheAppWhenThereIsNoPageHistory() {
        val a = launch()
        a.onBackPressedDispatcher.onBackPressed()
        assertTrue(a.isFinishing)
    }

    @Test fun backGoesBackInsideThePageWhenItCan() {
        val a = launch()
        @Suppress("DEPRECATION") shadowOf(a.web).setCanGoBack(true)
        a.onBackPressedDispatcher.onBackPressed()
        assertEquals(1, shadowOf(a.web).goBackInvocations)
        assertFalse(a.isFinishing)
    }

    @Test fun bridgeSavesListsAndReadsBackups() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertTrue(bridge.saveBackup(json))
        val dir = File(a.filesDir, "backups")
        val files = dir.listFiles()!!.map { it.name }
        assertEquals(1, files.size)
        assertTrue(bridge.listBackups().contains(files[0]))
        assertEquals(json, bridge.readBackup(files[0]))
        assertEquals("", bridge.readBackup("../shared_prefs/payday.xml"))
    }

    @Test fun shareOpensTheShareSheetWithAPrivateFileLink() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertTrue(bridge.share(json, "dovetail-backup-2026-10-16.json"))
        shadowOf(Looper.getMainLooper()).idle()
        val chooser = shadowOf(a).nextStartedActivity
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        @Suppress("DEPRECATION") val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND, send.action)
        assertEquals("application/json", send.type)
        @Suppress("DEPRECATION") val uri = send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!
        assertEquals("content://uk.whiteboard.payday.fileprovider/share/dovetail-backup-2026-10-16.json", uri.toString())
        assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals(json, File(a.cacheDir, "share/dovetail-backup-2026-10-16.json").readText())
    }

    @Test fun shareCleansUpOddFileNamesAndRefusesNonBackups() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertTrue(bridge.share(json, "../../evil name"))
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(File(a.cacheDir, "share/.._.._evil_name.json").isFile)
        assertNotNull(shadowOf(a).nextStartedActivity)
        assertFalse(bridge.share("{\"hello\":1}", "x.json"))
        shadowOf(Looper.getMainLooper()).idle()
        assertNull(shadowOf(a).nextStartedActivity)
    }

    @Test fun shareTextOpensTheShareSheetWithTheTransfersAsText() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        val text = "Dovetail transfers for November 2026\n1. \u2610 Alex's account \u2192 Joint bills  £2,132.00"
        assertTrue(bridge.shareText(text, "Dovetail transfers for November 2026"))
        shadowOf(Looper.getMainLooper()).idle()
        val chooser = shadowOf(a).nextStartedActivity
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        @Suppress("DEPRECATION") val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND, send.action)
        assertEquals("text/plain", send.type)
        assertEquals(text, send.getStringExtra(Intent.EXTRA_TEXT))
        assertEquals("Dovetail transfers for November 2026", send.getStringExtra(Intent.EXTRA_SUBJECT))
        @Suppress("DEPRECATION") assertNull(send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
    }

    @Test fun shareTextRefusesNothingOrTooMuch() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertFalse(bridge.shareText("  ", "x"))
        assertFalse(bridge.shareText("x".repeat(NativeBridge.MAX_TEXT_CHARS + 1), "x"))
        shadowOf(Looper.getMainLooper()).idle()
        assertNull(shadowOf(a).nextStartedActivity)
    }

    @Test fun sendFeedbackOpensTheEmailAppAddressedToSupport() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        val body = "What happened, or your idea:\n\n\n\nApp details (no names or amounts):\nDovetail 2.9 (data version 5)"
        assertTrue(bridge.sendFeedback("Dovetail 2.9 feedback", body))
        shadowOf(Looper.getMainLooper()).idle()
        val mail = shadowOf(a).nextStartedActivity
        assertEquals(Intent.ACTION_SENDTO, mail.action)
        assertEquals("mailto", mail.data?.scheme)
        assertEquals(MainActivity.FEEDBACK_EMAIL, mail.data?.schemeSpecificPart)
        assertEquals("dovetail.feedback@gmail.com", MainActivity.FEEDBACK_EMAIL)
        assertEquals(listOf(MainActivity.FEEDBACK_EMAIL), mail.getStringArrayExtra(Intent.EXTRA_EMAIL)?.toList())
        assertEquals("Dovetail 2.9 feedback", mail.getStringExtra(Intent.EXTRA_SUBJECT))
        assertEquals(body, mail.getStringExtra(Intent.EXTRA_TEXT))
    }

    @Test fun sendFeedbackRefusesNothingOrTooMuch() {
        val a = launch()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertFalse(bridge.sendFeedback("x", " "))
        assertFalse(bridge.sendFeedback("x", "x".repeat(NativeBridge.MAX_TEXT_CHARS + 1)))
        shadowOf(Looper.getMainLooper()).idle()
        assertNull(shadowOf(a).nextStartedActivity)
    }

    @Test fun sendFeedbackWithNoEmailAppGivesTheAddressInstead() {
        val a = launch()
        shadowOf(a.application).checkActivities(true)
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertTrue(bridge.sendFeedback("Dovetail 2.9 feedback", "App details"))
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("There's no email app on this phone. Write to dovetail.feedback@gmail.com.", ShadowToast.getTextOfLatestToast())
    }

    @Test fun lockIsOffByDefault() {
        val a = launch()
        assertEquals(View.VISIBLE, a.web.visibility)
        assertEquals(0, a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE)
        assertFalse((shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge).lockEnabled())
    }

    @Test fun lockOnHidesTheAppUntilUnlocked() {
        phoneHasScreenLock(true)
        setLockPref(true)
        val a = launch()
        assertFalse(a.unlocked)
        assertEquals(View.INVISIBLE, a.web.visibility)
        assertEquals(View.VISIBLE, a.findViewById<View>(R.id.unlock_button).visibility)
        assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0)
    }

    @Test fun lockOnButNoScreenLockOnThePhoneOpensWithoutLockingYouOut() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        phoneHasScreenLock(false)
        setLockPref(true)
        val a = launch()
        assertTrue(a.unlocked)
        assertEquals(View.VISIBLE, a.web.visibility)
        assertEquals(ctx.getString(R.string.lock_unavailable), ShadowToast.getTextOfLatestToast())
        // Content is still hidden from screenshots and recent apps while the setting is on.
        assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0)
    }

    @Test fun turningTheLockOffTellsThePage() {
        phoneHasScreenLock(false)
        setLockPref(true)
        val a = launch()
        a.requestLockChange(false)
        assertFalse(a.lockEnabled())
        assertEquals(0, a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE)
        assertEquals("window.paydayNativeEvent&&window.paydayNativeEvent(\"lock\",false,true)", shadowOf(a.web).lastEvaluatedJavascript)
    }

    @Test fun turningTheLockOnWithoutAScreenLockIsRefused() {
        phoneHasScreenLock(false)
        val a = launch()
        a.requestLockChange(true)
        assertFalse(a.lockEnabled())
        assertEquals("window.paydayNativeEvent&&window.paydayNativeEvent(\"lock\",false,false)", shadowOf(a.web).lastEvaluatedJavascript)
    }

    @Test fun keyboardInsetsArePaddedAndRemovedAgain() {
        // The page fills whatever space is left; the tab bar sits at its bottom (2.0 app-shell layout).
        val a = launch()
        val root = a.web.parent as View
        val withKeyboard = androidx.core.view.WindowInsetsCompat.Builder()
            .setInsets(androidx.core.view.WindowInsetsCompat.Type.ime(), androidx.core.graphics.Insets.of(0, 0, 0, 900))
            .setInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars(), androidx.core.graphics.Insets.of(0, 60, 0, 40)).build()
        androidx.core.view.ViewCompat.dispatchApplyWindowInsets(root, withKeyboard)
        assertEquals(60, root.paddingTop)
        assertEquals(900, root.paddingBottom)
        val keyboardGone = androidx.core.view.WindowInsetsCompat.Builder()
            .setInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars(), androidx.core.graphics.Insets.of(0, 60, 0, 40)).build()
        androidx.core.view.ViewCompat.dispatchApplyWindowInsets(root, keyboardGone)
        assertEquals(40, root.paddingBottom)
    }

    @Test fun insetsAreRefreshedEveryTimeTheAppComesBack() {
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        val before = c.get().insetRefreshes
        assertTrue(before >= 1)
        c.pause().stop().restart().start().resume()
        assertEquals(before + 1, c.get().insetRefreshes)
    }

    @Test fun appStillHasNoInternetPermission() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val info = ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.GET_PERMISSIONS)
        val perms = info.requestedPermissions?.toList() ?: emptyList()
        assertFalse(perms.contains(Manifest.permission.INTERNET))
        assertFalse(perms.contains(Manifest.permission.ACCESS_NETWORK_STATE))
        assertFalse(perms.contains("android.permission.USE_FINGERPRINT"))
    }
}
