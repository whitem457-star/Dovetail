package uk.whiteboard.payday

import android.content.Context
import android.graphics.drawable.ColorDrawable
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.view.WindowCompat
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Settings › Appearance on the Android side: the theme the page sends is stored and applied to the window. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AppearanceTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private fun prefs() = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
    private fun launch() = Robolectric.buildActivity(MainActivity::class.java).setup().get()
    private fun bridge(a: MainActivity) = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
    private fun windowColour(a: MainActivity) = (a.window.decorView.background as ColorDrawable).color
    private fun lightIcons(a: MainActivity) = WindowCompat.getInsetsController(a.window, a.window.decorView).isAppearanceLightStatusBars
    private val lightBg get() = ContextCompat.getColor(ctx, R.color.page_bg_light)
    private val darkBg get() = ContextCompat.getColor(ctx, R.color.page_bg_dark)

    @Test fun followsALightPhoneByDefault() {
        val a = launch()
        assertEquals("system", a.themePref())
        assertFalse(a.darkApplied())
        assertEquals(lightBg, windowColour(a))
        assertTrue("dark icons on a light background", lightIcons(a))
    }

    @Config(qualifiers = "night")
    @Test fun followsADarkPhoneByDefault() {
        val a = launch()
        assertTrue(a.darkApplied())
        assertEquals(darkBg, windowColour(a))
        assertFalse(lightIcons(a))
    }

    @Test fun darkChosenInThePageIsStoredAndAppliedStraightAway() {
        val a = launch()
        bridge(a).setTheme("dark")
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("dark", prefs().getString(MainActivity.KEY_THEME, null))
        assertTrue(a.darkApplied())
        assertEquals(darkBg, windowColour(a))
        assertEquals(darkBg, (a.web.parent as android.view.View).let { (it.background as ColorDrawable).color })
        assertFalse("light icons on the dark background", lightIcons(a))
    }

    @Test fun theStoredThemeIsAppliedOnEveryStart() {
        prefs().edit { putString(MainActivity.KEY_THEME, "dark") }
        val a = launch()
        assertTrue(a.darkApplied())
        assertEquals(darkBg, windowColour(a))
        assertFalse(lightIcons(a))
    }

    @Config(qualifiers = "night")
    @Test fun lightChosenOnADarkPhone() {
        prefs().edit { putString(MainActivity.KEY_THEME, "light") }
        val a = launch()
        assertFalse(a.darkApplied())
        assertEquals(lightBg, windowColour(a))
        assertTrue(lightIcons(a))
    }

    @Test fun backToFollowPhoneAndUnknownValues() {
        val a = launch()
        bridge(a).setTheme("dark"); shadowOf(Looper.getMainLooper()).idle()
        bridge(a).setTheme("purple"); shadowOf(Looper.getMainLooper()).idle()
        assertEquals("system", a.themePref())
        assertFalse(a.darkApplied())
        assertEquals(lightBg, windowColour(a))
        assertTrue(MainActivity.resolveDark("dark", false))
        assertFalse(MainActivity.resolveDark("light", true))
        assertTrue(MainActivity.resolveDark("system", true))
        assertFalse(MainActivity.resolveDark("", false))
    }

    @Test fun tickingGivesALightTapWithNoPermission() {
        val a = launch()
        val b = bridge(a)
        b.haptic("tick"); shadowOf(Looper.getMainLooper()).idle()
        assertEquals(android.view.HapticFeedbackConstants.CONTEXT_CLICK, shadowOf(a.web).lastHapticFeedbackPerformed())
        b.haptic("untick"); shadowOf(Looper.getMainLooper()).idle()
        assertEquals(android.view.HapticFeedbackConstants.CLOCK_TICK, shadowOf(a.web).lastHapticFeedbackPerformed())
        b.haptic("done"); shadowOf(Looper.getMainLooper()).idle()
        assertEquals(android.view.HapticFeedbackConstants.CONFIRM, shadowOf(a.web).lastHapticFeedbackPerformed())
        val perms = ctx.packageManager.getPackageInfo(ctx.packageName, android.content.pm.PackageManager.GET_PERMISSIONS).requestedPermissions?.toList() ?: emptyList()
        assertFalse("no VIBRATE permission", perms.contains(android.Manifest.permission.VIBRATE))
    }
}
