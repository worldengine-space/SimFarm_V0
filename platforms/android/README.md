# SimFarm for Android

A small Java application hosts the bundled game in Android System WebView. All game code, data and artwork ship inside the APK, so playing needs no internet connection. HTTPS links open in the system browser. Farm imports and exports use Android's document picker; the app requests no storage or network permission.

## Build

Install JDK 17 or 21 and the Android SDK (platform 37, Build Tools 36.0.0). Set `JAVA_HOME` and `ANDROID_HOME` to those installations. From the repository root:

```sh
npm ci
npm run build:android
```

The pinned Gradle 9.4.1 wrapper downloads Gradle on first use. Android Gradle Plugin 9.2.0 builds the application. The output is `dist/SimFarm-0.1.0-android-debug.apk`. You can also open this directory in Android Studio and run the `app` target; Gradle refreshes the bundled web assets automatically, using Node on your PATH.

## Install and play

Copy the APK to an Android 8.0 or newer phone or tablet, open it, and allow installation from the app you used to open the file. For a connected developer device, run these commands from the repository root:

```sh
adb install -r dist/SimFarm-0.1.0-android-debug.apk
adb shell am start -n space.worldengine.simfarm/.MainActivity
```

The game opens in landscape. Use the shared touch controls and in-game File menu to save or load `.SFM` farms. Keep Android System WebView updated.

This is a debug-signed development APK. A Google Play release needs a private release signing key and an Android App Bundle. Do not commit signing keys. This project does not configure or publish a store release.

## Verify

From this directory, run `./gradlew lintDebug`. With Android Build Tools on your PATH, run `apksigner verify --verbose ../../dist/SimFarm-0.1.0-android-debug.apk` to check the artifact's signature.

The GitHub Actions Android workflow also boots an Android 15 emulator and runs `connectedDebugAndroidTest`. The smoke test waits for Play, taps through startup into a farm, checks that artwork and data loaded without JavaScript errors, and captures the launcher and game screens. Its artifact includes the APK, screenshots, logcat, and test report. Locally, start an emulator or attach a developer device and run `bash platforms/android/smoke-test.sh` from the repository root.
