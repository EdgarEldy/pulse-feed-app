# Release signing

Both app stores require a release build to be signed before they will accept it. This document covers the one-time setup for each platform; day-to-day CI (see `ci.yml`) only runs `npx cap sync` on a PR into `master` and stops short of producing a signed build, since the secrets below are per-developer/per-organization and are never committed to this repository.

## Android: keystore signing

1. **Generate an upload keystore**, once, and keep it somewhere safe outside the repo (a password manager's attachment or your CI provider's encrypted secret storage, not this working copy):

   ```sh
   keytool -genkeypair -v \
     -keystore pulse-feed-app-upload.jks \
     -alias pulse-feed-app \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   `keytool` will prompt for a keystore password, a key password, and the certificate's distinguished-name fields (organization, city, etc.). Record the keystore path, the two passwords, and the alias: Gradle needs all four, and Google Play needs the certificate's SHA-256 fingerprint to be re-entered if the keystore is ever rotated.

2. **Create `android/key.properties`** (already covered by `.gitignore`, see below; never commit this file):

   ```properties
   storeFile=/absolute/path/to/pulse-feed-app-upload.jks
   storePassword=<keystore password>
   keyAlias=pulse-feed-app
   keyPassword=<key password>
   ```

3. **Wire it into `android/app/build.gradle`**, above the existing `android {` block, then reference it from a `release` signing config:

   ```groovy
   def keystorePropertiesFile = rootProject.file("key.properties")
   def keystoreProperties = new Properties()
   if (keystorePropertiesFile.exists()) {
       keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
   }

   android {
       // ...existing config...
       signingConfigs {
           release {
               if (keystorePropertiesFile.exists()) {
                   storeFile file(keystoreProperties['storeFile'])
                   storePassword keystoreProperties['storePassword']
                   keyAlias keystoreProperties['keyAlias']
                   keyPassword keystoreProperties['keyPassword']
               }
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
           }
       }
   }
   ```

   The `if (keystorePropertiesFile.exists())` guard is what lets `./gradlew assembleDebug` keep working for every contributor who has never touched signing at all; only a release build needs `key.properties` to actually be present.

4. **Build the release artifact** (an Android App Bundle, which is what Play Console expects):

   ```sh
   npx cap sync android
   cd android && ./gradlew bundleRelease
   ```

   The signed `.aab` lands at `android/app/build/outputs/bundle/release/app-release.aab`.

5. On CI, the same four values (`storeFile` as a base64-encoded secret decoded into a temp path, plus the three passwords/alias) are supplied as encrypted secrets and a short pre-build step writes `key.properties` from them; this repo's own `ci.yml` deliberately stops at `cap sync` and does not attempt a signed build, since doing so would require provisioning those secrets in this tutorial's CI for no real release target.

## iOS: certificate and provisioning profile

iOS signing has two separate pieces, both managed through an Apple Developer Program account: a **certificate** (proves who is building the app) and a **provisioning profile** (proves which app id, on which devices/distribution channel, that certificate is allowed to sign for).

1. **Register the App ID** in the Apple Developer portal (Certificates, IDs & Profiles → Identifiers) matching `capacitor.config.ts`'s `appId` (currently `io.ionic.starter`, a placeholder from the Capacitor project template; change this to your own reverse-DNS identifier before shipping).

2. **Create a Distribution certificate** (Certificates, IDs & Profiles → Certificates → "Apple Distribution"), either via the portal (upload a CSR generated from Keychain Access) or by letting Xcode generate one automatically (see step 4).

3. **Create a provisioning profile** for that App ID: an "App Store" profile for a TestFlight/App Store submission, or an "Ad Hoc"/"Development" profile for installing on specific registered devices outside the store. Download it and double-click to install into Xcode, or let Xcode manage this automatically (step 4).

4. **Configure signing in Xcode** (`ios/App/App.xcodeproj`, opened via `npx cap open ios`): under the target's "Signing & Capabilities" tab, either
   - **Automatic signing** (simplest for a small team): select your Team, and Xcode creates/renews the certificate and profile for you as needed, or
   - **Manual signing**: pick the specific certificate and provisioning profile created in steps 2-3, which is what a CI build machine without an interactive Xcode session typically needs.

   `ios/App/App.xcodeproj/project.pbxproj` currently has `CODE_SIGN_STYLE = Automatic` for both build configurations, appropriate for local development, but a CI release pipeline normally switches this to manual signing driven by an exported certificate/profile pair (or a tool like `fastlane match`, which is the standard way to share one signing identity across a team and CI without emailing `.p12` files around).

5. **Archive and export**: `Product → Archive` in Xcode, then `Distribute App` from the Organizer window, choosing the distribution method (App Store Connect, Ad Hoc, etc.) matching the provisioning profile from step 3. This is the step a CI pipeline automates with `xcodebuild archive` + `xcodebuild -exportArchive` (or `fastlane gym`), neither of which this repo's `ci.yml` runs, for the same reason it stops short of a signed Android build.

## Why none of this lives in `ci.yml`

Both platforms' signing material (an Android keystore's file and passwords; an iOS distribution certificate, its private key, and a provisioning profile) are secrets scoped to whoever owns the app's store listings, not something a tutorial project's CI should hold. `ci.yml`'s `cap sync` step on a PR into `master` catches the class of failure that matters generically (the web build failing to sync into the native projects at all) without requiring every fork of this tutorial to provision real signing secrets just to get a green CI run.
