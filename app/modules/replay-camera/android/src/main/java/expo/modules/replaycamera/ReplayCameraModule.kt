package expo.modules.replaycamera

import android.Manifest
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SessionOptions : Record {
  @Field val lens: String = "ultraWide"
  @Field val maxQuality: String = "1080p60"
  @Field val bufferSeconds: Double = 60.0
}

class SaveClipOptions : Record {
  @Field val source: String = "screen"
  @Field val at: Double = 0.0
}

class ExportClipOptions : Record {
  @Field val clipPath: String = ""
  @Field val startMs: Double = 0.0
  @Field val endMs: Double = 0.0
  @Field val speed: Double = 1.0
  @Field val muted: Boolean = false
  @Field val width: Int = 1080
  @Field val height: Int = 1920
  @Field val overlayPngPath: String? = null
  @Field val background: String = "#0B0B09"
}

class ReplayCameraModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReplayCamera")

    Events("onTrigger", "onThermalChange", "onInterrupted", "onResumed", "onError", "onGestureDebug", "onWatchStatus")

    OnCreate {
      ReplayEngine.emit = { name, body -> sendEvent(name, body) }
    }

    AsyncFunction("startSession") { opts: SessionOptions, promise: Promise ->
      ReplayEngine.start(context, opts.lens, opts.maxQuality, opts.bufferSeconds, onReady = { promise.resolve(null) }, onError = promise::reject)
    }

    AsyncFunction("stopSession") { promise: Promise ->
      ReplayEngine.stop { promise.resolve(null) }
    }

    AsyncFunction("saveClip") { _: SaveClipOptions, promise: Promise ->
      ReplayEngine.saveClip(
        onDone = { path, ms -> promise.resolve(mapOf("clipPath" to path, "durationMs" to ms)) },
        onError = promise::reject,
      )
    }

    Function("setGestureEnabled") { enabled: Boolean -> ReplayEngine.setGestureEnabled(enabled) }

    Function("signalSaved") { sound: Boolean, flash: Boolean -> ReplayEngine.signalSaved(sound, flash) }

    AsyncFunction("exportClip") { o: ExportClipOptions, promise: Promise ->
      ClipExporter.export(
        context,
        ClipExporter.Options(
          o.clipPath, o.startMs.toLong(), o.endMs.toLong(), o.speed.toFloat(), o.muted, o.width, o.height, o.overlayPngPath,
        ),
        onDone = { path, ms -> promise.resolve(mapOf("path" to path, "durationMs" to ms)) },
        onError = { promise.reject(ReplayException("ENCODER_FAILED", "$it")) },
      )
    }

    AsyncFunction("shareToInstagramStory") { videoPath: String, metaAppId: String ->
      val activity = appContext.currentActivity ?: return@AsyncFunction "unavailable"
      if (runCatching { InstagramStory.share(activity, videoPath, metaAppId) }.getOrDefault(false)) "opened" else "unavailable"
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)

    AsyncFunction("shareFiles") { paths: List<String> ->
      val activity = appContext.currentActivity ?: return@AsyncFunction "dismissed"
      if (runCatching { MultiShare.share(activity, paths) }.getOrDefault(false)) "shared" else "dismissed"
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)

    AsyncFunction("concatVideos") { paths: List<String>, outPath: String ->
      try {
        val (path, ms) = VideoConcat.concat(paths, outPath)
        mapOf("path" to path, "durationMs" to ms)
      } catch (e: VideoConcat.MismatchException) {
        throw ReplayException("CONCAT_MISMATCH", "${e.message}")
      } catch (e: Exception) {
        throw ReplayException("ENCODER_FAILED", "$e")
      }
    }

    AsyncFunction("createThumbnail") { clipPath: String, atMs: Double -> ClipThumbnail.make(clipPath, atMs) }

    // Voice is iOS-only for now: Android's microphone is already taken by the recorder.
    Function("setVoiceEnabled") { _: Boolean, _: String -> }

    // Wear OS arrives with the Android device stage; until then there is never a watch on Android.
    Function("getWatchStatus") { "unsupported" }

    Function("watchSync") { _: Boolean, _: Int, _: Double? -> }
    Function("watchSetSaveAllowed") { _: Boolean -> }

    Function("watchSignal") { _: Boolean -> }

    Function("isVoiceSupported") { _: String -> false }

    Function("getSpeechPermission") { "denied" }

    AsyncFunction("requestSpeechPermission") { false }

    Function("signalSaveFailed") { sound: Boolean -> ReplayEngine.signalSaveFailed(sound) }

    AsyncFunction("requestPermissions") { promise: Promise ->
      val permissions = appContext.permissions ?: return@AsyncFunction promise.resolve(false)
      permissions.askForPermissions(
        { results -> promise.resolve(results.values.all { it.status == PermissionsStatus.GRANTED }) },
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
      )
    }

    OnActivityEntersBackground { ReplayEngine.pause() }

    OnActivityEntersForeground { ReplayEngine.resume() }

    View(ReplayCameraView::class) {}
  }
}
