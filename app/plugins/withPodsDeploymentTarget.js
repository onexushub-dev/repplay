const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# reprize: raise old pod deployment targets';
// Podfiles generated before the renames carry an old marker; do not add the block a second time.
const LEGACY_MARKERS = ['# repplay: raise old pod deployment targets', '# lance: raise old pod deployment targets'];

/**
 * Some third-party pods (Mute, from the volume-manager library) still declare iOS 9. Xcode 27 only accepts 15.0+
 * and fails the build on them, so every pod below 15.0 is raised to 15.1 in the Podfile's post_install.
 */
module.exports = function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(file, 'utf8');
      if (podfile.includes(MARKER) || LEGACY_MARKERS.some((m) => podfile.includes(m))) return cfg;
      const anchor = /(react_native_post_install\([\s\S]*?\n\s*\)\n)/;
      if (!anchor.test(podfile)) throw new Error('withPodsDeploymentTarget: post_install anchor not found in the Podfile');
      podfile = podfile.replace(
        anchor,
        `$1    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1' if current && current.to_f < 15.0
      end
    end
`
      );
      fs.writeFileSync(file, podfile);
      return cfg;
    },
  ]);
};
