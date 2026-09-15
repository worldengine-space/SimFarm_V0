# Install SimFarm on iPhone through TestFlight

The native iOS app bundles the game for offline play. A public TestFlight invitation
is the intended install link: open it on an iPhone, install Apple's TestFlight app
if needed, accept the invitation, and tap **Install**. Apple still requires these
installation steps; a website cannot silently install an iPhone app.

**Status:** the signing and upload workflow is prepared. The owner does not yet
have an Apple Developer Program membership, so enrollment and signing credentials
are required before uploading. A verified public TestFlight link is not available
yet. The unsigned `.ipa` and `.app` artifacts from
the regular iOS build workflow are developer build outputs and cannot be installed
directly on an ordinary iPhone.

## One-time Apple account setup

1. Use an active Apple Developer Program membership and accept any pending Apple
   agreements. In Certificates, Identifiers & Profiles, register the explicit App
   ID `space.worldengine.simfarm` for your team.
2. Create an **Apple Distribution** certificate. Export the certificate **with its
   private key** from Keychain Access as a password-protected `.p12` file.
3. Create an **App Store Connect** provisioning profile for that exact App ID,
   selecting the same distribution certificate, then download the `.mobileprovision`
   file. See Apple's [profile setup instructions](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/).
4. In App Store Connect, [create the iOS app record](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
   using that bundle ID, an available app name, your language, and a unique SKU such
   as `simfarm-v0`. This record must exist before uploading.
5. In **Users and Access → Integrations → App Store Connect API**, create a team API
   key with the **App Manager** role. Record its issuer ID and key ID, and download
   its `AuthKey_….p8` private key. The upload action's [setup guide](https://github.com/Apple-Actions/upload-testflight-build)
   describes this API credential.

## GitHub Actions secrets

Under the repository's **Settings → Secrets and variables → Actions**, add all
seven repository secrets below. Keep the private keys and certificate outside
the repository.

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | Your Apple Developer team's 10-character ID. |
| `APPLE_CERTIFICATE_BASE64` | Base64 of the distribution `.p12`, including its private key. |
| `APPLE_CERTIFICATE_PASSWORD` | Password used to export that `.p12`. |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Base64 of the App Store Connect `.mobileprovision`. |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID for the team API key. |
| `APP_STORE_CONNECT_KEY_ID` | API key ID matching the downloaded `.p8`. |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Entire `.p8` text, including its BEGIN/END lines and newlines; **not Base64**. |

On a Mac, copy each binary file's Base64 value to the clipboard, then paste it into
the corresponding secret:

```sh
base64 -i /path/to/distribution.p12 | pbcopy
base64 -i /path/to/SimFarm.mobileprovision | pbcopy
```

The workflow uses a temporary keychain and checks profile expiry, team, bundle ID,
distribution type, and certificate compatibility before archiving. This follows
[GitHub's macOS signing workflow](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).

## Build and upload

Open **Actions → Publish iPhone build to TestFlight → Run workflow** on `main`.
Enter the release version (initially `0.1.0`) and a positive integer build number
(initially `1`). Use a higher build number on every subsequent upload, including
retries after Apple has already accepted a binary. Keep the version unchanged for
updates to the same beta release.

The [manual workflow](../../.github/workflows/ios-testflight.yml) selects Xcode 26.3,
runs game checks, bundles the offline assets, generates the Xcode project, archives
with manual distribution signing, exports an App Store Connect IPA, and uploads
using [Apple Actions v4](https://github.com/Apple-Actions/upload-testflight-build/blob/v4/action.yml).
The signed App Store IPA goes to Apple; distribution to iPhone testers takes place
through TestFlight. The workflow does not create an Apple account or app record,
accept agreements, complete beta review, or generate a public invitation.

## Publish the install link

After Apple processes the uploaded build:

1. Open the app's **TestFlight** tab in App Store Connect. Resolve any processing
   errors and export-compliance questions accurately for this build.
2. Enter the beta description, feedback email, what to test, and review contact
   information requested by Apple. The offline game has no login; describe how to
   start a farm and use its touch controls.
3. Create an external testing group, add the build, and submit it for TestFlight
   beta review. The first external build requires review; later builds may also
   require it. Wait until Apple approves the build for external testing.
4. Enable the group's **Public Link**, select tester criteria/limits as desired,
   and copy Apple's actual `https://testflight.apple.com/join/…` invitation. Apple's
   [external testing guide](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)
   covers these steps.
5. Add that real invitation to the repository README and release notes as
   **Install on iPhone (TestFlight)**. Open it on an iPhone outside the development
   team and verify installation, launch, a new farm, touch input, saved-game reload,
   and offline play before calling iPhone distribution complete.

Keep an approved, unexpired build assigned to the public group. Renew expiring
certificates/profiles and replace the corresponding GitHub secrets before the
next signed release.
