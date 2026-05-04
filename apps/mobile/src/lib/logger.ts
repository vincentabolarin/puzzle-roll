/**
 * apps/mobile/src/lib/logger.ts
 *
 * Structured logger for the mobile app.
 *
 * In development (Expo Go / dev client): logs appear in the Metro console
 * and in the React Native Debugger.
 *
 * In a production APK: use `adb logcat` to read logs (see README below).
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

function emit(entry: LogEntry): void {
  const line = `[PuzzleRoll][${entry.level}][${entry.tag}] ${entry.message}${entry.data !== undefined ? ' ' + JSON.stringify(entry.data) : ''}`;
  if (entry.level === 'ERROR') {
    console.error(line);
  } else if (entry.level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(tag: string, message: string, data?: unknown): void {
    if (__DEV__) emit({ timestamp: new Date().toISOString(), level: 'DEBUG', tag, message, data });
  },
  info(tag: string, message: string, data?: unknown): void {
    emit({ timestamp: new Date().toISOString(), level: 'INFO', tag, message, data });
  },
  warn(tag: string, message: string, data?: unknown): void {
    emit({ timestamp: new Date().toISOString(), level: 'WARN', tag, message, data });
  },
  error(tag: string, message: string, data?: unknown): void {
    emit({ timestamp: new Date().toISOString(), level: 'ERROR', tag, message, data });
  },
};

/*
 * ─── HOW TO VIEW LOGS FROM A PRODUCTION APK ──────────────────────────────────
 *
 * All console.log/warn/error calls in React Native — including the logger above —
 * are forwarded to the Android logcat stream under the tag "ReactNativeJS".
 *
 * Prerequisites: Android SDK Platform Tools installed (contains `adb`).
 * Install via: https://developer.android.com/tools/releases/platform-tools
 * Or via Homebrew: `brew install android-platform-tools`
 *
 * Steps:
 *
 * 1. Enable Developer Options on the Android device:
 *    Settings → About Phone → tap "Build Number" 7 times.
 *
 * 2. Enable USB Debugging:
 *    Settings → Developer Options → USB Debugging ON.
 *
 * 3. Connect device via USB and confirm the "Allow USB debugging?" prompt.
 *
 * 4. Verify device is recognised:
 *    $ adb devices
 *    (should list your device)
 *
 * 5. Stream all Puzzle Roll JS logs:
 *    $ adb logcat -s ReactNativeJS:V
 *    (V = Verbose, shows all levels)
 *
 *    Filter to only errors:
 *    $ adb logcat -s ReactNativeJS:E
 *
 *    Filter to Puzzle Roll lines only (grep):
 *    $ adb logcat -s ReactNativeJS:V | grep PuzzleRoll
 *
 * 6. Save logs to file:
 *    $ adb logcat -s ReactNativeJS:V > puzzle_roll_logs.txt
 *
 * 7. Wireless ADB (no USB cable, Android 11+):
 *    Settings → Developer Options → Wireless Debugging → pair device
 *    $ adb pair <ip:port>        (use the pairing code shown on device)
 *    $ adb connect <ip:port>     (use the IP:port shown under Wireless Debugging)
 *    Then use normal adb commands above.
 *
 * 8. For iOS (physical device):
 *    Use Xcode → Window → Devices and Simulators → select device → open console.
 *    Or install `idevicesyslog` from libimobiledevice:
 *    $ brew install libimobiledevice
 *    $ idevicesyslog | grep RCTLog
 *
 * ─── BACKEND LOGS (production on Dokploy/Docker) ─────────────────────────────
 *
 * The NestJS API uses AppLogger which emits newline-delimited JSON in production.
 *
 * View via Dokploy dashboard: Application → Logs tab (live stream).
 *
 * Or via SSH on the VPS:
 *    $ docker logs <container_name> --follow
 *    $ docker logs <container_name> --follow 2>&1 | jq .   # pretty-print JSON
 *
 * Find container name:
 *    $ docker ps | grep puzzle-roll
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */