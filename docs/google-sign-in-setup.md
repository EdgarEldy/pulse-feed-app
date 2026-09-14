# Google Sign-In setup

`@capawesome/capacitor-google-sign-in`'s `initialize({ clientId })` call (see `AuthService.ensureGoogleSignInInitialized`) always takes a Google Cloud Console **web** OAuth client ID, on every platform, including native. That web client ID is the only one this app's own source reads (from `GOOGLE_CLIENT_ID` in `.env`, see `.env.example`). The Android and iOS client IDs are separate credentials that exist only to authorize this app's native builds to use that same web client's sign-in flow; neither is ever passed into the plugin or read from `.env`, but both still have to be created and wired up at the native-project level before Google sign-in actually works on a real device. None of this repo's own tutorial-scale setup includes a real Google Cloud project, so this is a one-time setup a real deployment still needs to do.

## Web (already wired up)

Copy `.env.example` to `.env` and set `GOOGLE_CLIENT_ID` to the web client ID from Google Cloud Console (APIs & Services → Credentials → an OAuth 2.0 Client ID of type "Web application"). `scripts/set-env.js` picks this up the same way it already does `API_BASE_URL`.

## Android

Create an **Android** OAuth client in the same Google Cloud Console project as the web client:

- **Package name**: this app's application ID (`android/app/build.gradle`).
- **SHA-1 certificate fingerprint**: the fingerprint of whichever certificate signs the build.
  - Local debug builds: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`.
  - A real release build: the **app signing key**'s fingerprint (Google Play Console → Test and release → Setup → App signing), not the upload key's, per `docs/release-signing.md`.

Add one Android OAuth client per fingerprint that needs to sign in (debug, and separately the real release signing key). A missing fingerprint is the most common cause of a sign-in flow failing silently on a real device even though the web client ID is configured correctly. No source change is needed on the Android side beyond this Google Cloud Console configuration; the plugin reads the matching client automatically from the app's package name and signing certificate at runtime.

## iOS

Create an **iOS** OAuth client in the same project (bundle ID matching this app's), then add its client ID to `ios/App/App/Info.plist`:

```xml
<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID</string>
```

And register the reversed client ID as a URL scheme, also in `Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.YOUR_IOS_CLIENT_ID</string>
    </array>
  </dict>
</array>
```

Neither of these `Info.plist` edits is present in this repo (there is no real iOS client ID to put there yet); add them once a real Google Cloud project exists for this app.
