package uk.whiteboard.payday

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.content.IntentCompat

/**
 * Receives a backup file tapped in another app (VIEW) or shared to Dovetail (SEND). It has no screen of its own: it reads
 * the file while it still holds the permission to (none is needed beyond the link it was given), then hands the result
 * to the one Dovetail screen, which is brought to the front if it's open or started if not. MainActivity keeps its normal
 * launch mode, so there's never a second copy of the page, and tapping Dovetail's icon never closes a file picker,
 * permission prompt or share screen it opened.
 */
class OpenFileActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val i = intent
        val fromRecents = i != null && (i.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
        if (i == null || fromRecents || (i.action != Intent.ACTION_VIEW && i.action != Intent.ACTION_SEND) || savedInstanceState != null) {
            finish()
            return
        }
        val uri: Uri? = if (i.action == Intent.ACTION_VIEW) i.data else IntentCompat.getParcelableExtra(i, Intent.EXTRA_STREAM, Uri::class.java)
        val text: String? = if (uri == null) i.getStringExtra(Intent.EXTRA_TEXT) else null
        if (uri == null && text == null) {
            finish()
            return
        }
        MainActivity.ioExecutor.execute {
            val result = if (uri != null) MainActivity.readImport(contentResolver, uri) else MainActivity.checkImport(text!!.toByteArray(Charsets.UTF_8))
            val name = MainActivity.stashImport(this, result)
            runOnUiThread {
                // MAIN/LAUNCHER like the app icon: if this starts Dovetail, the icon later brings back this same screen
                // rather than a second copy of the page.
                startActivity(Intent(this, MainActivity::class.java)
                    .setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                    .putExtra(MainActivity.EXTRA_IMPORT, name)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                finish()
            }
        }
    }
}
