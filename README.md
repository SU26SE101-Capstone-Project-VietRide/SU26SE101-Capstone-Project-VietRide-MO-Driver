# VietRide — Crew App (Driver & Assistant)

Mobile app for **drivers** and **bus assistants** in the VietRide system, part of the
`SU26SE101-Capstone-Project-VietRide` capstone project.

Built with **Expo SDK 56** + **React Native 0.85** + **Expo Router** (file-based routing),
TypeScript strict mode, New Architecture.

---

## 1. Main features

| Area | Description |
| --- | --- |
| Auth / session | Sign in, forgot password, set password via deep link, change password |
| Trips | Trip list, trip detail, stop list, start/end a trip |
| Map & navigation | Route map (Mapbox), turn-by-turn navigation, off-route warnings |
| Tracking | Broadcast real-time GPS over Socket.IO so passengers can follow the vehicle |
| Ticketing | Scan ticket QR codes to check passengers in and out |
| Parcels | Manage parcels on a trip, capture photo proof of pickup/delivery |
| Route change proposals | Driver proposes an alternative route and previews it on the map |
| Incidents & support | Report incidents, RAG-based Q&A assistant |
| Notifications | Push notifications (Firebase) + an in-app notification list screen |

The two roles have separate route trees: `src/app/driver/` (driver) and
`src/app/assistant/` (assistant).

---

## 2. Environment requirements

| Component | Version |
| --- | --- |
| Node.js | `>= 22.13` |
| npm | bundled with Node 22 |
| JDK (Android builds) | **17** (required by RN 0.85) |
| Android SDK | compileSdk / targetSdk **36**, devices on Android 7+ |
| Xcode (iOS builds) | 26.4+, iOS 16.4+ |

> The app relies on many native libraries (Mapbox, Camera, Notifications), so it **cannot
> run on Expo Go**. You must use a development build or install a built APK.

