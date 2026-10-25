package expo.modules.replaycamera

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/** One share sheet for several videos (the system chooser with ACTION_SEND_MULTIPLE). */
object MultiShare {
  /** Android does not tell how the chooser ended: true once it is open. */
  fun share(activity: Activity, paths: List<String>): Boolean {
    if (paths.isEmpty()) return false
    val uris = ArrayList<Uri>(paths.map {
      FileProvider.getUriForFile(activity, "${activity.packageName}.replaycamera.files", File(it))
    })
    val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
      type = "video/mp4"
      putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(Intent.createChooser(intent, null))
    return true
  }
}
