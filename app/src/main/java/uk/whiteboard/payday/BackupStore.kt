package uk.whiteboard.payday

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Clock
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Rolling JSON backups in app-private storage (files/backups/).
 *
 * Each backup is the same JSON the app's "Copy backup" produces. A new file is written only when the
 * content has changed. Kept: the [KEEP_LATEST] newest files, plus the newest file from each of the last
 * [KEEP_DAYS] days, so a bad edit session can't push every older day out. A backup saved just before a restore or an
 * opened backup file replaces everything is "kept" (name ends -keep) for [KEEP_PINNED_DAYS] days, however many
 * changes follow, so the replacement can always be undone.
 */
class BackupStore(private val dir: File, private val clock: Clock = Clock.systemDefaultZone()) {

    data class Entry(val name: String, val savedAt: LocalDateTime, val bytes: Long, val kept: Boolean = false)

    /**
     * Writes [json] as a new backup. Returns the file name, or null if it was unchanged or not a Dovetail backup.
     * keep: the backup made just before a restore; written even if unchanged, and kept for [KEEP_PINNED_DAYS] days.
     */
    @Synchronized
    fun save(json: String, keep: Boolean = false): String? {
        if (json.length > MAX_CHARS || !looksLikeBackup(json)) return null
        dir.mkdirs()
        val latest = list().firstOrNull()
        if (!keep && latest != null && sameContent(File(dir, latest.name).readText(), json)) return null
        val name = "backup-" + LocalDateTime.now(clock).format(STAMP) + (if (keep) "-keep" else "") + ".json"
        val tmp = File(dir, "$name.tmp")
        tmp.writeText(json)
        val target = File(dir, name)
        if (!tmp.renameTo(target)) {
            target.delete()
            if (!tmp.renameTo(target)) { tmp.delete(); return null }
        }
        prune()
        return name
    }

    /** Newest first. */
    @Synchronized
    fun list(): List<Entry> = (dir.listFiles() ?: emptyArray())
        .mapNotNull { f ->
            NAME.matchEntire(f.name)?.let { m ->
                Entry(f.name, LocalDateTime.parse(m.groupValues[1] + "-" + m.groupValues[2], STAMP), f.length(), m.groupValues[3].isNotEmpty())
            }
        }
        .sortedByDescending { it.name }

    /** Reads one backup by file name. Only names this class writes are accepted, so no path tricks. */
    @Synchronized
    fun read(name: String): String? {
        if (!isValidName(name)) return null
        val f = File(dir, name)
        return if (f.isFile) f.readText() else null
    }

    @Synchronized
    fun prune() {
        val all = list()
        val keep = HashSet<String>()
        all.take(KEEP_LATEST).forEach { keep += it.name }
        val firstDay = LocalDate.now(clock).minusDays((KEEP_DAYS - 1).toLong())
        all.groupBy { it.savedAt.toLocalDate() }
            .filterKeys { !it.isBefore(firstDay) }
            .values.forEach { day -> keep += day.maxBy { it.name }.name }
        val keptFrom = LocalDate.now(clock).minusDays(KEEP_PINNED_DAYS.toLong())
        all.filter { it.kept && !it.savedAt.toLocalDate().isBefore(keptFrom) }.take(KEEP_PINNED_MAX).forEach { keep += it.name }
        all.filter { it.name !in keep }.forEach { File(dir, it.name).delete() }
        dir.listFiles()?.filter { it.name.endsWith(".tmp") }?.forEach { it.delete() }
    }

    fun listJson(): String {
        val arr = JSONArray()
        list().forEach {
            arr.put(JSONObject().put("name", it.name).put("savedAt", it.savedAt.toString()).put("bytes", it.bytes).put("kept", it.kept))
        }
        return arr.toString()
    }

    companion object {
        const val KEEP_LATEST = 10
        const val KEEP_DAYS = 14
        const val KEEP_PINNED_DAYS = 30
        const val KEEP_PINNED_MAX = 5
        const val MAX_CHARS = 5 * 1024 * 1024
        private val NAME = Regex("""^backup-(\d{8})-(\d{6})(-keep)?\.json$""")
        private val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")

        fun isValidName(name: String) = NAME.matches(name)

        /** Two backups are the same if they differ only in their "savedAt" time. */
        fun sameContent(a: String, b: String): Boolean = try {
            val x = JSONObject(a).apply { remove("savedAt") }
            val y = JSONObject(b).apply { remove("savedAt") }
            x.toString() == y.toString()
        } catch (e: Exception) {
            a == b
        }

        fun looksLikeBackup(json: String): Boolean = try {
            val o = JSONObject(json)
            o.optString("app") == "payday-transfers" && o.optJSONObject("config") != null
        } catch (e: Exception) {
            false
        }
    }
}
