package uk.whiteboard.payday

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.File
import java.util.concurrent.Executor

/** Opening a backup file from another app, the file picker import, and sharing exports. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ImportTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private val backup = """{"app":"payday-transfers","version":5,"savedAt":"2026-10-16T10:00:00.000Z","config":{"bills":[],"people":[]},"months":{}}"""
    private val uri = Uri.parse("content://com.example.chat.provider/media/dovetail-backup.json")

    @Before fun setUp() {
        MainActivity.ioExecutor = Executor { it.run() }
        val f = androidx.core.content.FileProvider::class.java.getDeclaredField("sCache")
        f.isAccessible = true
        (f.get(null) as MutableMap<*, *>).clear()
    }

    private fun file(bytes: ByteArray) = shadowOf(ctx.contentResolver).registerInputStream(uri, ByteArrayInputStream(bytes))
    private fun launchWith(intent: Intent) = Robolectric.buildActivity(MainActivity::class.java, intent).setup().get()
    private fun pageLoaded(a: MainActivity) = shadowOf(a.web).webViewClient.onPageFinished(a.web, MainActivity.START_URL)
    private fun lastJs(a: MainActivity): String? = shadowOf(a.web).lastEvaluatedJavascript
    private fun event(value: String, ok: Boolean) = "window.paydayNativeEvent&&window.paydayNativeEvent(\"import\",${JSONObject.quote(value)},$ok)"
    private fun view() = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/json")

    @Test fun aBackupFileOpenedFromAnotherAppReachesThePageOnceItHasLoaded() {
        file(backup.toByteArray())
        val a = launchWith(view())
        assertFalse("nothing is sent before the page can receive it", lastJs(a)?.contains("\"import\"") == true)
        pageLoaded(a)
        assertEquals(event(backup, true), lastJs(a))
    }

    @Test fun aFileThatIsntADovetailBackupIsRefused() {
        file("""{"hello":1}""".toByteArray())
        val a = launchWith(view())
        pageLoaded(a)
        assertEquals(event("notbackup", false), lastJs(a))
    }

    @Test fun filesOverTwoMegabytesAreRefusedWithoutReadingThemAll() {
        val big = ByteArray(MainActivity.MAX_IMPORT_BYTES + 1) { ' '.code.toByte() }
        file(big)
        val a = launchWith(view())
        pageLoaded(a)
        assertEquals(event("toobig", false), lastJs(a))
        assertEquals(MainActivity.ImportResult.Failed("toobig"), MainActivity.checkImport(big))
    }

    @Test fun aByteOrderMarkIsIgnored() {
        assertEquals(MainActivity.ImportResult.Ok(backup), MainActivity.checkImport(("﻿" + backup).toByteArray()))
    }

    @Test fun aSharedFileOrSharedTextIsImportedToo() {
        file(backup.toByteArray())
        val a = launchWith(Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM, uri))
        pageLoaded(a)
        assertEquals(event(backup, true), lastJs(a))
        val b = launchWith(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, backup))
        pageLoaded(b)
        assertEquals(event(backup, true), lastJs(b))
    }

    @Test fun whenDovetailIsAlreadyOpenTheFileGoesStraightToThePage() {
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        pageLoaded(c.get())
        file(backup.toByteArray())
        c.newIntent(view())
        assertEquals(event(backup, true), lastJs(c.get()))
    }

    @Test fun theFilePickerIsTheSystemOneAndItsFileGoesTheSameWay() {
        val a = launchWith(Intent(Intent.ACTION_MAIN))
        pageLoaded(a)
        (shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge).pickBackupFile()
        shadowOf(Looper.getMainLooper()).idle()
        val started = shadowOf(a).nextStartedActivityForResult
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, started.intent.action)
        assertTrue(started.intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)!!.contains("application/json"))
        file(backup.toByteArray())
        shadowOf(a).receiveResult(started.intent, Activity.RESULT_OK, Intent().setData(uri))
        assertEquals(event(backup, true), lastJs(a))
        // Opened again and backed out of: the page is told, and nothing else happens.
        (shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge).pickBackupFile()
        shadowOf(Looper.getMainLooper()).idle()
        val again = shadowOf(a).nextStartedActivityForResult
        shadowOf(a).receiveResult(again.intent, Activity.RESULT_CANCELED, null)
        assertEquals(event("cancelled", false), lastJs(a))
    }

    @Test fun paydayIsOfferedForJsonAndTextFilesAndNeedsNoStoragePermission() {
        val pm = ctx.packageManager
        val opener = OpenFileActivity::class.java.name
        val offered = { i: Intent -> pm.queryIntentActivities(i, 0).any { it.activityInfo.packageName == ctx.packageName } }
        assertTrue(pm.queryIntentActivities(view(), 0).any { it.activityInfo.name == opener })
        assertTrue(pm.queryIntentActivities(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "text/plain"), 0).any { it.activityInfo.name == opener })
        assertTrue(pm.queryIntentActivities(Intent(Intent.ACTION_SEND).setType("application/json"), 0).any { it.activityInfo.name == opener })
        assertFalse("not in every share menu for text and links", offered(Intent(Intent.ACTION_SEND).setType("text/plain")))
        assertFalse(offered(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "image/jpeg")))
        val perms = pm.getPackageInfo(ctx.packageName, PackageManager.GET_PERMISSIONS).requestedPermissions?.toList() ?: emptyList()
        listOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.CAMERA, Manifest.permission.READ_CONTACTS, Manifest.permission.INTERNET).forEach { assertFalse(it, perms.contains(it)) }
    }

    @Test fun aFileOpenedInAnotherAppIsReadThereAndHandedToTheOneDovetailScreen() {
        file(backup.toByteArray())
        val opener = Robolectric.buildActivity(OpenFileActivity::class.java, view()).setup().get()
        assertTrue("it has no screen of its own", opener.isFinishing)
        val handOver = shadowOf(opener).nextStartedActivity
        assertEquals(MainActivity::class.java.name, handOver.component!!.className)
        assertTrue(handOver.hasExtra(MainActivity.EXTRA_IMPORT))
        assertEquals("the same as the app icon, so the icon brings back this screen", Intent.ACTION_MAIN, handOver.action)
        assertTrue(handOver.hasCategory(Intent.CATEGORY_LAUNCHER))
        val f = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        assertEquals("reuses the open Dovetail rather than starting a second one", f, handOver.flags and f)
        // The open Dovetail receives it.
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        pageLoaded(c.get())
        c.newIntent(handOver)
        assertEquals(event(backup, true), lastJs(c.get()))
        // It's read once: handing the same intent over again does nothing.
        val before = lastJs(c.get())
        c.newIntent(handOver)
        assertEquals(before, lastJs(c.get()))
    }

    @Test fun theAppIconNeverOpensASecondCopyOnTopOfDovetail() {
        val icon = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setClass(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val c = Robolectric.buildActivity(MainActivity::class.java, icon)
        shadowOf(c.get()).setIsTaskRoot(false)
        c.setup()
        assertTrue(c.get().finishedAsDuplicate)
        assertTrue(c.get().isFinishing)
        // A file or notification arriving that way is still delivered.
        val n = Robolectric.buildActivity(MainActivity::class.java, Intent(icon).putExtra(MainActivity.EXTRA_OPEN, "due"))
        shadowOf(n.get()).setIsTaskRoot(false)
        n.setup()
        assertFalse(n.get().finishedAsDuplicate)
        // The first copy (the task's root) opens normally, and so does Dovetail started inside another app's task.
        assertFalse(Robolectric.buildActivity(MainActivity::class.java, icon).setup().get().isFinishing)
        val embedded = Robolectric.buildActivity(MainActivity::class.java, Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setClass(ctx, MainActivity::class.java))
        shadowOf(embedded.get()).setIsTaskRoot(false)
        embedded.setup()
        assertFalse(embedded.get().finishedAsDuplicate)
    }

    @Test fun onlyContentLinksAreRead() {
        val private = Uri.parse("file:///data/data/uk.whiteboard.payday/shared_prefs/payday.xml")
        assertEquals(MainActivity.ImportResult.Failed("unreadable"), MainActivity.readImport(ctx.contentResolver, private))
        val opener = Robolectric.buildActivity(OpenFileActivity::class.java, Intent(Intent.ACTION_VIEW).setDataAndType(private, "application/json")).setup().get()
        val a = Robolectric.buildActivity(MainActivity::class.java, shadowOf(opener).nextStartedActivity).setup().get()
        pageLoaded(a)
        assertEquals(event("unreadable", false), lastJs(a))
    }

    @Test fun twoFilesOpenedOneAfterTheOtherAreEachHandedOverWhole() {
        file(backup.toByteArray())
        val first = shadowOf(Robolectric.buildActivity(OpenFileActivity::class.java, view()).setup().get()).nextStartedActivity
        file("{\"hello\":1}".toByteArray())
        val second = shadowOf(Robolectric.buildActivity(OpenFileActivity::class.java, view()).setup().get()).nextStartedActivity
        assertTrue(first.getStringExtra(MainActivity.EXTRA_IMPORT) != second.getStringExtra(MainActivity.EXTRA_IMPORT))
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        pageLoaded(c.get())
        c.newIntent(second)
        assertEquals(event("notbackup", false), lastJs(c.get()))
        c.newIntent(first)
        assertEquals(event(backup, true), lastJs(c.get()))
        assertNull(MainActivity.takeStashedImport(ctx, "../../shared_prefs/payday.xml"))
    }

    @Test fun aRefusedFileIsHandedOverAsARefusal() {
        file("""{"hello":1}""".toByteArray())
        val opener = Robolectric.buildActivity(OpenFileActivity::class.java, view()).setup().get()
        val a = Robolectric.buildActivity(MainActivity::class.java, shadowOf(opener).nextStartedActivity).setup().get()
        pageLoaded(a)
        assertEquals(event("notbackup", false), lastJs(a))
    }

    @Test fun reopeningFromRecentsDoesntOfferTheFileOrNotificationAgain() {
        file(backup.toByteArray())
        val opener = Robolectric.buildActivity(OpenFileActivity::class.java, view().addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY)).setup().get()
        assertNull(shadowOf(opener).nextStartedActivity)
        val a = Robolectric.buildActivity(MainActivity::class.java, view().addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY)).setup().get()
        pageLoaded(a)
        assertFalse(lastJs(a)?.contains("\"import\"") == true)
        val b = Robolectric.buildActivity(MainActivity::class.java, Intent(ctx, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_OPEN, "due").addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY)).setup().get()
        pageLoaded(b)
        assertFalse(lastJs(b)?.contains("\"open\"") == true)
    }

    @Test fun exportsShareBothCsvFilesInOneGoAndLeaveDovetailOutOfTheList() {
        val a = launchWith(Intent(Intent.ACTION_MAIN))
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        val files = JSONArray()
            .put(JSONObject().put("name", "dovetail-bills-2026-10-16.csv").put("mime", "text/csv").put("text", "bill,amount\r\nRent,500.00\r\n"))
            .put(JSONObject().put("name", "dovetail-months-2026-10-16.csv").put("mime", "text/csv").put("text", "month,float\r\n2026-10,215.66\r\n"))
        assertTrue(bridge.shareFiles(files.toString()))
        shadowOf(Looper.getMainLooper()).idle()
        val chooser = shadowOf(a).nextStartedActivity
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        @Suppress("DEPRECATION") val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND_MULTIPLE, send.action)
        assertEquals("text/csv", send.type)
        @Suppress("DEPRECATION") val uris = send.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)!!
        assertEquals(2, uris.size)
        assertEquals(2, send.clipData!!.itemCount)
        assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals("month,float\r\n2026-10,215.66\r\n", File(a.cacheDir, "share/dovetail-months-2026-10-16.csv").readText())
        @Suppress("DEPRECATION") val excluded = chooser.getParcelableArrayExtra(Intent.EXTRA_EXCLUDE_COMPONENTS)!!
        assertTrue(excluded.any { (it as ComponentName).className == MainActivity::class.java.name })
    }

    @Test fun aMarkdownReportIsSharedAsOneFile() {
        val a = launchWith(Intent(Intent.ACTION_MAIN))
        val bridge = shadowOf(a.web).getJavascriptInterface("PaydayNative") as NativeBridge
        assertTrue(bridge.shareFiles("""[{"name":"dovetail-analysis-2026-10-16.md","mime":"text/markdown","text":"# Dovetail export"}]"""))
        shadowOf(Looper.getMainLooper()).idle()
        @Suppress("DEPRECATION") val send = shadowOf(a).nextStartedActivity.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND, send.action)
        assertEquals("text/markdown", send.type)
        assertEquals("# Dovetail export", File(a.cacheDir, "share/dovetail-analysis-2026-10-16.md").readText())
    }

    @Test fun oddExportRequestsAreRefused() {
        assertNull(NativeBridge.parseShareFiles("[]"))
        assertNull(NativeBridge.parseShareFiles("not json"))
        assertNull(NativeBridge.parseShareFiles("""[{"name":"a.md","mime":"text/markdown","text":"x"},{"name":"b.md","mime":"text/markdown","text":"x"},{"name":"c.md","mime":"text/markdown","text":"x"}]"""))
        assertNull(NativeBridge.parseShareFiles("""[{"name":"a.exe","mime":"application/octet-stream","text":"x"}]"""))
        assertNotNull(NativeBridge.parseShareFiles("""[{"name":"a.md","mime":"text/markdown","text":"x"}]"""))
        assertEquals(".._.._x.md", MainActivity.safeFileName("../../x", ".md"))
    }
}
