package uk.whiteboard.payday

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZoneOffset

/** Runs under Robolectric only so org.json behaves exactly as on a phone. */
@RunWith(RobolectricTestRunner::class)
class BackupStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    /** A clock we can move forward by hand. */
    private class TestClock(var now: LocalDateTime) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
        override fun instant(): Instant = now.toInstant(ZoneOffset.UTC)
    }

    private fun backup(food: Int, savedAt: String = "2026-10-16T09:00:00Z") =
        """{"app":"payday-transfers","version":3,"savedAt":"$savedAt","config":{"bills":[],"budget":{"food":$food}},"months":{},"wealth":{}}"""

    @Test fun savesAndReadsBack() {
        val clock = TestClock(LocalDateTime.of(2026, 10, 16, 9, 14, 5))
        val store = BackupStore(File(tmp.root, "backups"), clock)
        val name = store.save(backup(600))
        assertEquals("backup-20261016-091405.json", name)
        assertEquals(backup(600), store.read(name!!))
        assertEquals(1, store.list().size)
    }

    @Test fun skipsWhenOnlyTheTimestampChanged() {
        val clock = TestClock(LocalDateTime.of(2026, 10, 16, 9, 0, 0))
        val store = BackupStore(File(tmp.root, "b"), clock)
        assertNotNull(store.save(backup(600, "2026-10-16T09:00:00Z")))
        clock.now = clock.now.plusMinutes(5)
        assertNull("same data, new savedAt: no new file", store.save(backup(600, "2026-10-16T09:05:00Z")))
        assertNotNull("changed data: new file", store.save(backup(650, "2026-10-16T09:05:00Z")))
        assertEquals(2, store.list().size)
    }

    @Test fun rejectsAnythingThatIsNotADovetailBackup() {
        val store = BackupStore(File(tmp.root, "b"))
        assertNull(store.save("not json"))
        assertNull(store.save("""{"app":"something-else","config":{}}"""))
        assertNull(store.save("""{"app":"payday-transfers"}"""))
        assertTrue(store.list().isEmpty())
    }

    @Test fun readOnlyAcceptsItsOwnFileNames() {
        val dir = File(tmp.root, "b")
        val store = BackupStore(dir)
        File(tmp.root, "secret.json").writeText("{}")
        assertNull(store.read("../secret.json"))
        assertNull(store.read("backup-20261016-091405.json/../../secret.json"))
        assertNull(store.read("anything.json"))
        assertFalse(BackupStore.isValidName("backup-2026-10-16.json"))
    }

    @Test fun keepsTenNewestPlusOnePerDayForFourteenDays() {
        val clock = TestClock(LocalDateTime.of(2026, 9, 20, 8, 0, 0))
        val store = BackupStore(File(tmp.root, "b"), clock)
        var food = 0
        // 25 days, three changes a day.
        repeat(25) {
            repeat(3) { i ->
                clock.now = clock.now.withHour(8 + i * 4)
                store.save(backup(food++))
            }
            clock.now = clock.now.plusDays(1)
        }
        clock.now = clock.now.minusDays(1) // "today" is the last day written
        store.prune()
        val names = store.list().map { it.name }
        val days = store.list().map { it.savedAt.toLocalDate() }.toSet()
        // 10 newest = last 3 days' 9 changes + 1 from the day before; then one per day back to 14 days; then September's
        // newest (the month's last day) for the monthly rule.
        assertEquals(10 + (14 - 4) + 1, names.size)
        assertEquals(15, days.size)
        assertTrue("the newest is always kept", names.first().startsWith("backup-20261014-16"))
        assertEquals("before the 14 days, only September's newest", listOf("backup-20260930-160000.json"),
            store.list().filter { it.savedAt.toLocalDate().isBefore(clock.now.toLocalDate().minusDays(13)) }.map { it.name })
    }

    @Test fun keepsTheNewestOfEachMonthForTwelveMonths() {
        val clock = TestClock(LocalDateTime.of(2025, 6, 1, 8, 0, 0))
        val store = BackupStore(File(tmp.root, "b"), clock)
        var food = 0
        // Every day for 16 months, two changes a day (June 2025 to September 2026).
        while (clock.now.isBefore(LocalDateTime.of(2026, 10, 1, 0, 0))) {
            clock.now = clock.now.withHour(8); store.save(backup(food++))
            clock.now = clock.now.withHour(20); store.save(backup(food++))
            clock.now = clock.now.plusDays(1).withHour(8)
        }
        clock.now = LocalDateTime.of(2026, 9, 30, 21, 0)
        store.prune()
        val list = store.list()
        val olderThanDays = list.filter { it.savedAt.toLocalDate().isBefore(LocalDate.of(2026, 9, 17)) }.map { it.name }.sorted()
        // October 2025 to August 2026: each month's last backup (the evening of its last day). September is covered by
        // the daily rule; May 2025 and earlier are more than 12 months back.
        val expected = (0L until 11L).map { YearMonth.of(2025, 10).plusMonths(it) }.map { "backup-" + it.atEndOfMonth().toString().replace("-", "") + "-200000.json" }
        assertEquals(expected, olderThanDays)
        assertFalse("nothing from before the 12 months", list.any { it.savedAt.isBefore(LocalDateTime.of(2025, 10, 1, 0, 0)) })
        // A month later the oldest goes.
        clock.now = LocalDateTime.of(2026, 10, 15, 9, 0); store.save(backup(food++))
        assertFalse(store.list().any { YearMonth.from(it.savedAt) == YearMonth.of(2025, 10) })
        assertTrue(store.list().any { YearMonth.from(it.savedAt) == YearMonth.of(2025, 11) })
    }

    @Test fun upToTwentyKeptBackupsSurviveForThirtyDays() {
        val clock = TestClock(LocalDateTime.of(2026, 10, 1, 9, 0, 0))
        val store = BackupStore(File(tmp.root, "b"), clock)
        val kept = mutableListOf<String>()
        // A kept backup every day for 25 days, each followed by many ordinary changes.
        var food = 0
        repeat(25) {
            clock.now = clock.now.withHour(9); kept += store.save(backup(food++), keep = true)!!
            repeat(12) { i -> clock.now = clock.now.withHour(10).plusMinutes(i.toLong()); store.save(backup(food++)) }
            clock.now = clock.now.plusDays(1)
        }
        val left = store.list().filter { it.kept }.map { it.name }
        assertEquals("the 20 newest kept backups are all there, and only those (the five oldest have gone)", kept.takeLast(20).sorted(), left.sorted())
        assertEquals(BackupStore.KEEP_PINNED_MAX, 20)
    }

    @Test fun listJsonDescribesEachBackup() {
        val clock = TestClock(LocalDateTime.of(2026, 10, 16, 9, 14, 5))
        val store = BackupStore(File(tmp.root, "b"), clock)
        store.save(backup(600))
        val arr = JSONArray(store.listJson())
        assertEquals(1, arr.length())
        val o = arr.getJSONObject(0)
        assertEquals("backup-20261016-091405.json", o.getString("name"))
        assertEquals("2026-10-16T09:14:05", o.getString("savedAt"))
        assertTrue(o.getLong("bytes") > 0)
    }

    @Test fun aBackupKeptBeforeARestoreSurvivesManyChangesForThirtyDays() {
        val clock = TestClock(LocalDateTime.of(2026, 10, 16, 9, 0, 0))
        val store = BackupStore(File(tmp.root, "backups"), clock)
        store.save(backup(500))
        clock.now = clock.now.plusSeconds(1)
        val kept = store.save(backup(500), keep = true)
        assertNotNull("written even though nothing changed", kept)
        assertTrue(kept!!.endsWith("-keep.json"))
        for (i in 1..15) { clock.now = clock.now.plusSeconds(1); store.save(backup(600 + i)) }
        assertTrue("still there after 15 more changes the same day", store.list().any { it.name == kept && it.kept })
        assertTrue(JSONArray(store.listJson()).let { a -> (0 until a.length()).any { a.getJSONObject(it).getBoolean("kept") } })
        assertNotNull(store.read(kept))
        clock.now = clock.now.plusDays(31)
        store.save(backup(999))
        assertFalse("gone after 30 days", store.list().any { it.name == kept })
    }
}
