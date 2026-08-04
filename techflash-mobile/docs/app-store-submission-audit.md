# TechFlash iOS Submission Audit (Focused P0 Remediation)

## 1. Executive summary

This report continues from the previous baseline audit and focuses on P0 remediation, export-compliance verification, EAS release configuration, and production-build readiness proof.

Current result: **NO-GO**.

Why still NO-GO:
- EAS authentication is still blocked in this shell (`npx eas whoami` => `Not logged in`), so production build proof could not be produced.
- Therefore, required proof of **Xcode >= 26** and **iOS SDK >= 26** from EAS build logs is missing.
- Several backend-dependent safety/deletion items remain unresolved in repository scope.
- Physical TestFlight device testing is not yet complete.

## 2. Files changed

- `techflash-mobile/package.json`
  - Added deterministic verification script: `qa:membership-guard`.
  - Expo dependency alignment updates from `expo install`.
- `techflash-mobile/package-lock.json`
  - Updated via dependency installation/alignment.
- `techflash-mobile/eas.json`
  - Added `submit.production.ios.ascAppId = "6796826209"`.
- `techflash-mobile/app.config.js`
  - Added `ios.config.usesNonExemptEncryption = false`.
  - Added `expo-font` plugin entry.
- `techflash-mobile/src/release/iosMembershipPurchaseGuard.ts` (new)
  - Centralized iOS membership purchase guard.
- `techflash-mobile/scripts/verifyIosMembershipGuard.mjs` (new)
  - Deterministic verification script for iOS membership guard behavior.
- `techflash-mobile/src/settings/panels.tsx`
  - Applied iOS-safe membership purchase guard behavior.
  - Improved account deletion explanatory and confirmation copy.
- `techflash-mobile/docs/app-store-review-package.md` (new)
  - Reviewer/testing/metadata/export-compliance package.

## 3. Commands executed

From `techflash-mobile`:

1. `node -v; npm -v; where.exe node; where.exe npm; nvm version; nvm list; volta --version; corepack --version`
2. `winget install -e --id OpenJS.NodeJS.LTS --scope user --accept-package-agreements --accept-source-agreements --silent`
3. `npm ci`
4. `npx expo-doctor`
5. `npm run typecheck`
6. `npm run lint; npm test`
7. `npx expo config --type public`
8. `npx expo config`
9. `npx eas --version; npx eas whoami; npx eas project:info; npx eas config --platform ios --profile production`
10. `npx expo install --check`
11. `npx expo install expo-font expo@~54.0.36 expo-updates@~29.0.19`
12. `npm run typecheck; npm run qa:membership-guard`
13. `npx expo-doctor` (re-run)
14. `npx eas whoami; npx eas project:info; npx eas config --platform ios --profile production` (re-run)
15. `npm run eas:build:prod:ios`

## 4. Diagnostic results

### Runtime / package manager
- Node before fix: `v12.13.0` (unsupported).
- Node after fix: `v24.18.1` (supported by `engines.node >=20.19.4`).
- npm after fix: `11.16.0`.
- Lockfile/package manager: `package-lock.json` / npm.

### Build diagnostics
- `npm ci`: PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: FAIL (script missing).
- `npm test`: FAIL (script missing).
- `npx expo-doctor` (latest run): FAIL with 1 issue:
  - warns that `eas-cli` should not be installed locally as project dependency.
- `npx expo install --check`: FAIL (before alignment) due Expo patch drift.
- After alignment (`expo`, `expo-updates`, `expo-font`): dependency compatibility issues resolved except local `eas-cli` warning.

### EAS diagnostics
- `npx eas --version`: PASS (`eas-cli/18.11.0`).
- `npx eas whoami`: FAIL (`Not logged in`).
- `npx eas project:info`: FAIL (auth required).
- `npx eas config --platform ios --profile production`: FAIL (auth required).

## 5. Expo resolved-config evidence

