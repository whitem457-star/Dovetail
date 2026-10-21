package uk.whiteboard.payday

import android.webkit.JavascriptInterface
import org.json.JSONArray

/**
 * The page's window.PaydayNative object. Kept deliberately small: backups, sharing and importing files, sharing the
 * month's transfers as text (with an update file), sending feedback by email, the app lock, the theme and reminder notifications.
 * Only the app's own bundled page is ever loaded (navigation elsewhere is blocked), so nothing else can
 * call these methods. They run on WebView's background thread; UI work is posted to the main thread.
 */
class NativeBridge(private val host: Host, private val store: BackupStore) {

    interface Host {
        fun shareBackup(json: String, fileName: String)
        fun shareFiles(files: List<ShareFile>)
        fun shareText(text: String, title: String)
        fun shareUpdate(json: String, fileName: String, text: String, title: String)
        fun sendFeedback(subject: String, body: String)
        fun pickBackupFile()
        fun lockAvailable(): Boolean
        fun lockEnabled(): Boolean
        fun requestLockChange(enable: Boolean)
        fun applyAppearance(theme: String)
        fun haptic(kind: String)
        fun requestNotifications(enable: Boolean)
        fun notifier(): Notifier
        fun runOnMain(block: () -> Unit)
    }

    @JavascriptInterface
    fun saveBackup(json: String): Boolean = store.save(json) != null

    /** Just before a restore or an opened backup file replaces everything: a backup kept for 30 days whatever follows. */
    @JavascriptInterface
    fun keepBackup(json: String): Boolean = store.save(json, keep = true) != null

    @JavascriptInterface
    fun listBackups(): String = store.listJson()

    @JavascriptInterface
    fun readBackup(name: String): String = store.read(name) ?: ""

    @JavascriptInterface
    fun share(json: String, fileName: String): Boolean {
        if (!BackupStore.looksLikeBackup(json)) return false
        host.runOnMain { host.shareBackup(json, fileName) }
        return true
    }

    /**
     * Exports (Settings › Backup, export & restore): [{"name": "dovetail-analysis-2026-10-16.md", "mime": "text/markdown",
     * "text": "..."}], one or two files, shared together through the share sheet.
     */
    @JavascriptInterface
    fun shareFiles(json: String): Boolean {
        val files = parseShareFiles(json) ?: return false
        host.runOnMain { host.shareFiles(files) }
        return true
    }

    /**
     * The Pay tab's "Share" (2.7): this month's transfers as plain text, for a message to the other person. Text only
     * (no file), at most [MAX_TEXT_CHARS]; anything else is refused.
     */
    @JavascriptInterface
    fun shareText(text: String, title: String): Boolean {
        if (text.isBlank() || text.length > MAX_TEXT_CHARS) return false
        host.runOnMain { host.shareText(text, title.take(200)) }
        return true
    }

    /**
     * "Send an update for the other phone" from the Pay tab's Share (2.10; a choice of its own since 2.10.1): the month's transfers as the message, with the whole backup
     * attached as an update file for the other phone to open. The file must be a backup no bigger than the other phone
     * will open ([MainActivity.MAX_IMPORT_BYTES]) and the text at most [MAX_TEXT_CHARS]; anything else is refused (the
     * page then says it couldn't prepare the file).
     */
    @JavascriptInterface
    fun shareUpdate(json: String, fileName: String, text: String, title: String): Boolean {
        if (json.length > MainActivity.MAX_IMPORT_BYTES || json.toByteArray(Charsets.UTF_8).size > MainActivity.MAX_IMPORT_BYTES) return false
        if (!BackupStore.looksLikeBackup(json)) return false
        if (text.isBlank() || text.length > MAX_TEXT_CHARS) return false
        host.runOnMain { host.shareUpdate(json, fileName, text, title.take(200)) }
        return true
    }

    /**
     * "Send feedback" (2.9): opens the email app with a message to the support address, the app details as its text.
     * The page only chooses the subject and text; the address is the app's own ([MainActivity.FEEDBACK_EMAIL]).
     */
    @JavascriptInterface
    fun sendFeedback(subject: String, body: String): Boolean {
        if (body.isBlank() || body.length > MAX_TEXT_CHARS) return false
        host.runOnMain { host.sendFeedback(subject.take(200), body) }
        return true
    }

    /** "Import a backup file…": opens the system file picker. The file comes back as paydayNativeEvent("import", text, ok). */
    @JavascriptInterface
    fun pickBackupFile() {
        host.runOnMain { host.pickBackupFile() }
    }

    @JavascriptInterface
    fun lockAvailable(): Boolean = host.lockAvailable()

    @JavascriptInterface
    fun lockEnabled(): Boolean = host.lockEnabled()

    /** Turning the lock on asks for a fingerprint/PIN first; the result comes back as paydayNativeEvent("lock", on, ok). */
    @JavascriptInterface
    fun setLockEnabled(enable: Boolean) {
        host.runOnMain { host.requestLockChange(enable) }
    }

    /** Settings › Appearance: "system", "light" or "dark". Stored by the app so its window matches from the next start. */
    @JavascriptInterface
    fun setTheme(theme: String) {
        host.runOnMain { host.applyAppearance(theme) }
    }

    /** Turning notifications on asks for Android's permission first; the result comes back as paydayNativeEvent("notify", on, ok). */
    @JavascriptInterface
    fun setNotificationsEnabled(enable: Boolean) {
        host.runOnMain { host.requestNotifications(enable) }
    }

    @JavascriptInterface
    fun notificationsEnabled(): Boolean = host.notifier().enabled

    @JavascriptInterface
    fun notificationsAllowed(): Boolean = host.notifier().allowed()

    /** What to notify over the next 90 days, worked out by the page: {"time": "09:00", "entries": [...]}. */
    @JavascriptInterface
    fun setNotificationSchedule(json: String): Boolean = host.notifier().storeSchedule(json)

    /** A light tap when a transfer is ticked ("tick"), unticked ("untick") or the last one is done ("done"). */
    @JavascriptInterface
    fun haptic(kind: String) {
        host.runOnMain { host.haptic(kind) }
    }

    data class ShareFile(val name: String, val mime: String, val text: String)

    companion object {
        const val MAX_SHARE_CHARS = 5 * 1024 * 1024
        const val MAX_TEXT_CHARS = 20_000
        private val MIMES = setOf("text/markdown", "text/csv", "text/plain", "application/json")

        /** One or two text files with a known type and a reasonable size; anything else is refused. */
        fun parseShareFiles(json: String): List<ShareFile>? = try {
            val a = JSONArray(json)
            if (a.length() !in 1..2) null
            else (0 until a.length()).map { i ->
                val o = a.getJSONObject(i)
                val mime = o.getString("mime")
                val text = o.getString("text")
                require(mime in MIMES && text.length <= MAX_SHARE_CHARS)
                ShareFile(o.getString("name"), mime, text)
            }
        } catch (e: Exception) {
            null
        }
    }
}
