import SwiftUI
import WidgetKit

// Texts are English keys looked up in this target's Localizable.xcstrings (English and Brazilian Portuguese), like
// the watch app's; the brand is never translated.

private let ground = Color(red: 0.043, green: 0.043, blue: 0.035) // #0B0B09
private let accent = Color(red: 0.839, green: 0.949, blue: 0.247) // #D6F23F

struct SaveEntry: TimelineEntry {
  let date: Date
  let state: WatchSharedState
}

/// The watch app leaves the game in the shared app group and reloads the widget whenever it changes; the timer
/// counts by itself from the start.
struct SaveProvider: TimelineProvider {
  private func current() -> WatchSharedState {
    let group = WatchSharedState.groupID(forBundleID: Bundle.main.bundleIdentifier ?? "")
    return WatchSharedState(dictionary: UserDefaults(suiteName: group)?.dictionary(forKey: WatchSharedState.key))
  }
  func placeholder(in context: Context) -> SaveEntry {
    SaveEntry(date: .now, state: WatchSharedState(recording: true, clipCount: 3, startedAtMs: Date().timeIntervalSince1970 * 1000))
  }
  func getSnapshot(in context: Context, completion: @escaping (SaveEntry) -> Void) {
    completion(SaveEntry(date: .now, state: current()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<SaveEntry>) -> Void) {
    completion(Timeline(entries: [SaveEntry(date: .now, state: current())], policy: .never))
  }
}

/// What the widget draws: the word Repplay (so it is plainly ours) and, while a game runs, its timer and clip count.
/// Tapping it only opens the app (a widget cannot reach the phone by itself): saving is the big button there.
struct RepplayCard: View {
  let state: WatchSharedState
  @Environment(\.widgetFamily) private var family
  var body: some View {
    switch family {
    case .accessoryCircular:
      VStack(spacing: 0) {
        Image(systemName: state.recording ? "record.circle" : "bookmark.fill").font(.title3)
        Text(verbatim: "Repplay").font(.system(size: 9, weight: .heavy, design: .rounded))
      }
    default:
      VStack(alignment: .leading, spacing: 1) {
        HStack {
          Text(verbatim: "Repplay").font(.system(.caption, design: .rounded).weight(.heavy)).widgetAccentable()
          Spacer(minLength: 4)
          if state.recording, let start = state.startedAtMs {
            Text(Date(timeIntervalSince1970: start / 1000), style: .timer)
              .font(.system(.caption, design: .rounded).weight(.bold))
              .monospacedDigit()
              .multilineTextAlignment(.trailing)
              .frame(maxWidth: 56, alignment: .trailing)
          }
        }
        (state.recording ? Text("\(state.clipCount) clips") : Text("Open"))
          .font(.system(.title3, design: .rounded).weight(.heavy))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct RepplayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "RepplaySave", provider: SaveProvider()) { entry in
      RepplayCard(state: entry.state)
        .foregroundStyle(ground)
        .containerBackground(accent, for: .widget)
    }
    .configurationDisplayName("Repplay")
    .description(Text("Shows the recording's time and clips and opens Repplay with a tap."))
    .supportedFamilies([.accessoryRectangular, .accessoryCircular])
  }
}

@main
struct RepplayWidgets: WidgetBundle {
  var body: some Widget { RepplayWidget() }
}
