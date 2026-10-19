package uk.whiteboard.payday

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.graphics.Color
import androidx.core.graphics.drawable.toDrawable
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.IntentCompat
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.content.edit
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.Executors

class MainActivity : FragmentActivity(), NativeBridge.Host {

    lateinit var web: WebView
        private set
    private lateinit var root: FrameLayout
    private lateinit var cover: View
    private lateinit var coverTitle: TextView
    private lateinit var backCallback: OnBackPressedCallback
    private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }
    private val notifierInstance by lazy { Notifier(this) }

    /** True once the user has unlocked in this visit (or the lock is off). */
    internal var unlocked = false
    private var promptShowing = false
    private var stoppedAt = 0L

    /** True if this screen closed itself at once because Dovetail was already open in the same task. */
    internal var finishedAsDuplicate = false
        private set

    /** The page has loaded and can receive events. Messages that arrive earlier wait in [pendingJs]. */
    internal var pageReady = false
        private set
    /** Messages for the page that arrived before it finished loading. */
    private val pendingJs = ArrayList<String>()

    /** "Import a backup file…": the system file picker. No storage permission is needed for the file it returns. */
    private val openDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) deliverImport(ImportResult.Failed("cancelled")) else readImportAsync(uri)
    }

    /** Android 13+: the notification permission, asked for only when the user switches notifications on. */
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted && notifierInstance.allowed()) {
            notifierInstance.turnOn()
            notifyPage("notify", true, true)
        } else notifyPage("notify", false, false)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        applyEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Never a second copy of the page on top of the first (two copies could save over each other's data): if the
        // icon starts this screen (NEW_TASK) inside Dovetail's task that's already open, just show that one. Another app
        // starting Dovetail inside its own task (no NEW_TASK) still opens it.
        val i = intent
        if (!isTaskRoot && i != null && i.action == Intent.ACTION_MAIN && i.hasCategory(Intent.CATEGORY_LAUNCHER) &&
            (i.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0 &&
            !i.hasExtra(EXTRA_IMPORT) && !i.hasExtra(EXTRA_OPEN)) {
            finishedAsDuplicate = true
            finish()
            return
        }
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        root = FrameLayout(this)
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false      // the bundled page loads from assets, which doesn't need file access
            allowContentAccess = false
        }
        web.webViewClient = PaydayWebViewClient()
        web.addJavascriptInterface(NativeBridge(this, BackupStore(File(filesDir, BACKUP_DIR))), "PaydayNative")
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        cover = buildLockCover()
        root.addView(cover, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        applyThemeColours()

        // Edge to edge: pad the content clear of the status bar, navigation bar, cut-outs and the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }

        // Back: go back within the page (tabs), otherwise leave the app.
        backCallback = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, backCallback)

        unlocked = !lockEnabled()
        applySecureFlag()
        showCover(!unlocked)

        // Same URL as 1.0-1.3, so the page keeps the same storage origin and all saved data.
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(START_URL)
        // Opened with a backup file (tapped in WhatsApp, Files or email, or shared to Dovetail), or from a notification?
        if (savedInstanceState == null) handleIncoming(intent)
    }

    /** The app is already open: a backup file opened in another app (through [OpenFileActivity]) or a tapped notification. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (finishedAsDuplicate) return
        setIntent(intent)
        handleIncoming(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (finishedAsDuplicate) return
        web.saveState(outState)
    }

    override fun onStart() {
        super.onStart()
        if (finishedAsDuplicate) return
        if (lockEnabled() && unlocked && !promptShowing && stoppedAt > 0 &&
            SystemClock.elapsedRealtime() - stoppedAt >= RELOCK_AFTER_MS) unlocked = false
    }

    override fun onResume() {
        super.onResume()
        if (finishedAsDuplicate) return
        backCallback.isEnabled = true
        refreshInsets()
        if (lockEnabled() && !unlocked) {
            showCover(true)
            if (!lockAvailable()) {
                // The phone's screen lock was removed: don't lock the user out of their own data.
                unlocked = true
                showCover(false)
                Toast.makeText(this, R.string.lock_unavailable, Toast.LENGTH_LONG).show()
            } else if (!promptShowing) {
                authenticate(onSuccess = { unlocked = true; showCover(false) }, onFail = { })
            }
        } else showCover(false)
    }

    override fun onStop() {
        super.onStop()
        stoppedAt = SystemClock.elapsedRealtime()
    }

    // ---------------- NativeBridge.Host ----------------

    override fun runOnMain(block: () -> Unit) = runOnUiThread(block)

    override fun lockEnabled(): Boolean = prefs.getBoolean(KEY_LOCK, false)

    override fun lockAvailable(): Boolean =
        BiometricManager.from(this).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS

    override fun requestLockChange(enable: Boolean) {
        if (!enable) {
            prefs.edit { putBoolean(KEY_LOCK, false) }
            applySecureFlag()
            notifyPage("lock", false, true)
            return
        }
        if (!lockAvailable()) { notifyPage("lock", false, false); return }
        // Confirm the user can actually unlock before turning the lock on.
        authenticate(
            onSuccess = {
                prefs.edit { putBoolean(KEY_LOCK, true) }
                unlocked = true
                applySecureFlag()
                notifyPage("lock", true, true)
            },
            onFail = { notifyPage("lock", false, false) },
        )
    }

    override fun shareBackup(json: String, fileName: String) {
        val safe = safeFileName(fileName, ".json")
        shareFiles(listOf(NativeBridge.ShareFile(safe, "application/json", json)), getString(R.string.share_title))
    }

    override fun shareFiles(files: List<NativeBridge.ShareFile>) = shareFiles(files, getString(R.string.share_export_title))

    /** The month's transfers as plain text (a message, not a file), through the share sheet. */
    override fun shareText(text: String, title: String) {
        try {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
                putExtra(Intent.EXTRA_SUBJECT, title)
            }
            val chooser = Intent.createChooser(send, title)
                .putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(ComponentName(this, MainActivity::class.java)))
            startActivity(chooser)
        } catch (e: Exception) {
            android.util.Log.w("Dovetail", "Couldn't share text", e)
            Toast.makeText(this, R.string.share_failed, Toast.LENGTH_LONG).show()
        }
    }

    /** The email app, with a message to the support address. Without one, a message gives the address instead. */
    override fun sendFeedback(subject: String, body: String) {
        val mail = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$FEEDBACK_EMAIL")).apply {
            putExtra(Intent.EXTRA_EMAIL, arrayOf(FEEDBACK_EMAIL))
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
        }
        try {
            startActivity(mail)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, getString(R.string.feedback_no_email, FEEDBACK_EMAIL), Toast.LENGTH_LONG).show()
        }
    }

    /** Writes the files to the private share folder and opens the share sheet with read-only links to them. */
    private fun shareFiles(files: List<NativeBridge.ShareFile>, title: String) {
        try {
            val dir = File(cacheDir, SHARE_DIR)
            dir.deleteRecursively()
            dir.mkdirs()
            val uris = ArrayList<Uri>()
            files.forEach { f ->
                val name = safeFileName(f.name, extensionFor(f.mime))
                val file = File(dir, name)
                file.writeText(f.text)
                uris.add(FileProvider.getUriForFile(this, "$packageName.fileprovider", file))
            }
            val types = files.map { it.mime }.distinct()
            val send = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
                type = if (types.size == 1) types[0] else "text/*"
                if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                putExtra(Intent.EXTRA_SUBJECT, safeFileName(files[0].name, extensionFor(files[0].mime)))
                clipData = ClipData.newRawUri(null, uris[0]).also { c -> uris.drop(1).forEach { c.addItem(ClipData.Item(it)) } }
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            // Dovetail can open backups itself, so leave it out of its own share sheet.
            val chooser = Intent.createChooser(send, title)
                .putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(ComponentName(this, MainActivity::class.java)))
            startActivity(chooser)
        } catch (e: Exception) {
            android.util.Log.w("Dovetail", "Couldn't share", e)
            Toast.makeText(this, R.string.share_failed, Toast.LENGTH_LONG).show()
        }
    }

    override fun pickBackupFile() {
        try {
            openDocument.launch(arrayOf("application/json", "text/plain", "application/octet-stream"))
        } catch (e: ActivityNotFoundException) {
            deliverImport(ImportResult.Failed("nopicker"))
        }
    }

    // ---------------- opening backup files ----------------

    sealed class ImportResult {
        data class Ok(val text: String) : ImportResult()
        /** reason: "toobig", "notbackup", "unreadable", "nopicker" or "cancelled" */
        data class Failed(val reason: String) : ImportResult()
    }

    /**
     * A file handed over by [OpenFileActivity], a tapped notification, or (sent to this screen directly) VIEW/SEND.
     * Reopening from Recents replays the old intent with FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY: ignored.
     */
    internal fun handleIncoming(intent: Intent?) {
        if (intent == null || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return
        if (intent.getStringExtra(EXTRA_OPEN) == "due") {
            runWhenReady("window.paydayNativeEvent&&window.paydayNativeEvent(\"open\",\"due\",true)")
            return
        }
        if (intent.hasExtra(EXTRA_IMPORT)) {
            takeStashedImport(this, intent.getStringExtra(EXTRA_IMPORT))?.let { deliverImport(it) }
            return
        }
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.let { readImportAsync(it) }
            Intent.ACTION_SEND -> {
                val uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                when {
                    uri != null -> readImportAsync(uri)
                    text != null -> deliverImport(checkImport(text.toByteArray(Charsets.UTF_8)))
                }
            }
        }
    }

    private fun readImportAsync(uri: Uri) {
        ioExecutor.execute {
            val r = readImport(contentResolver, uri)
            runOnUiThread { deliverImport(r) }
        }
    }
    private fun deliverImport(r: ImportResult) {
        val (value, ok) = when (r) {
            is ImportResult.Ok -> r.text to true
            is ImportResult.Failed -> r.reason to false
        }
        runWhenReady("window.paydayNativeEvent&&window.paydayNativeEvent(\"import\",${jsString(value)},$ok)")
    }

    private fun runWhenReady(js: String) {
        if (pageReady) web.evaluateJavascript(js, null) else pendingJs.add(js)
    }

    // ---------------- reminder notifications ----------------

    override fun notifier(): Notifier = notifierInstance

    override fun requestNotifications(enable: Boolean) {
        if (!enable) {
            notifierInstance.turnOff()
            notifyPage("notify", false, true)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        if (!notifierInstance.allowed()) { notifyPage("notify", false, false); return }
        notifierInstance.turnOn()
        notifyPage("notify", true, true)
    }

    // ---------------- haptics ----------------

    /** Android's own haptic feedback: no permission needed, and it follows the phone's "touch feedback" setting. */
    override fun haptic(kind: String) {
        web.performHapticFeedback(hapticFor(kind))
    }

    // ---------------- appearance ----------------

    /** The theme chosen in Settings › Appearance: "system", "light" or "dark". */
    internal fun themePref(): String = normalTheme(prefs.getString(KEY_THEME, THEME_SYSTEM))

    private fun phoneIsDark(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    /** Whether the app is showing its dark colours now. */
    internal fun darkApplied(): Boolean = resolveDark(themePref(), phoneIsDark())

    override fun applyAppearance(theme: String) {
        val t = normalTheme(theme)
        if (t != themePref()) prefs.edit { putString(KEY_THEME, t) }
        applyEdgeToEdge()
        applyThemeColours()
    }

    /** Status and navigation bars: transparent, with light or dark icons to match the app's theme, not just the phone's. */
    private fun applyEdgeToEdge() {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { darkApplied() },
            navigationBarStyle = SystemBarStyle.auto(NAV_SCRIM_LIGHT, NAV_SCRIM_DARK) { darkApplied() },
        )
    }

    /** Window, page background and lock screen in the theme's colours, so nothing shows the wrong colour behind the page. */
    private fun applyThemeColours() {
        val dark = darkApplied()
        val bg = ContextCompat.getColor(this, if (dark) R.color.page_bg_dark else R.color.page_bg_light)
        val ink = ContextCompat.getColor(this, if (dark) R.color.page_ink_dark else R.color.page_ink_light)
        window.setBackgroundDrawable(bg.toDrawable())
        root.setBackgroundColor(bg)
        web.setBackgroundColor(bg)
        cover.setBackgroundColor(bg)
        coverTitle.setTextColor(ink)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    // ---------------- helpers ----------------

    /** Times the insets have been re-requested on resume (read by tests). */
    internal var insetRefreshes = 0
        private set

    /**
     * Coming back to the app (after the keyboard, another app or the lock screen) can leave stale insets behind,
     * for example a keyboard-sized gap. Ask for fresh ones so the page always gets the full, correct height.
     */
    private fun refreshInsets() {
        insetRefreshes++
        ViewCompat.requestApplyInsets(root)
    }

    private fun authenticate(onSuccess: () -> Unit, onFail: () -> Unit) {
        promptShowing = true
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                promptShowing = false
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                promptShowing = false
                onFail()
            }
            // onAuthenticationFailed (one bad fingerprint) keeps the prompt open, so nothing to do.
        })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.lock_prompt_title))
                .setSubtitle(getString(R.string.lock_prompt_subtitle))
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build()
        )
    }

    /** While the lock is on, hide the app's content from screenshots and the recent-apps preview. */
    private fun applySecureFlag() {
        if (lockEnabled()) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    private fun showCover(show: Boolean) {
        cover.visibility = if (show) View.VISIBLE else View.GONE
        web.visibility = if (show) View.INVISIBLE else View.VISIBLE
    }

    private fun notifyPage(type: String, value: Boolean, ok: Boolean) {
        web.evaluateJavascript("window.paydayNativeEvent&&window.paydayNativeEvent(${JSONObject.quote(type)},$value,$ok)", null)
    }

    private fun buildLockCover(): View {
        val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt() }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isClickable = true
            coverTitle = TextView(context).apply {
                setText(R.string.lock_title)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                gravity = Gravity.CENTER
            }
            addView(coverTitle)
            addView(Button(context).apply {
                id = R.id.unlock_button
                setText(R.string.lock_button)
                setOnClickListener {
                    if (!promptShowing) authenticate(onSuccess = { unlocked = true; showCover(false) }, onFail = { })
                }
            }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(24) })
        }
    }

    private inner class PaydayWebViewClient : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            pageReady = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            pageReady = true
            val waiting = pendingJs.toList()
            pendingJs.clear()
            waiting.forEach { web.evaluateJavascript(it, null) }
        }

        // Only the bundled page may load. Everything else (links, redirects) is refused.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !request.url.toString().startsWith(ASSET_PREFIX)

        // If the WebView's renderer crashes or is killed for memory, rebuild the screen instead of crashing.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            recreate()
            return true
        }
    }

    companion object {
        const val START_URL = "file:///android_asset/index.html"
        const val ASSET_PREFIX = "file:///android_asset/"
        const val PREFS = "payday"
        const val KEY_LOCK = "app_lock"
        const val KEY_THEME = "theme"
        const val THEME_SYSTEM = "system"
        private val NAV_SCRIM_LIGHT = Color.argb(0xe6, 0xff, 0xff, 0xff)
        private val NAV_SCRIM_DARK = Color.argb(0x80, 0x1b, 0x1b, 0x1b)

        fun hapticFor(kind: String): Int = when (kind) {
            "done" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS
            "untick" -> HapticFeedbackConstants.CLOCK_TICK
            else -> HapticFeedbackConstants.CONTEXT_CLICK
        }

        fun normalTheme(t: String?): String = if (t == "light" || t == "dark") t else THEME_SYSTEM

        /** "dark" and "light" are fixed; "system" follows the phone. */
        fun resolveDark(theme: String, phoneDark: Boolean): Boolean = when (normalTheme(theme)) {
            "dark" -> true
            "light" -> false
            else -> phoneDark
        }
        const val BACKUP_DIR = "backups"
        const val SHARE_DIR = "share"
        /** "Send feedback" goes here (2.9). The page shows the same address (FEEDBACK_EMAIL in web/src/export.js). */
        const val FEEDBACK_EMAIL = "dovetail.feedback@gmail.com"
        const val RELOCK_AFTER_MS = 60_000L
        const val MAX_IMPORT_BYTES = 2 * 1024 * 1024
        const val EXTRA_OPEN = "uk.whiteboard.payday.OPEN"

        const val EXTRA_IMPORT = "uk.whiteboard.payday.IMPORT"
        private const val STASH_DIR = "import"
        private val STASH_NAME = Regex("^incoming-\\d+\\.json$")

        /**
         * Reads at most [MAX_IMPORT_BYTES] from a content link and checks it's a Dovetail backup before anything else
         * happens. Only content:// links (what other apps hand over); anything else, such as a file:// path, is refused.
         */
        fun readImport(resolver: android.content.ContentResolver, uri: Uri): ImportResult {
            if (uri.scheme != "content") return ImportResult.Failed("unreadable")
            return try {
                resolver.openInputStream(uri)?.use { input ->
                    val out = ByteArrayOutputStream()
                    val chunk = ByteArray(16 * 1024)
                    var total = 0
                    while (true) {
                        val n = input.read(chunk)
                        if (n < 0) break
                        total += n
                        if (total > MAX_IMPORT_BYTES) return ImportResult.Failed("toobig")
                        out.write(chunk, 0, n)
                    }
                    checkImport(out.toByteArray())
                } ?: ImportResult.Failed("unreadable")
            } catch (e: Exception) {
                ImportResult.Failed("unreadable")
            }
        }

        /**
         * Hands a read file from [OpenFileActivity] to this screen through a private file (too big for an Intent): its
         * own name each time, written completely before it appears, read once. Returns the name.
         */
        fun stashImport(ctx: android.content.Context, r: ImportResult): String {
            val dir = File(ctx.noBackupFilesDir, STASH_DIR)
            dir.mkdirs()
            // Hand-offs nobody collected (Dovetail closed in between) are cleared after an hour.
            dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 3_600_000L }?.forEach { it.delete() }
            val name = "incoming-${System.nanoTime()}.json"
            val o = when (r) {
                is ImportResult.Ok -> JSONObject().put("ok", true).put("value", r.text)
                is ImportResult.Failed -> JSONObject().put("ok", false).put("value", r.reason)
            }
            val tmp = File(dir, "$name.tmp")
            tmp.writeText(o.toString())
            if (!tmp.renameTo(File(dir, name))) tmp.delete()
            return name
        }

        fun takeStashedImport(ctx: android.content.Context, name: String?): ImportResult? {
            if (name == null || !STASH_NAME.matches(name)) return null
            val f = File(File(ctx.noBackupFilesDir, STASH_DIR), name)
            if (!f.isFile) return null
            return try {
                val o = JSONObject(f.readText())
                if (o.getBoolean("ok")) ImportResult.Ok(o.getString("value")) else ImportResult.Failed(o.getString("value"))
            } catch (e: Exception) {
                ImportResult.Failed("unreadable")
            } finally {
                f.delete()
            }
        }

        /** Where files are read. Tests swap in a direct executor. */
        internal var ioExecutor: Executor = Executors.newSingleThreadExecutor()

        fun checkImport(bytes: ByteArray): ImportResult {
            if (bytes.size > MAX_IMPORT_BYTES) return ImportResult.Failed("toobig")
            val text = String(bytes, Charsets.UTF_8).removePrefix("\uFEFF")
            return if (BackupStore.looksLikeBackup(text)) ImportResult.Ok(text) else ImportResult.Failed("notbackup")
        }

        fun safeFileName(name: String, ext: String): String =
            name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).let { if (it.endsWith(ext)) it else "$it$ext" }

        fun extensionFor(mime: String) = when (mime) {
            "text/markdown" -> ".md"
            "text/csv" -> ".csv"
            "application/json" -> ".json"
            else -> ".txt"
        }

        /** A JavaScript string literal (JSON is one, apart from two line-separator characters). */
        fun jsString(s: String): String = JSONObject.quote(s).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        const val AUTHENTICATORS = BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    }
}
