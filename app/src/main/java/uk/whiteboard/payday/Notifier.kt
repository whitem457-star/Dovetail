package uk.whiteboard.payday

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONObject
import java.time.Clock
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Reminder notifications. The page works out what to notify and when (notificationSchedule in analysis.js) and
 * sends the list here; this class stores it, and a daily WorkManager job posts each day's entries once.
 * Local only: nothing goes over the network. Off until the user turns it on and Android allows notifications.
 */
class Notifier(private val ctx: Context, private val clock: Clock = Clock.systemDefaultZone()) {

    /** One notification on [date]; [lateTitle]/[lateText] word it for the day after, if Android only runs the check then. */
    data class Entry(val date: String, val key: String, val title: String, val text: String, val lateTitle: String? = null, val lateText: String? = null)

    private val prefs = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)

    /** The user's switch in Settings › Reminders & notifications. */
    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ON, false)
        private set(v) = prefs.edit { putBoolean(KEY_ON, v) }

    /** Whether Android lets Dovetail show notifications (the permission on Android 13+, and the app's notification switch). */
    fun allowed(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    /** Switched on: book the daily job, and if today's time has already passed, post today's entries now. */
    fun turnOn() {
        if (!enabled) prefs.edit { putString(KEY_SINCE, LocalDate.now(clock).toString()) }
        enabled = true
        ensureChannel()
        scheduleDaily(replace = true)
        runDaily()
    }

    fun turnOff() {
        enabled = false
        WorkManager.getInstance(ctx).apply {
            cancelUniqueWork(WORK_DAILY)
            cancelUniqueWork(WORK_LATER)
        }
    }

    /** Stores the schedule from the page. A new time of day moves the daily job. Returns false for anything malformed. */
    fun storeSchedule(json: String): Boolean {
        if (json.length > MAX_SCHEDULE_CHARS) return false
        val parsed = try { parse(json) } catch (e: Exception) { null } ?: return false
        val oldTime = time()
        prefs.edit { putString(KEY_SCHEDULE, json) }
        if (enabled && parsed.first != oldTime) {
            scheduleDaily(replace = true)
            runDaily()
        }
        return true
    }

    /** The time of day notifications are posted (from the schedule), 09:00 if there isn't one. */
    fun time(): LocalTime = prefs.getString(KEY_SCHEDULE, null)?.let { try { parse(it).first } catch (e: Exception) { null } } ?: DEFAULT_TIME

    fun entries(): List<Entry> = prefs.getString(KEY_SCHEDULE, null)?.let { try { parse(it).second } catch (e: Exception) { null } } ?: emptyList()

    /** Keys already posted ("date|key"), so a re-run never repeats a notification. */
    fun postedKeys(): Set<String> = prefs.getStringSet(KEY_POSTED, emptySet())!!.toSet()

    /**
     * The daily job. Does nothing while switched off or not allowed. WorkManager's timing is inexact and its daily
     * job drifts later, so every run also books a one-off run for the next chosen time: more than an hour early, it
     * books today's and posts nothing; otherwise it posts today's entries and books tomorrow's. The daily job stays
     * as the safety net (and carries on after a restart). Returns how many it posted.
     */
    fun runDaily(): Int {
        if (!enabled || !allowed()) return 0
        val now = ZonedDateTime.now(clock)
        val today = now.toLocalDate().atTime(time()).atZone(now.zone)
        if (now.isBefore(today.minusHours(1))) {
            // Early in the day: anything missed yesterday goes out now (in its late wording); today's wait for the time.
            val late = postDue(now.toLocalDate(), lateOnly = true)
            bookNext(now, today)
            return late
        }
        val n = postDue(now.toLocalDate())
        bookNext(now, now.toLocalDate().plusDays(1).atTime(time()).atZone(now.zone))
        return n
    }

    private fun bookNext(now: ZonedDateTime, at: ZonedDateTime) {
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK_LATER, ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<ReminderWorker>().setInitialDelay(Duration.between(now, at)).build())
    }

    /**
     * Posts the entries dated [today] that haven't been posted yet. Entries from yesterday that were missed (Android
     * can delay the check past midnight for apps that aren't opened often) are posted too, in their "late" wording,
     * but never from before notifications were switched on.
     */
    fun postDue(today: LocalDate, lateOnly: Boolean = false): Int {
        if (!enabled || !allowed()) return 0
        ensureChannel()
        val day = today.toString()
        val yesterday = today.minusDays(1).toString()
        val since = prefs.getString(KEY_SINCE, day) ?: day
        val posted = postedKeys().filter { it.substringBefore('|') >= today.minusDays(KEEP_POSTED_DAYS).toString() }.toMutableSet()
        var n = 0
        entries().forEach { e ->
            val late = e.date == yesterday && yesterday >= since && e.lateText != null
            if (((e.date == day && !lateOnly) || late) && "${e.date}|${e.key}" !in posted) {
                val shown = if (late) e.copy(title = e.lateTitle ?: e.title, text = e.lateText!!) else e
                if (post(shown)) {
                    posted.add("${e.date}|${e.key}")
                    n++
                }
            }
        }
        prefs.edit { putStringSet(KEY_POSTED, posted) }
        return n
    }

    private fun post(e: Entry): Boolean {
        if (!allowed()) return false
        // MAIN/LAUNCHER like the app icon, so a Dovetail started from a notification is the same task the icon opens.
        val open = Intent(ctx, MainActivity::class.java)
            .setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            .putExtra(MainActivity.EXTRA_OPEN, "due")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val id = e.key.hashCode()
        val tap = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        // On a locked screen, Android shows this instead unless the user allows sensitive notifications there.
        val public = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_payday)
            .setContentTitle(ctx.getString(R.string.app_name))
            .setContentText(ctx.getString(R.string.notify_public))
            .build()
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_payday)
            .setContentTitle(e.title)
            .setContentText(e.text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(e.text))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(public)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        return try {
            NotificationManagerCompat.from(ctx).notify(id, n)
            true
        } catch (se: SecurityException) {
            false
        }
    }

    fun ensureChannel() {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, ctx.getString(R.string.notify_channel), NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = ctx.getString(R.string.notify_channel_description)
            })
        }
    }

    /** A daily job, first run at the chosen time. Inexact by design (no exact-alarm permission). Survives reboot. */
    private fun scheduleDaily(replace: Boolean) {
        val now = ZonedDateTime.now(clock)
        var next = now.toLocalDate().atTime(time()).atZone(now.zone)
        if (!next.isAfter(now)) next = now.toLocalDate().plusDays(1).atTime(time()).atZone(now.zone)
        val req = PeriodicWorkRequestBuilder<ReminderWorker>(1, TimeUnit.DAYS)
            .setInitialDelay(Duration.between(now, next))
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK_DAILY,
            if (replace) ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE else ExistingPeriodicWorkPolicy.KEEP, req)
    }

    companion object {
        const val CHANNEL = "reminders"
        const val WORK_DAILY = "payday-reminders-daily"
        const val WORK_LATER = "payday-reminders-later"
        const val KEY_ON = "notify_on"
        const val KEY_SCHEDULE = "notify_schedule"
        const val KEY_POSTED = "notify_posted"
        const val KEY_SINCE = "notify_since"
        const val MAX_SCHEDULE_CHARS = 512 * 1024
        const val KEEP_POSTED_DAYS = 100L
        val DEFAULT_TIME: LocalTime = LocalTime.of(9, 0)
        /** Notifications go out between 06:00 and 22:00, well clear of midnight (a late run could miss its day). */
        val EARLIEST: LocalTime = LocalTime.of(6, 0)
        val LATEST: LocalTime = LocalTime.of(22, 0)
        private val TIME = Regex("""^([01]\d|2[0-3]):([0-5]\d)$""")
        private val DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")

        /** {"time": "09:00", "entries": [{"date", "key", "title", "text"}]} → (time, entries). Throws if malformed. */
        fun parse(json: String): Pair<LocalTime, List<Entry>> {
            val o = JSONObject(json)
            val t = (TIME.matchEntire(o.optString("time"))?.let { LocalTime.of(it.groupValues[1].toInt(), it.groupValues[2].toInt()) } ?: DEFAULT_TIME)
                .let { if (it.isBefore(EARLIEST)) EARLIEST else if (it.isAfter(LATEST)) LATEST else it }
            val a = o.getJSONArray("entries")
            val list = (0 until a.length()).map { i ->
                val e = a.getJSONObject(i)
                val d = e.getString("date")
                require(DATE.matches(d))
                val late = e.optJSONObject("late")
                Entry(d, e.getString("key").take(200), e.getString("title").take(200), e.getString("text").take(1000),
                    late?.optString("title")?.takeIf { it.isNotEmpty() }?.take(200), late?.optString("text")?.takeIf { it.isNotEmpty() }?.take(1000))
            }
            return t to list
        }
    }
}
