package uk.whiteboard.payday

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Clock
import java.time.LocalDateTime
import java.time.ZoneId

/** Opt-in reminder notifications: storing the page's schedule, the daily job, the permission and opening Reminders. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class NotificationsTest {
    private val app get() = ApplicationProvider.getApplicationContext<Application>()
    private val zone = ZoneId.of("Europe/London")
    private fun at(s: String) = Clock.fixed(LocalDateTime.parse(s).atZone(zone).toInstant(), zone)
    private fun notifier(time: String = "2026-10-16T09:30") = Notifier(app, at(time))
    private val nm get() = shadowOf(app.getSystemService(NotificationManager::class.java))

    private fun schedule(time: String = "09:00", vararg entries: Triple<String, String, String>) = JSONObject()
        .put("version", 1).put("time", time)
        .put("entries", JSONArray().apply { entries.forEach { (d, k, t) -> put(JSONObject().put("date", d).put("key", k).put("title", t).put("text", "Text for $t")) } })
        .toString()

    private val sample = schedule("09:00",
        Triple("2026-10-16", "pay:2026-10-17@2026-10-16", "Payday tomorrow"),
        Triple("2026-10-16", "b:home@2026-10-16", "Home insurance"),
        Triple("2026-10-17", "r:mot@2026-10-17", "Car MOT"))

    @Before fun setUp() {
        WorkManagerTestInitHelper.initializeTestWorkManager(app)
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun dailyWork() = WorkManager.getInstance(app).getWorkInfosForUniqueWork(Notifier.WORK_DAILY).get()

    @Test fun theScheduleFromThePageIsStoredAndOddInputRefused() {
        val n = notifier()
        assertTrue(n.storeSchedule(sample))
        assertEquals(3, n.entries().size)
        assertEquals("09:00", n.time().toString())
        assertFalse(n.storeSchedule("not json"))
        assertFalse(n.storeSchedule("""{"time":"09:00","entries":[{"date":"tomorrow","key":"x","title":"t","text":"t"}]}"""))
        assertEquals("a bad schedule doesn't replace the good one", 3, n.entries().size)
        assertTrue(n.storeSchedule(schedule("25:99")))
        assertEquals("an impossible time falls back to 09:00", "09:00", n.time().toString())
    }

    @Test fun theDailyJobPostsTodaysEntriesOnce() {
        val n = notifier()
        n.turnOn()
        n.storeSchedule(sample)
        assertEquals(2, n.runDaily())
        assertEquals(2, nm.allNotifications.size)
        assertEquals("posting again the same day repeats nothing", 0, n.runDaily())
        assertEquals(2, nm.allNotifications.size)
        assertTrue(n.postedKeys().contains("2026-10-16|b:home@2026-10-16"))
        assertEquals("tomorrow's entry is posted tomorrow", 1, notifier("2026-10-17T09:05").runDaily())
        assertEquals(3, nm.allNotifications.size)
    }

    @Test fun notificationsLookRightAndOpenReminders() {
        val n = notifier()
        n.storeSchedule(sample)
        n.turnOn()
        val channel = app.getSystemService(NotificationManager::class.java).getNotificationChannel(Notifier.CHANNEL)
        assertEquals("Reminders", channel.name.toString())
        val posted = nm.allNotifications.first { it.extras.getString(NotificationCompat.EXTRA_TITLE) == "Home insurance" }
        assertEquals("Text for Home insurance", posted.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString())
        assertEquals(Notifier.CHANNEL, posted.channelId)
        assertEquals("details hidden on a locked screen", NotificationCompat.VISIBILITY_PRIVATE, posted.visibility)
        assertEquals("You have a reminder", posted.publicVersion.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString())
        val tap = shadowOf(posted.contentIntent).savedIntent
        assertEquals(MainActivity::class.java.name, tap.component!!.className)
        assertEquals("due", tap.getStringExtra(MainActivity.EXTRA_OPEN))
        assertEquals("like the app icon, so the icon later brings back the same screen", Intent.ACTION_MAIN, tap.action)
        assertTrue(tap.hasCategory(Intent.CATEGORY_LAUNCHER))
    }

    @Test fun nothingIsPostedWhenSwitchedOffOrNotAllowed() {
        val n = notifier()
        n.storeSchedule(sample)
        assertEquals("off by default", 0, n.runDaily())
        assertEquals(0, nm.allNotifications.size)
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        n.turnOn()
        assertEquals("permission taken away in the phone's settings", 0, n.runDaily())
        assertEquals(0, nm.allNotifications.size)
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        n.turnOff()
        assertEquals("switched off", 0, n.runDaily())
        assertEquals(0, nm.allNotifications.size)
    }

    @Test fun switchingOnAfterTheChosenTimePostsTodaysStraightAway() {
        val n = notifier("2026-10-16T18:00")
        n.storeSchedule(sample)
        n.turnOn()
        assertEquals("the evening before payday still gets \"Payday tomorrow\"", 2, nm.allNotifications.size)
    }

    @Test fun everyRunBooksTheNextOneAtTheChosenTime() {
        val n = notifier("2026-10-16T09:30")
        n.storeSchedule(sample)
        n.turnOn()
        val later = WorkManager.getInstance(app).getWorkInfosForUniqueWork(Notifier.WORK_LATER).get().single { it.state == WorkInfo.State.ENQUEUED }
        assertEquals("tomorrow at 09:00, 23.5 hours away", (23L * 60 + 30) * 60 * 1000, later.initialDelayMillis)
        // A run that WorkManager let drift late (11:10) still books the next one for 09:00, not 11:10 tomorrow.
        notifier("2026-10-17T11:10").runDaily()
        val next = WorkManager.getInstance(app).getWorkInfosForUniqueWork(Notifier.WORK_LATER).get().single { it.state == WorkInfo.State.ENQUEUED }
        assertEquals((21L * 60 + 50) * 60 * 1000, next.initialDelayMillis)
    }

    private fun withLate(date: String, key: String, title: String, lateTitle: String) = JSONObject()
        .put("date", date).put("key", key).put("title", title).put("text", "on time")
        .put("late", JSONObject().put("title", lateTitle).put("text", "a day late"))

    @Test fun aDayAndroidSkippedIsPostedTheNextDayInItsLateWording() {
        notifier("2026-10-15T09:30").turnOn()
        val s = JSONObject().put("time", "09:00").put("entries", JSONArray()
            .put(withLate("2026-10-16", "pay:2026-10-17@2026-10-16", "Payday tomorrow", "Payday today"))
            .put(withLate("2026-10-17", "r:mot@2026-10-17", "Car MOT", "Car MOT"))).toString()
        notifier("2026-10-15T09:31").storeSchedule(s)
        // Android didn't run the check on the 16th; on the 17th both go out, the missed one reworded.
        assertEquals(2, notifier("2026-10-17T09:05").runDaily())
        val titles = nm.allNotifications.map { it.extras.getString(NotificationCompat.EXTRA_TITLE) to it.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString() }
        assertTrue(titles.contains("Payday today" to "a day late"))
        assertTrue(titles.contains("Car MOT" to "on time"))
        assertEquals("and never twice", 0, notifier("2026-10-17T10:00").runDaily())
    }

    @Test fun aLateRunJustAfterMidnightPostsWhatWasMissedStraightAway() {
        notifier("2026-10-15T09:30").turnOn()
        notifier("2026-10-15T09:31").storeSchedule(JSONObject().put("time", "22:00").put("entries", JSONArray()
            .put(withLate("2026-10-16", "pay:2026-10-17@2026-10-16", "Payday tomorrow", "Payday today"))
            .put(withLate("2026-10-17", "r:mot@2026-10-17", "Car MOT", "Car MOT"))).toString())
        // The 22:00 run on the 16th was delayed to 00:30: the missed entry goes out now, today's waits for 22:00.
        assertEquals(1, notifier("2026-10-17T00:30").runDaily())
        assertEquals("Payday today", nm.allNotifications.single().extras.getString(NotificationCompat.EXTRA_TITLE))
        assertEquals(1, notifier("2026-10-17T22:00").runDaily())
    }

    @Test fun switchingOnDoesntPostYesterdaysEntries() {
        val n = notifier("2026-10-17T09:05")
        n.storeSchedule(JSONObject().put("time", "09:00").put("entries", JSONArray()
            .put(withLate("2026-10-16", "pay:2026-10-17@2026-10-16", "Payday tomorrow", "Payday today"))).toString())
        n.turnOn()
        assertEquals(0, nm.allNotifications.size)
    }

    @Test fun theTimeStaysBetween6amAnd10pm() {
        val n = notifier()
        n.storeSchedule(schedule("23:30"))
        assertEquals("22:00", n.time().toString())
        n.storeSchedule(schedule("05:00"))
        assertEquals("06:00", n.time().toString())
    }

    @Test fun turningOnSchedulesADailyJobAndTurningOffCancelsIt() {
        val n = notifier()
        n.turnOn()
        assertTrue(n.enabled)
        val w = dailyWork()
        assertEquals(1, w.size)
        assertEquals(WorkInfo.State.ENQUEUED, w[0].state)
        assertTrue("periodic", w[0].periodicityInfo != null && w[0].periodicityInfo!!.repeatIntervalMillis == 24L * 60 * 60 * 1000)
        n.turnOff()
        assertFalse(n.enabled)
        assertEquals(WorkInfo.State.CANCELLED, dailyWork()[0].state)
    }

    @Test fun anEarlyRunWaitsForTheChosenTime() {
        val n = notifier("2026-10-16T06:30")
        n.storeSchedule(sample)
        n.turnOn()
        assertEquals(0, n.runDaily())
        assertEquals(0, nm.allNotifications.size)
        val later = WorkManager.getInstance(app).getWorkInfosForUniqueWork(Notifier.WORK_LATER).get()
        assertEquals(1, later.size)
        assertEquals(WorkInfo.State.ENQUEUED, later[0].state)
    }

    @Test fun switchingOnAsksForThePermissionAndTellsThePage() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val a = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        bridge.setNotificationsEnabled(true)
        shadowOf(Looper.getMainLooper()).idle()
        val ask = shadowOf(a).lastRequestedPermission
        assertTrue(ask.requestedPermissions.contains(Manifest.permission.POST_NOTIFICATIONS))
        // Refused: the switch stays off.
        @Suppress("DEPRECATION") a.onRequestPermissionsResult(ask.requestCode, ask.requestedPermissions, intArrayOf(PackageManager.PERMISSION_DENIED))
        assertEquals("window.paydayNativeEvent&&window.paydayNativeEvent(\"notify\",false,false)", shadowOf(a.web).lastEvaluatedJavascript)
        assertFalse(bridge.notificationsEnabled())
    }

    @Test fun switchingOnAndAllowingItTurnsNotificationsOn() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val a = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        bridge.setNotificationsEnabled(true)
        shadowOf(Looper.getMainLooper()).idle()
        val ask = shadowOf(a).lastRequestedPermission
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        @Suppress("DEPRECATION") a.onRequestPermissionsResult(ask.requestCode, ask.requestedPermissions, intArrayOf(PackageManager.PERMISSION_GRANTED))
        assertEquals("window.paydayNativeEvent&&window.paydayNativeEvent(\"notify\",true,true)", shadowOf(a.web).lastEvaluatedJavascript)
        assertTrue(bridge.notificationsEnabled() && bridge.notificationsAllowed())
        assertEquals(1, dailyWork().size)
        // Off again: no prompt, the job is cancelled.
        bridge.setNotificationsEnabled(false)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("window.paydayNativeEvent&&window.paydayNativeEvent(\"notify\",false,true)", shadowOf(a.web).lastEvaluatedJavascript)
        assertFalse(bridge.notificationsEnabled())
        assertEquals(WorkInfo.State.CANCELLED, dailyWork()[0].state)
    }

    @Test fun theBridgeStoresTheScheduleAndANewTimeMovesTheJob() {
        val a = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        bridge.setNotificationsEnabled(true)
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(bridge.setNotificationSchedule(sample))
        val first = dailyWork().single { it.state == WorkInfo.State.ENQUEUED }.id
        assertTrue(bridge.setNotificationSchedule(schedule("09:00")))
        assertEquals("same time: the job is left alone", first, dailyWork().single { it.state == WorkInfo.State.ENQUEUED }.id)
        assertTrue(bridge.setNotificationSchedule(schedule("18:30")))
        assertTrue("new time: the job is booked again", dailyWork().single { it.state == WorkInfo.State.ENQUEUED }.id != first)
    }

    @Test fun openingTheAppFromANotificationGoesToReminders() {
        val a = Robolectric.buildActivity(MainActivity::class.java, Intent(app, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN, "due")).setup().get()
        shadowOf(a.web).webViewClient.onPageFinished(a.web, MainActivity.START_URL)
        assertEquals("window.paydayNativeEvent&&window.paydayNativeEvent(\"open\",\"due\",true)", shadowOf(a.web).lastEvaluatedJavascript)
    }

    @Test fun theOnlyNewPermissionIsNotificationsAndThereIsNoExactAlarm() {
        val perms = app.packageManager.getPackageInfo(app.packageName, PackageManager.GET_PERMISSIONS).requestedPermissions?.toList() ?: emptyList()
        assertTrue(perms.contains(Manifest.permission.POST_NOTIFICATIONS))
        listOf(Manifest.permission.INTERNET, Manifest.permission.ACCESS_NETWORK_STATE, Manifest.permission.FOREGROUND_SERVICE,
            Manifest.permission.SCHEDULE_EXACT_ALARM, Manifest.permission.USE_EXACT_ALARM).forEach { assertFalse(it, perms.contains(it)) }
    }
}
