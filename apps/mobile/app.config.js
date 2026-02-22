/**
 * Single source of truth for Expo config. EAS prebuild reads this.
 * Hermes must NEVER be used on iOS (crashes on Live tab). We force JSC only.
 * EAS production sets EXPO_JS_ENGINE=jsc; we also hardcode jsc so config is correct even without env.
 */
const path = require('path');
const appJson = require(path.join(__dirname, 'app.json'));

const base = appJson.expo || {};

// EAS production sets EXPO_JS_ENGINE=jsc. Never allow hermes (iOS crash).
const raw = (process.env.EXPO_JS_ENGINE || 'jsc').toLowerCase();
const jsEngine = raw === 'hermes' ? 'jsc' : (process.env.EXPO_JS_ENGINE || 'jsc');

module.exports = {
  expo: {
    ...base,
    jsEngine,
    android: {
      ...(base.android || {}),
      jsEngine,
    },
    ios: {
      ...(base.ios || {}),
      jsEngine,
    },
  },
};
