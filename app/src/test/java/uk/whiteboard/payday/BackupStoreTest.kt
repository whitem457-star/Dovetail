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
import java.time.LocalDateTime
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
        // 10 newest = last 3 days' 9 changes + 1 from the day before; then one per day back to 14 days.
        assertEquals(10 + (14 - 4), names.size)
        assertEquals(14, days.size)
        assertTrue("the newest is always kept", names.first().startsWith("backup-20261014-16"))
        assertTrue("nothing older than 14 days", days.all { !it.isBefore(clock.now.toLocalDate().minusDays(13)) })
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
