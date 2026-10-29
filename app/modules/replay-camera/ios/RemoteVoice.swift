import AVFoundation
import os
import Speech

/// The save command heard on the remote phone (spec 2026-10-29-remote-voice-and-economy-design.md). The microphone comes
/// through an audio engine and is recognized offline by the same `VoiceTrigger` as the camera phone (the words, the
/// on-device rule and the cooldown are the same). It listens only while the remote screen asks (the camera phone records
/// and the player left voice on); each command becomes `onRemoteVoice`, and the screen saves as for a tap.
final class RemoteVoice {
  static let shared = RemoteVoice()

  /// Console.app (filter: subsystem `Repplay`, category `RemoteVoice`).
  private static let log = Logger(subsystem: "Repplay", category: "RemoteVoice")

  /// Same shape as WatchBridge.emit: (event name, body).
  var emit: ((String, [String: Any]) -> Void)?

  private let voice = VoiceTrigger()
  private let engine = AVAudioEngine()
  private let queue = DispatchQueue(label: "replay.remoteVoice")
  private var wanted = false
  private var locale = VoiceLocale.ptBR
  private var running = false
  private var observers: [NSObjectProtocol] = []

  static var microphoneGranted: Bool { AVCaptureDevice.authorizationStatus(for: .audio) == .authorized }

  private init() {
    voice.onCommand = { [weak self] in
      Self.log.info("heard the save command")
      DispatchQueue.main.async { self?.emit?("onRemoteVoice", ["at": Date().timeIntervalSince1970 * 1000]) }
    }
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) {
      [weak self] note in
      let raw = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue ?? 0
      let began = AVAudioSession.InterruptionType(rawValue: raw) == .began
      // A call or Siri takes the microphone; listening comes back when it ends.
      self?.queue.async {
        guard let self else { return }
        if began { self.halt() } else { self.apply() }
      }
    })
    observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) {
      [weak self] _ in
      // Headphones in or out: the engine stopped and the input format may be another one. Start over.
      self?.queue.async {
        guard let self else { return }
        self.halt()
        self.apply()
      }
    })
  }

  /// Listen (`true`) or stop, in `locale`. Without the microphone or speech permission it stays off.
  func set(_ on: Bool, locale: VoiceLocale) {
    queue.async {
      self.wanted = on
      self.locale = locale
      self.apply()
    }
  }

  /// On `queue`.
  private func apply() {
    voice.setEnabled(wanted, locale: locale)
    if wanted && Self.microphoneGranted && SFSpeechRecognizer.authorizationStatus() == .authorized {
      begin()
    } else {
      halt()
    }
  }

  /// On `queue`.
  private func begin() {
    guard !running else { return }
    let input = engine.inputNode
    do {
      let session = AVAudioSession.sharedInstance()
      // Mixes with whatever else plays; nothing is played here.
      try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
      try session.setActive(true)
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        Self.log.error("no microphone input")
        return
      }
      input.removeTap(onBus: 0)
      input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
        // The engine reuses its buffer after this block: the recognizer gets a copy.
        guard let self, let copy = Self.copy(buffer) else { return }
        self.voice.consider(copy)
      }
      engine.prepare()
      try engine.start()
      running = true
      Self.log.info("listening")
    } catch {
      Self.log.error("could not listen: \(error.localizedDescription, privacy: .public)")
      input.removeTap(onBus: 0)
      engine.stop()
    }
  }

  /// On `queue`.
  private func halt() {
    guard running else { return }
    running = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    Self.log.info("stopped listening")
  }

  private static func copy(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return nil }
    copy.frameLength = buffer.frameLength
    let from = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffer.audioBufferList))
    let to = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    for (source, target) in zip(from, to) {
      guard let bytes = source.mData, let into = target.mData else { continue }
      memcpy(into, bytes, Int(min(source.mDataByteSize, target.mDataByteSize)))
    }
    return copy
  }
}
