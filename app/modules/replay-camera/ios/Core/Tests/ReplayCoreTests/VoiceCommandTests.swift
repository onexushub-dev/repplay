import XCTest
@testable import ReplayCore

final class VoiceCommandTests: XCTestCase {
  func test_wordsPerLocale() {
    XCTAssertEqual(VoiceCommand.words(for: .ptBR), ["salvar"])
    XCTAssertEqual(VoiceCommand.words(for: .enUS), ["save"])
  }

  func test_localeFromTheJavaScriptTag() {
    XCTAssertEqual(VoiceLocale(rawValue: "pt-BR"), .ptBR)
    XCTAssertEqual(VoiceLocale(rawValue: "en-US"), .enUS)
    XCTAssertNil(VoiceLocale(rawValue: "es-ES"))
  }

  func test_portugueseMatchesSalvar() {
    for phrase in ["salvar", "Salvar!", "ok, SALVAR agora", "pode salvar"] {
      XCTAssertTrue(VoiceCommand.matches(phrase, locale: .ptBR), phrase)
    }
  }

  func test_portugueseIgnoresAccentsAndCase() {
    XCTAssertTrue(VoiceCommand.matches("SÁLVAR", locale: .ptBR))
  }

  func test_portugueseDoesNotFireOnOtherForms() {
    for phrase in ["que lance", "salvou", "salvando", "salva", "salvaram o ponto", "gravar", "pode gravar", "save"] {
      XCTAssertFalse(VoiceCommand.matches(phrase, locale: .ptBR), phrase)
    }
  }

  func test_englishMatchesSave() {
    for phrase in ["save", "Save!", "ok SAVE it", "please save", "Save."] {
      XCTAssertTrue(VoiceCommand.matches(phrase, locale: .enUS), phrase)
    }
  }

  func test_englishIgnoresAccentsAndCase() {
    XCTAssertTrue(VoiceCommand.matches("SÄVE", locale: .enUS))
  }

  func test_englishDoesNotFireOnOtherForms() {
    for phrase in ["saved", "saves", "saving", "record", "please record", "safe", "salvar"] {
      XCTAssertFalse(VoiceCommand.matches(phrase, locale: .enUS), phrase)
    }
  }
}