From resolved config:
- App name: `TechFlash`
- Bundle ID: `com.techflash.app`
- Version: `1.0.0`
- iPad support: `ios.supportsTablet = true`
- New architecture: `newArchEnabled = true`
- Runtime strategy: `runtimeVersion.policy = appVersion`
- Updates URL: `https://u.expo.dev/80072b41-0158-428e-8019-ecebcfbde278`
- Info.plist encryption key: `ITSAppUsesNonExemptEncryption = false`
- Dynamic config value set: `ios.config.usesNonExemptEncryption = false` (visible in full `npx expo config` output)

## 6. Encryption / export-compliance result

### Encryption-related dependency audit
- `expo-secure-store`: used directly for token storage; standard OS keychain usage.
- `node-forge`: present transitively in lockfile via tooling dependencies (not used directly by TechFlash app runtime code paths).
- No direct app implementation found for:
  - custom AES/RSA/ECC crypto,
  - `crypto-js`, libsodium wrappers, VPN/SSH/tunneling stacks,
  - custom key exchange or certificate pinning,
  - end-to-end encrypted messaging implementation.

### Classification
- Current app behavior indicates ordinary HTTPS/TLS + auth + secure storage only.
- This is consistent with **non-exempt encryption not directly implemented by the app**.

### Config action applied
- Added `ios.config.usesNonExemptEncryption = false` in `app.config.js`.
- Existing `ITSAppUsesNonExemptEncryption = false` remains in `app.json` infoPlist.

### Export-compliance conclusion
- In current architecture/evidence, encryption documentation upload is **not required**.
- Account Holder should keep App Encryption Documentation upload section **empty** unless future app behavior introduces non-exempt/proprietary encryption.

## 7. EAS configuration result

Current `eas.json` production/submit state:
- `cli.appVersionSource = "remote"`: set.
- `build.production.distribution = "store"`: set.
- `build.production.autoIncrement = true`: set.
- `build.production.env.EXPO_PUBLIC_API_BASE_URL = "https://skilledhub-production.up.railway.app/api/v1"`: set.
- `build.production.ios.image = "latest"`: set.
- `submit.production.ios.appleTeamId = "7TJ4XBW7UQ"`: set.
- `submit.production.ios.ascAppId = "6796826209"`: set.

Validation notes:
- Bundle ID remains `com.techflash.app` via app config.
- Production profile is not internal distribution.
- Production profile is not development client.
- `ios.image = latest` is alias only; does **not** prove Xcode/SDK version.
- Protected EAS variables could not be enumerated due auth block; only repo-visible names are documented.

## 8. Production build result

Production build command was executed and failed before queueing because EAS auth is unresolved.

- Command intended: `npm run eas:build:prod:ios`
- Current status: **FAILED (pre-build auth gate)**
- First root-cause failure: Expo account authentication missing.
- Evidence: `An Expo user account is required to proceed... Error: build command failed.`

## 9. Xcode version proof

**Not available** (no authenticated production build output yet).

Required proof source: EAS build logs for the exact build run.

## 10. iOS SDK version proof

**Not available** (no authenticated production build output yet).

Required proof source: EAS build logs for the exact build run.

## 11. Membership-policy guard result

Business rule implemented for iOS v1:
- iOS users can view membership status but cannot initiate membership purchase/upgrade from app UI.
- iOS purchase/upgrade CTA removed from Settings Payment panel.
- iOS external membership checkout redirection removed from payment panel flow.
- Android behavior unchanged by centralized platform-aware guard.
- Web behavior unchanged (outside this mobile repo).

Implementation:
- `src/release/iosMembershipPurchaseGuard.ts`
- Wired in `src/settings/panels.tsx`

Deterministic verification:
- `npm run qa:membership-guard` => PASS.

Preserved flows:
- Technician payout link (`createConnectAccountLink`) remains available.
- Real-world job/payment and checkr-related backend flows were not removed or refactored.

## 12. Account-deletion result

Current verified behavior:
- Discoverable path exists: Settings -> Account -> Delete account permanently.
- Confirmation dialog exists.
- Duplicate-request prevention exists (`deleteBusy` disables repeated action).
- Authenticated backend call exists (`DELETE /users/me`).
- Local session/token cache clearing happens through logout after successful deletion.

