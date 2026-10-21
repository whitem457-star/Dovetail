package uk.whiteboard.payday

import android.content.Context
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.AnimatedVectorDrawable
import android.graphics.drawable.VectorDrawable
import android.os.Looper
import android.util.TypedValue
import androidx.core.content.ContextCompat
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

/** The Dovetail mark (2.11): the app icon's layers, the notification icon and the animated launch screen. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class BrandTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()

    @Test fun theAppIconHasAWhiteBackgroundTheMarkAndAOneColourLayer() {
        val icon = ctx.getDrawable(R.mipmap.ic_launcher) as AdaptiveIconDrawable
        assertTrue(icon.foreground is VectorDrawable)
        assertTrue(icon.background is VectorDrawable)
        assertNotNull("themed icons (Android 13+) need the monochrome layer", icon.monochrome)
        assertTrue(icon.monochrome is VectorDrawable)
        assertTrue(ctx.getDrawable(R.drawable.ic_launcher_monochrome) is VectorDrawable)
    }

    @Test fun theNotificationIconIsAVector() {
        assertTrue(ctx.getDrawable(R.drawable.ic_stat_payday) is VectorDrawable)
    }

    @Test fun theLaunchScreenAnimatesTheMarkOnACardColouredCircle() {
        val a = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val v = TypedValue()
        assertTrue(a.theme.resolveAttribute(android.R.attr.windowSplashScreenAnimatedIcon, v, true))
        assertEquals(R.drawable.splash_mark_anim, v.resourceId)
        assertTrue(ctx.getDrawable(R.drawable.splash_mark_anim) is AnimatedVectorDrawable)
        assertTrue(a.theme.resolveAttribute(android.R.attr.windowSplashScreenIconBackgroundColor, v, true))
        assertEquals(0xFFFFFFFF.toInt(), v.data)
        assertEquals(0xFFFFFFFF.toInt(), ContextCompat.getColor(ctx, R.color.splash_icon_bg))
    }

    @Config(qualifiers = "night")
    @Test fun inTheDarkTheLaunchScreenUsesTheDarkCircleAndColours() {
        assertEquals(0xFF141C18.toInt(), ContextCompat.getColor(ctx, R.color.splash_icon_bg))
        assertTrue(ctx.getDrawable(R.drawable.splash_mark_anim) is AnimatedVectorDrawable)
    }

    @Test fun theLaunchScreenWaitsForTheAnimationAndThePageButNeverLong() {
        val done = MainActivity::splashDone
        // Page loaded, animation still playing: wait; played: go.
        assertFalse(done(200, true, false, true))
        assertTrue(done(MainActivity.SPLASH_MIN_MS, true, false, true))
        // Animation played, page still loading: wait, but never past the limit.
        assertFalse(done(1000, false, false, true))
        assertTrue(done(MainActivity.SPLASH_MAX_MS, false, false, true))
        // Animations off on the phone: go as soon as the page is ready.
        assertTrue(done(0, true, false, false))
        // App lock up: go at once, so the unlock prompt isn't kept waiting.
        assertTrue(done(0, false, true, true))
    }

    private fun page(a: MainActivity, loaded: Boolean) {
        val client = shadowOf(a.web).webViewClient
        if (loaded) client.onPageFinished(a.web, MainActivity.START_URL) else client.onPageStarted(a.web, MainActivity.START_URL, null)
    }

    @Test fun theFirstFrameIsHeldUntilThePageIsReadyAndTheAnimationHasPlayed() {
        val a = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val vto = (a.web.parent as android.view.View).viewTreeObserver
        page(a, false)
        assertTrue("held while the page loads", vto.dispatchOnPreDraw())
        page(a, true)
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(MainActivity.SPLASH_MIN_MS))
        assertFalse("drawn once the page is ready and the animation has played", vto.dispatchOnPreDraw())
        page(a, false)
        assertFalse("and never held again", vto.dispatchOnPreDraw())
    }

    @Test fun aBackupFileHandedOverWaitsOnlyForThePage() {
        val handOver = android.content.Intent(ctx, MainActivity::class.java).putExtra(MainActivity.EXTRA_IMPORT, "incoming-1.json")
        val a = Robolectric.buildActivity(MainActivity::class.java, handOver).setup().get()
        val vto = (a.web.parent as android.view.View).viewTreeObserver
        page(a, false)
        assertTrue("held while the page loads", vto.dispatchOnPreDraw())
        page(a, true)
        assertFalse("drawn as soon as the page is ready, without waiting for the animation", vto.dispatchOnPreDraw())
    }

    @Test fun aRecreatedScreenIsNotHeld() {
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        c.recreate()
        val a = c.get()
        page(a, false)
        assertFalse("a rotation or theme change draws at once", (a.web.parent as android.view.View).viewTreeObserver.dispatchOnPreDraw())
    }
}
