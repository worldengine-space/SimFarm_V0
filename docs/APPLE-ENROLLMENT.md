# The remaining step for a native iPhone install link

The native iOS app and build pipeline are prepared. A public native install link
still requires Apple Developer enrollment, signing, and distribution approval.
An unsigned IPA is a build artifact, not something people can tap to install.

## Enroll

Start at [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/).
Apple lists membership at **US$99 per year**, with local pricing shown during
enrollment.

For organization enrollment, Apple requires a legal entity, a D-U-N-S number,
an Apple Account with two-factor authentication, authority to bind the entity,
a work email, and a working company website. The GitHub organization alone does
not establish a legal entity. World Engine's website is
[worldengine.space](https://worldengine.space).

The account holder needs to complete Apple's identity verification, agreement,
and membership purchase. If enrolling as an individual instead, Apple uses the
individual's legal name as the App Store seller. These requirements come from
[Apple's enrollment guidance](https://developer.apple.com/programs/enroll/).

## After enrollment

1. Register the app identifier `space.worldengine.simfarm` in the developer account.
2. Create its App Store Connect app record and signing credentials.
3. Configure the signing/upload workflow described in the [iOS guide](../platforms/ios/README.md).
4. Upload a signed build, complete the required Apple review for external testing,
   and replace the pending iPhone link in the main README with the TestFlight
   public link.

Keep private keys, certificates, and passwords out of Git and chat. The current
[browser game](https://worldengine-space.github.io/SimFarm_V0/) remains available
while native distribution is being set up.
