package uk.whiteboard.payday

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.core.content.edit
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * 2.13: when the WebView's renderer crashes or is killed for memory, the crashed WebView is taken out and destroyed and
 * the page loads afresh in a new one (it used to rebuild the whole screen, saving the dead WebView's state on the way).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class RendererCrashTest {

    private fun controller() = Robolectric.buildActivity(MainActivity::class.java).setup()

    private val killed = object : RenderProcessGoneDetail() {
        override fun didCrash() = false
        override fun rendererPriorityAtExit() = WebView.RENDERER_PRIORITY_BOUND
    }

    /** What Android does when the renderer goes: tells the WebView's client. */
    private fun rendererGone(a: MainActivity, view: WebView = a.web): Boolean =
        shadowOf(view).webViewClient.onRenderProcessGone(view, killed)

    private fun request(url: String) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse(url)
        override fun isForMainFrame() = true
        override fun isRedirect() = false
        override fun hasGesture() = true
        override fun getMethod() = "GET"
        override fun getRequestHeaders(): MutableMap<String, String> = mutableMapOf()
    }

    @Test fun aCrashedRendererIsReplacedByAFreshWebViewThatLoadsThePage() {
        val c = controller()
        val a = c.get()
        val old = a.web
        val root = old.parent as ViewGroup
        assertTrue(rendererGone(a))       // handled: Android mustn't close the app
        // The dead WebView is out of the layout and destroyed.
        assertTrue(shadowOf(old).wasDestroyCalled())
        assertNull(old.parent)
        // A new one is in its place, under the lock cover, with the page loading from the same URL (same storage origin).
        val fresh = a.web
        assertNotSame(old, fresh)
        assertSame(root, fresh.parent)
        assertSame(fresh, root.getChildAt(0))
        assertEquals(2, root.childCount)
        assertEquals(MainActivity.START_URL, shadowOf(fresh).lastLoadedUrl)
        assertFalse(a.webGone)
        assertFalse(a.isFinishing)
        assertEquals(View.VISIBLE, fresh.visibility)
        // Saving the screen's state afterwards is safe (it used to run on the dead WebView).
        c.saveInstanceState(Bundle())
    }

    @Test fun theNewWebViewHasTheSameSettingsBridgeAndNavigationRule() {
        val a = controller().get()
        rendererGone(a)
        val s = a.web.settings
        assertTrue(s.javaScriptEnabled)
        assertTrue(s.domStorageEnabled)
        assertFalse(s.allowFileAccess)
        assertFalse(s.allowContentAccess)
        assertTrue(shadowOf(a.web).getJavascriptInterface("PaydayNative") is NativeBridge)
        val client = shadowOf(a.web).webViewClient
        assertTrue(client.shouldOverrideUrlLoading(a.web, request("https://example.com/")))
        assertFalse(client.shouldOverrideUrlLoading(a.web, request("file:///android_asset/index.html#wealth")))
    }

    @Test fun messagesWaitForTheNewPageAndTheOldPageCantMarkItReady() {
        val a = controller().get()
        val old = a.web
        shadowOf(old).webViewClient.onPageFinished(old, MainActivity.START_URL)
        assertTrue(a.pageReady)
        rendererGone(a)
        assertFalse(a.pageReady)
        // A late callback from the replaced WebView changes nothing; the new page finishing does.
        shadowOf(old).webViewClient.onPageFinished(old, MainActivity.START_URL)
        assertFalse(a.pageReady)
        shadowOf(a.web).webViewClient.onPageFinished(a.web, MainActivity.START_URL)
        assertTrue(a.pageReady)
    }

    @Test fun aSecondReportFromTheReplacedWebViewIsIgnored() {
        val a = controller().get()
        val old = a.web
        rendererGone(a)
        val fresh = a.web
        assertTrue(rendererGone(a, old))
        assertSame(fresh, a.web)
        assertFalse(shadowOf(fresh).wasDestroyCalled())
    }

    @Test fun backUsesTheNewWebView() {
        val a = controller().get()
        rendererGone(a)
        @Suppress("DEPRECATION") shadowOf(a.web).setCanGoBack(true)
        a.onBackPressedDispatcher.onBackPressed()
        assertEquals(1, shadowOf(a.web).goBackInvocations)
        assertFalse(a.isFinishing)
    }

    @Test fun aCrashWhileLockedKeepsThePageHidden() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        org.robolectric.shadow.api.Shadow.extract<org.robolectric.shadows.ShadowBiometricManager>(
            ctx.getSystemService(android.hardware.biometrics.BiometricManager::class.java)
        ).setCanAuthenticate(true)
        shadowOf(ctx.getSystemService(android.app.KeyguardManager::class.java)).setIsDeviceSecure(true)
        ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE).edit { putBoolean(MainActivity.KEY_LOCK, true) }
        val a = controller().get()
        assertFalse(a.unlocked)
        rendererGone(a)
        assertEquals(View.INVISIBLE, a.web.visibility)
        assertEquals(View.VISIBLE, a.findViewById<View>(R.id.unlock_button).visibility)
    }

    @Test fun closingTheScreenDestroysTheWebView() {
        val c = controller()
        val web = c.get().web
        c.pause().stop().destroy()
        assertTrue(shadowOf(web).wasDestroyCalled())
        assertNull(web.parent)
        assertTrue(c.get().webGone)
    }

    @Test fun closingTheScreenAfterACrashDestroysTheNewWebView() {
        val c = controller()
        rendererGone(c.get())
        val fresh = c.get().web
        c.pause().stop().destroy()
        assertTrue(shadowOf(fresh).wasDestroyCalled())
    }

    @Test fun pausingAsksThePageToSaveWhatItsHolding() {
        // Typing saves on a 0.7 s timer; onDestroy (Back on Android 10 and 11, a dark-mode switch) can follow a pause at once.
        val c = controller()
        val a = c.get()
        shadowOf(a.web).webViewClient.onPageFinished(a.web, MainActivity.START_URL)
        c.pause()
        assertEquals("window.paydayFlush&&window.paydayFlush()", shadowOf(a.web).lastEvaluatedJavascript)
        assertEquals(MainActivity.FLUSH_JS, shadowOf(a.web).lastEvaluatedJavascript)
        c.stop().destroy()
        assertTrue(shadowOf(a.web).wasDestroyCalled())
    }

    @Test fun pausingBeforeThePageHasLoadedOrAfterACrashSendsNothing() {
        val c = controller()
        c.pause()
        assertNull(shadowOf(c.get().web).lastEvaluatedJavascript)
        c.resume()
        rendererGone(c.get())
        c.pause()
        assertNull("the new page hasn't loaded yet", shadowOf(c.get().web).lastEvaluatedJavascript)
    }

    @Test fun rebuildingTheScreenReleasesTheOldWebViewAndShowsThePage() {
        // A dark-mode or font-size switch rebuilds the screen: the old WebView goes, the new screen shows the page.
        val c = controller()
        val old = c.get().web
        c.recreate()
        assertTrue(shadowOf(old).wasDestroyCalled())
        val fresh = c.get().web
        assertNotSame(old, fresh)
        assertFalse(c.get().webGone)
        assertEquals(View.VISIBLE, fresh.visibility)
    }
}
