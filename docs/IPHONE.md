# RadiGym on your iPhone (personal build)

How to put RadiGym on your own iPhone with Xcode and a normal Apple ID, no App Store and no paid
developer account. The app stops opening after 7 days with a non-paid account: plug the phone in
and press Run again (step 7). Your data stays.

The build is set up for this already: its own app id (`com.radisaad.radigym`) and only the
permissions a normal Apple ID can sign (`App/RadiGym.entitlements`: Apple Health).

## Once: tools on the Mac

1. **Xcode** with the **iOS** component (watchOS, tvOS and visionOS are not needed).
   Open it once and accept the licence.
2. **Node.js 22** (nodejs.org, the `.pkg`). Check: `node -v`.
3. **CocoaPods**, which Xcode needs for the app's plugins. In Terminal:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   (Homebrew, the Mac's package manager; follow the two lines it prints at the end, starting
   with `echo` and `eval`.) Then:
   ```bash
   brew install cocoapods
   pod --version
   ```
4. **Your Apple ID in Xcode**: Xcode → Settings → Accounts → **+** → Apple ID, sign in.

## Once: the iPhone

5. Plug the iPhone into the Mac with a cable, unlock it, tap **Trust** and enter its code.
6. Turn on **Developer Mode**: Settings → Privacy & Security → Developer Mode → on. The phone
   restarts; confirm **Turn On** after it does. (The switch only shows up once Xcode has seen the
   phone, so do step 5 first.)

## Build and install (first time, and every 7 days)

7. In Terminal:
   ```bash
   cd ~/openGym/frontend
   git pull
   npm install
   npm run build:mobile
   open ios/App/App.xcworkspace
   ```
   `build:mobile` builds the app's screens and copies them into the iPhone project (`cap sync`,
   which also runs CocoaPods). Always open `App.xcworkspace`, never `App.xcodeproj`.
8. In Xcode: click **App** at the top of the left column → target **App** → **Signing &
   Capabilities** → **Team**: pick your name (*Personal Team*). Leave "Automatically manage
   signing" on. If it says the bundle identifier is taken, change `com.radisaad.radigym` to
   something else of yours, such as `com.radisaad.radigym2`.
9. At the top of the window, pick your **iPhone** as the device (not a simulator) and press the
   **▶ Run** button. The first build takes a few minutes.
10. The first time only: the iPhone refuses to open the app ("Untrusted Developer"). Go to
    Settings → General → **VPN & Device Management** → your Apple ID → **Trust**. Then open
    RadiGym.

## When something fails

- **"Personal development teams do not support the HealthKit capability"**: in Signing &
  Capabilities, remove **HealthKit** with the **x** and run again. Apple Health sync is then off;
  everything else works.
- **"Pod install failed" / "pod: command not found"**: step 3 was skipped or Terminal was not
  reopened after it.
- **A red error in Xcode**: copy its text (or a screenshot) to Claude.

## After a change to the app

`git pull`, then `npm run build:mobile`, then **▶ Run** in Xcode. Your runs stay on the phone.
