# iOS crash (Live tab) – Hermes

## What the crash log shows

- **Build 23** (and earlier) **was still using Hermes**.
- Crash log shows: `hermes.framework` in the app binary, and the crash is in **Thread 8** inside Hermes:
  - `hermes::vm::GCScope::_newChunkAndPHV` → `JSObject::getNamedWithReceiver_RJS` (property lookup) → **EXC_BAD_ACCESS** (invalid address).
- **Thread 2** shows React Native converting an **NSException** from a TurboModule to a JS error (`convertNSExceptionToJSError`, `convertNSArrayToJSIArray`). So a native module threw; during that path Hermes crashes.

So: **the app must not be built with Hermes.** We use **JSC** only.

## What’s configured (safeguards)

- **`app.config.js`**: Sets `jsEngine: 'jsc'` at root and under `ios` / `android`. Reads `EXPO_JS_ENGINE` from env; if it is `hermes`, overrides to `jsc` so Hermes can never be selected.
- **`app.json`**: `jsEngine: 'jsc'`, `ios.jsEngine: 'jsc'`, `android.jsEngine: 'jsc'`.
- **`eas.json`** production: `EXPO_JS_ENGINE: jsc`, `EAS_RESTORE_CACHE: 0` (no cache restore so prebuild always runs fresh), cache key `jsc-ios-v8`.
- **`.easignore`**: `/android` and `/ios` so EAS never uploads native dirs and always runs prebuild from config.
- **`scripts/verify-js-engine.js`**: Run as `eas-build-post-install`. Fails the build if app config or generated `ios/Podfile.properties.json` has Hermes.

## What to do for the next iOS build

1. **Run a clean iOS build (no cache):**
   ```bash
   cd apps/mobile
   pnpm run build:ios:clean
   ```
   or:
   ```bash
   eas build --platform ios --profile production --clear-cache
   ```

2. **Confirm the new build uses JSC**  
   After installing the new build, if you get another crash, check the crash log:
   - If you still see **`hermes.framework`** in “Binary Images”, the build is still Hermes → run with `--clear-cache` again and/or bump the cache key in `eas.json` and rebuild.
   - If **`hermes`** does not appear and the app runs, the build is JSC and the crash is resolved.

## Reference: crash log (build 23)

- **Exception:** `EXC_BAD_ACCESS (SIGSEGV)`, `KERN_INVALID_ADDRESS` at `0x00000005fc7f98a0`
- **Crashed thread:** Thread 8 – Hermes `GCScope::_newChunkAndPHV`, `JSObject::getNamedWithReceiver_RJS`
- **Binary Images:** `hermes arm64 ... TrivoraTheQuizApp.app/Frameworks/hermes.framework/hermes`
