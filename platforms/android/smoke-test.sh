#!/usr/bin/env bash
# Called after the emulator is booted; preserve screenshots and logs on failure.
set -u
cd "$(dirname "$0")/../.."
adb logcat -c
platforms/android/gradlew -p platforms/android connectedDebugAndroidTest --no-daemon
smoke_status=$?
mkdir -p dist/android-smoke
adb pull /sdcard/Download/SimFarmSmoke/. dist/android-smoke/ || true
adb logcat -d > dist/android-logcat.txt
if grep -A 3 'FATAL EXCEPTION' dist/android-logcat.txt | grep -q 'space.worldengine.simfarm'; then
  smoke_status=1
fi
exit "$smoke_status"
