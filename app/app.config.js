/**
 * Dynamic config on top of app.json.
 *
 * Apple only lets one developer team register a given bundle id, so each person who builds on their own Mac/Apple ID
 * needs their own id and team. Set them in app/.env.local (git-ignored) or in the shell:
 *
 *   REPPLAY_BUNDLE_ID=com.yourname.repplay   iOS bundle id and Android package (the watch app becomes <id>.watch)
 *   REPPLAY_APPLE_TEAM_ID=ABCDE12345         your Apple development team id
 *
 * The old LANCE_BUNDLE_ID and LANCE_APPLE_TEAM_ID names still work, so an existing .env.local keeps building.
 *
 * With nothing set, the values from app.json are used unchanged.
 *
 * RevenueCat public SDK keys (never secret keys), read into extra.revenueCat:
 *
 *   REPPLAY_RC_IOS_KEY=appl_...            iOS key
 *   REPPLAY_RC_ANDROID_KEY=goog_...        Android key
 *   REPPLAY_RC_TEST_KEY=test_...           Test Store key, used only in development builds (__DEV__); left out of EAS production builds
 *
 * The old LANCE_RC_* names still work, so an existing .env.local keeps working.
 *
 * With no key the app runs as free and the paywall reports an error.
 *
 * Anonymous usage metrics (PostHog, EU cloud), read into extra.posthog:
 *
 *   REPPLAY_POSTHOG_KEY=phc_...            project API key (public, write-only)
 *
 * With no key the app sends no metrics at all (dev builds, tests, CI).
 */
module.exports = ({ config }) => {
  const bundleId = process.env.REPPLAY_BUNDLE_ID || process.env.LANCE_BUNDLE_ID;
  const teamId = process.env.REPPLAY_APPLE_TEAM_ID || process.env.LANCE_APPLE_TEAM_ID;

  const ios = Object.assign({}, config.ios);
  const android = Object.assign({}, config.android);

  if (bundleId) {
    ios.bundleIdentifier = bundleId;
    android.package = bundleId;
  }
  if (teamId) {
    ios.appleTeamId = teamId;
  }

  // The test_ key is development-only (see pickApiKey), so EAS production builds do not carry it at all.
  const production = process.env.EAS_BUILD_PROFILE === 'production';
  const extra = Object.assign({}, config.extra, {
    revenueCat: {
      ios: process.env.REPPLAY_RC_IOS_KEY || process.env.LANCE_RC_IOS_KEY,
      android: process.env.REPPLAY_RC_ANDROID_KEY || process.env.LANCE_RC_ANDROID_KEY,
      test: production ? undefined : process.env.REPPLAY_RC_TEST_KEY || process.env.LANCE_RC_TEST_KEY,
    },
    posthog: {
      key: process.env.REPPLAY_POSTHOG_KEY,
      host: 'https://eu.i.posthog.com',
    },
  });

  return Object.assign({}, config, { ios: ios, android: android, extra: extra });
};