The Android build also needs three machine-level settings that are **not** part of the
source tree — see [3.3](#33-android-sdk-location-required-for-android-builds) and
[3.4](#34-mapbox-downloads-token-required-for-android-builds).

---

## 3. Configuration

### 3.1 The `.env` file (included in the submission)

```env
EXPO_PUBLIC_API_URL=...            # VietRide backend base URL
EXPO_PUBLIC_TRACKING_ENABLED=...   # Enable/disable real-time GPS broadcasting
EXPO_PUBLIC_FAKE_GPS=...           # Simulate GPS when testing on an emulator
EXPO_PUBLIC_FAKE_GPS_SPEED_KMH=... # Simulated speed (km/h)
EXPO_PUBLIC_FIREBASE_API_KEY=...   # Firebase (push notifications)
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_MAPBOX_TOKEN=...       # Mapbox public token (pk.*) — used at runtime
```

`app.config.js` reads `EXPO_PUBLIC_MAPBOX_TOKEN` from `.env` and injects it into the
config plugin of `@badatgil/expo-mapbox-navigation`, so no token is hard-coded in the
source.

### 3.2 `google-services.json` (included in the submission)

Firebase credentials for Android push notifications. It lives in the project root and is
declared in `app.json` → `android.googleServicesFile`.

### 3.3 Android SDK location (REQUIRED for Android builds)

Gradle resolves the Android SDK through the `ANDROID_HOME` environment variable. If it is
unset, the build fails immediately with:

```
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment
variable or by setting the sdk.dir path in your project's local properties file at
'<project>/android/local.properties'.
```

Set it once, machine-wide (the default SDK path installed by Android Studio):

```powershell
# Windows (PowerShell) — persists for future terminals
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
```

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc
export ANDROID_HOME="$HOME/Library/Android/sdk"     # macOS
export ANDROID_HOME="$HOME/Android/Sdk"             # Linux
```

`build-release.bat` also sets `ANDROID_HOME` itself, so on Windows the release build works
even in a shell where the variable is missing. `npm run android` does **not** — it needs
the variable to be set for real.

### 3.4 Mapbox downloads token (REQUIRED for Android builds)

`@rnmapbox/maps` downloads its native SDK from Mapbox's private Maven repository, which
needs a **secret token** (`sk.*`) declared on the build machine — this token is **not** in
the source:

```properties
# Windows:      %USERPROFILE%\.gradle\gradle.properties
# macOS/Linux:  ~/.gradle/gradle.properties
MAPBOX_DOWNLOADS_TOKEN=sk.xxxxxxxx
```

Create one at https://account.mapbox.com/access-tokens/ with the `DOWNLOADS:READ` scope.
Without it, the Gradle build fails while resolving dependencies.

---

## 4. Running the project

```bash
# 1. Install dependencies (postinstall runs patch-package automatically)
npm install

# 2. Generate the native android/ (and ios/) directories — these are generated output
#    and are not part of the source tree
npx expo prebuild

# 3a. Run on an Android device / emulator
npm run android          # = npx expo run:android

# 3b. Run on iOS (requires macOS + Xcode)
npm run ios

# 3c. Run the web build (only some screens support web)
npm run web
```

Once the development build is installed on the device, later sessions only need:

```bash
npm start                # start the Metro dev server
```

### Building a release APK

```bash
npx expo prebuild
./build-release.bat      # Windows — edit JAVA_HOME in the file to match your JDK 17 path
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

---

## 5. Code quality checks

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npx expo-doctor          # verify dependency versions match SDK 56
```

> Run `npx expo start` (or `npx expo prebuild`) once before the first `typecheck`, because
> Expo needs to generate `expo-env.d.ts` and `.expo/types/router.d.ts` (types for typed
> routes). These are generated files and are not included in the submission. Without them
> `tsc` reports a false error on the `@/global.css` import in `src/constants/theme.ts`.

---

## 6. Folder structure

```
.
├─ app.json                   # Expo config (app name, icon, plugins, deep links)
├─ app.config.js              # Dynamic config: injects the token from .env into the plugin
├─ google-services.json       # Firebase credentials (Android)
├─ build-release.bat          # Release APK build script for Windows
├─ aar/                       # Extra Android resources (added to the build via a config plugin)
├─ assets/                    # Icons, splash, tab icons, 3D vehicle model (.glb)
├─ patches/                   # patch-package patches for @badatgil/expo-mapbox-navigation
├─ plugins/
│  └─ with-android-assets.js  # Config plugin that copies native assets into Android
└─ src/
   ├─ api/                    # HTTP layer: client, auth, trips, parcel, tracking, ...
   ├─ app/                    # Expo Router — every file is a screen
   │  ├─ auth/                #   forgot / set / change password
   │  ├─ driver/(tabs)/       #   driver tabs
   │  ├─ assistant/(tabs)/    #   assistant tabs
   │  └─ trips/[tripId].tsx   #   dynamic route
   ├─ components/             # Shared components
   ├─ constants/              # Theme, colors
   ├─ features/               # Per-feature logic (hooks + screens + formatting + errors)
   │  ├─ session/ boarding/ trips/ trip-ops/ parcels/
   │  ├─ routes/ route-proposals/ shuttle/ tracking/
   │  └─ notifications/ operations/ theme/
   └─ hooks/                  # Small shared hooks (color scheme, theme)
```

Convention: **screens** live in `src/app/` (that directory *is* the route tree), while
**reusable logic and UI** live in `src/features/` so Expo Router does not mistake them for
routes.

---

## 7. Technical notes

- The `android/` and `ios/` directories are **not** part of the submission because they are
  generated output (Continuous Native Generation). Run `npx expo prebuild` to recreate
  them — all native configuration lives in `app.json` and `plugins/`.
- Server state uses **TanStack Query**; the access token is stored with
  **expo-secure-store**.
- Real-time tracking uses **socket.io-client**.
- All user-facing text in the app is in **Vietnamese**.
- `patches/@badatgil+expo-mapbox-navigation+1.6.2.patch` does two things: it adds the
  speed-limit / current-speed / road-name views to the navigation view, and it adds
  `androidx.appcompat` to that module's Gradle dependencies. The appcompat entry is
  required — `MapboxRoadNameView` extends `AppCompatTextView`, but Mapbox's
  `ui-components` only pulls appcompat in at runtime, so without it the Kotlin compile
  fails with `Cannot access 'AppCompatTextView'`. The patch is applied automatically by
  the `postinstall` script.
