import Foundation

/// The language the voice command listens in; the raw value is the tag JavaScript sends (`setVoiceEnabled`).
public enum VoiceLocale: String, CaseIterable {
  case ptBR = "pt-BR"
  case enUS = "en-US"

  /// The speech recognizer's locale.
  public var locale: Locale { Locale(identifier: rawValue) }
}

/// Finds the spoken save command in a speech transcript, as whole words, ignoring case and accents
/// (so "salvou", "salvando", "saved", "saving" and court talk don't fire it).
public enum VoiceCommand {
  /// The command word per language: only the one that says what it does (2026-11-01: "gravar"/"record" dropped, the
  /// app saves a clip, it does not start recording). "save" is also common court talk ("great save!"), so if field
  /// tests show false triggers, change it here (and the app's VOICE_WORD and the speech permission text in app/locales).
  public static func words(for locale: VoiceLocale) -> [String] {
    switch locale {
    case .ptBR: return ["salvar"]
    case .enUS: return ["save"]
    }
  }

  private static let patterns: [VoiceLocale: NSRegularExpression] = Dictionary(
    uniqueKeysWithValues: VoiceLocale.allCases.map { locale in
      let alternatives = words(for: locale).map(NSRegularExpression.escapedPattern(for:)).joined(separator: "|")
      return (locale, try! NSRegularExpression(pattern: #"\b("# + alternatives + #")\b"#))
    }
  )

  public static func matches(_ transcript: String, locale: VoiceLocale) -> Bool {
    let text = transcript
      .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: locale.locale)
      .lowercased()
    return patterns[locale]!.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
  }
}
