package uk.whiteboard.payday

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/** The daily reminder check (WorkManager). All the logic is in [Notifier]. */
class ReminderWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        Notifier(applicationContext).runDaily()
        return Result.success()
    }
}
