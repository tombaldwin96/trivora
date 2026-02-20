/**
 * Single source of truth for Expo config. EAS prebuild reads this.
 * We force jsEngine: 'jsc' here so Hermes is never linked (fixes iOS boot crash).
 */
const path = require('path');
const appJson = require(path.join(__dirname, 'app.json'));

const base = appJson.expo || {};

module.exports = {
  expo: {
    ...base,
    // MUST be JSC so Hermes is not linked. Hermes crashes at boot on iOS.
    jsEngine: 'jsc',
    android: {
      ...base.android,
      jsEngine: 'jsc',
    },
    ios: {
      ...base.ios,
      jsEngine: 'jsc',
    },
  },
};
