# Lutra

A color-grading app for film simulation. Built with [Expo](https://expo.dev) (SDK 56) and React Native.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 11+
- [Expo CLI](https://docs.expo.dev/more/expo-cli/) (or use `npx expo`)
- For Android: [Android Studio](https://developer.android.com/studio) (Android SDK 35+, platform-tools for ADB)
- For iOS: [Xcode](https://developer.apple.com/xcode/) 16+ (macOS only)

## Getting started

```bash
# Install dependencies
pnpm install

# Start the dev server
pnpm start
```

From the Expo CLI menu, press:
- `a` — open on Android emulator or connected device
- `i` — open on iOS simulator (macOS only)
- `w` — open in web browser

This project uses [file-based routing](https://docs.expo.dev/router/introduction/) via Expo Router. Edit files in `src/` to start developing.

## Tooling

| Area | Tool |
|------|------|
| Linting | [oxlint](https://oxc.rs) — `pnpm lint` / `pnpm lint:fix` |
| Formatting | [oxfmt](https://oxc.rs) — `pnpm format:fix` |
| Type checking | `tsc --noEmit` |

## Development builds

This project uses [expo-dev-client](https://docs.expo.dev/develop/development-builds/introduction/) for native module support (Skia, Reanimated, etc.).

```bash
# Android debug build
pnpm android

# iOS debug build (macOS only)
pnpm ios
```

### Building a custom dev client

If native dependencies change, rebuild the dev client:

```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Remote debugging with ADB

When testing on a physical Android device, ADB (Android Debug Bridge) lets you connect over USB or Wi-Fi, forward ports, and inspect logs without touching the device.

### 1. USB connection

```bash
# Verify the device is recognized
adb devices

# If you see "unauthorized", unlock the device and accept the RSA fingerprint prompt
```

### 2. Wi-Fi / remote connection (no cable)

This is the real remote debugging flow — no USB cable once set up.

```bash
# Step A: Connect via USB first, then enable TCP/IP
adb tcpip 5555

# Step B: Disconnect USB, connect over Wi-Fi
adb connect <DEVICE_IP>:5555

# Verify
adb devices
# Should show:  <DEVICE_IP>:5555   device
```

Find your device's IP in Settings → About phone → Status, or:

```bash
adb shell ip route  # or: adb shell ip addr show wlan0
```

To disconnect:

```bash
adb disconnect <DEVICE_IP>:5555
```

### 3. Port forwarding for Metro

Expo's Metro bundler runs on your computer. The device needs to reach it.

```bash
# Forward Metro port (8081) from device to host
adb reverse tcp:8081 tcp:8081

# Verify forwarding is active
adb reverse --list
```

If you're connecting to a different Metro port:

```bash
adb reverse tcp:8081 tcp:8081  # change the second port if Metro runs elsewhere
```

### 4. Quick reference

| Command | What it does |
|---------|--------------|
| `adb devices` | List connected devices |
| `adb connect <ip>:5555` | Connect over Wi-Fi |
| `adb disconnect <ip>:5555` | Disconnect Wi-Fi |
| `adb reverse tcp:8081 tcp:8081` | Forward Metro port to device |
| `adb reverse --list` | Show active port forwards |
| `adb reverse --remove-all` | Remove all port forwards |
| `adb logcat` | Stream device logs |
| `adb logcat -s ReactNative:V ReactNativeJS:V` | Filter React Native logs |
| `adb shell input keyevent 82` | Open dev menu on device |
| `adb install path/to/app.apk` | Sideload an APK |
| `adb uninstall <package>` | Remove an app |

### 5. Accessing the dev menu

- **Emulator**: `Cmd+M` (macOS) or `Ctrl+M` (Windows/Linux)
- **Physical device**: Shake the device, or run `adb shell input keyevent 82`

The dev menu lets you reload, toggle performance overlays, open the element inspector, and more.

### 6. Troubleshooting

**Device not found**
- USB: try a different cable (data cable, not charge-only) and port
- Wi-Fi: ensure both devices are on the same network, no AP isolation
- Run `adb kill-server && adb start-server` to restart the ADB daemon

**Metro can't connect**
- Verify forwarding: `adb reverse --list` should show `tcp:8081 tcp:8081`
- Check Metro is running on port 8081 and bound to `localhost`
- Shake the device → Settings → Debug server host & port → enter `localhost:8081`

**"unauthorized" in `adb devices`**
- Unlock the device and accept the RSA key prompt
- Toggle USB debugging off/on in Developer options
- Revoke old authorizations and reconnect

## Learn more

- [Expo documentation](https://docs.expo.dev/versions/v56.0.0/) — SDK 56 reference
- [Expo Router](https://docs.expo.dev/router/introduction/) — file-based routing
- [React Native docs](https://reactnative.dev/docs/0.85/getting-started)
