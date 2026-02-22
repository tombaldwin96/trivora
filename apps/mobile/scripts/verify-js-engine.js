#!/usr/bin/env node
/**
 * EAS build hook: fail the build if the app is not configured for JSC (iOS crash fix).
 * Run as eas-build-post-install (after prebuild) so we can check generated ios/Podfile.properties.json.
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

// 1) Resolved app config must be JSC
const appConfig = require(path.join(projectRoot, 'app.config.js'));
const expo = appConfig.expo || {};
const rootEngine = (expo.jsEngine || '').toLowerCase();
const iosEngine = (expo.ios?.jsEngine ?? rootEngine).toLowerCase();
const androidEngine = (expo.android?.jsEngine ?? rootEngine).toLowerCase();

if (rootEngine === 'hermes' || iosEngine === 'hermes') {
  console.error('FATAL: jsEngine must be jsc (Hermes crashes on iOS). Got jsEngine=%s ios.jsEngine=%s', rootEngine, iosEngine);
  process.exit(1);
}
console.log('OK: app config jsEngine=%s ios=%s android=%s', rootEngine || 'jsc', iosEngine || 'jsc', androidEngine || 'jsc');

// 2) On iOS build, if prebuild already ran, verify generated Podfile.properties.json
const platform = process.env.EAS_BUILD_PLATFORM || '';
const podfilePropsPath = path.join(projectRoot, 'ios', 'Podfile.properties.json');

if (platform === 'ios' && fs.existsSync(podfilePropsPath)) {
  const podfileProps = JSON.parse(fs.readFileSync(podfilePropsPath, 'utf8'));
  const podfileEngine = (podfileProps['expo.jsEngine'] || '').toLowerCase();
  if (podfileEngine === 'hermes') {
    console.error('FATAL: ios/Podfile.properties.json has expo.jsEngine=hermes. Prebuild did not apply JSC.');
    process.exit(1);
  }
  console.log('OK: ios/Podfile.properties.json expo.jsEngine=%s', podfileProps['expo.jsEngine'] || '(default)');
}

console.log('verify-js-engine: JSC confirmed');