Client-side remediation added:
- Expanded deletion copy to clarify permanence + retention categories.
- Expanded confirmation copy to clarify immediate sign-out and retention processing context.

Remaining gap:
- Backend still performs direct `user.destroy!` without explicit pending-deletion lifecycle, active-job safeguards, payout/dispute gating, or explicit retention-state responses.

## 13. UGC safety result

Verified functional:
- Report job: implemented and persisted via backend issue-report endpoint.
- Report conversation-level message context: implemented via feedback flow.
- Block abusive users in direct interactions: implemented.
- Support contact route: implemented.
- Backend moderation records for feedback/job reports: implemented.

Missing or incomplete for strict policy coverage:
- Dedicated report technician endpoint/flow in mobile: not verified.
- Dedicated report company endpoint/flow in mobile: not verified.
- Dedicated report review endpoint/flow in mobile: not verified.

These remain blockers for strict full-coverage interpretation.

## 14. Remaining P0 blockers

1. Authenticated EAS build proof missing (cannot verify Xcode >= 26 and iOS SDK >= 26).
2. Production iOS build has not been executed successfully in this authenticated environment.
3. Physical TestFlight validation (iPhone + iPad) not yet completed.
4. Backend deletion lifecycle/retention semantics remain insufficiently explicit for strict policy readiness.
5. Dedicated report-technician/report-company/report-review flows remain unverified or missing.
6. Reviewer accounts/demo data package not yet operationally confirmed.

## 15. Remaining P1 / P2 items

### P1
- Lint/test scripts absent (`lint`, `test`) in mobile project.
- Expo Doctor warning about local `eas-cli` dependency (non-blocking but should be normalized).
- Push-token registration path still not implemented for full remote push lifecycle.

### P2
- Optional CI hardening for policy checks.
- Optional expansion of in-app moderation UX discoverability.

## 16. Remaining Account Holder tasks

1. Provide/confirm authenticated Expo session or valid `EXPO_TOKEN` in this execution shell.
2. Validate EAS credentials linkage for Team `7TJ4XBW7UQ`.
3. Execute production iOS build and preserve full logs/artifacts.
4. Confirm App Store Connect metadata completeness for Apple ID `6796826209`.
5. Complete App Privacy answers and age/content declarations.
6. Upload screenshots and finalize reviewer contacts/accounts.

## 17. TestFlight physical-device test sequence

1. Install production TestFlight build on one iPhone and one iPad.
2. Login as company reviewer account:
   - verify jobs list/detail, messaging, reporting, blocking, settings.
3. Login as technician reviewer account:
   - verify job discovery, claim flow, messaging, payout onboarding, settings.
4. Verify iOS membership guard:
   - membership status visible,
   - no purchase/upgrade CTA,
   - no external membership checkout redirection.
5. Verify deletion flow:
   - trigger confirmation path,
   - verify sign-out and inability to continue prior session.
6. Validate denied-permission behavior (location/notifications).
7. Capture defects with repro steps and screenshots.

## 18. App Store Connect completion sequence

1. Open app record Apple ID `6796826209`.
2. Confirm Name `TechFlash`, Bundle ID `com.techflash.app`, SKU `TECHFLASH-IOS-001`.
3. Confirm category selection:
   - Primary `Business`
   - Secondary `Productivity`
4. Confirm subtitle and description metadata.
5. Confirm privacy policy and support URL fields.
6. Complete App Privacy data declarations.
7. Complete export compliance answers using this report’s encryption result.
8. Upload iPhone and iPad screenshot sets.
9. Enter reviewer contacts and demo account credentials.
10. Attach App Review Notes and select built version for review.

## 19. Exact build command

`npm run eas:build:prod:ios`

## 20. Exact submission command (not yet authorized)

`npm run eas:submit:prod:ios`

Status: **Do not run yet**. Submission is blocked until:
- successful production build proof,
- physical TestFlight testing complete,
- explicit user authorization to submit.

## 21. Final GO / NO-GO

**NO-GO**

Reason:
- GO criteria are not fully proven. Most critically, authenticated production build proof (including Xcode and iOS SDK versions) is still missing, and core policy/process P0 items remain unresolved.
