# TechFlash iOS App Review — Physical Device Recording Readiness

**Expo project path:** `techflash-mobile/`  
**Bundle ID:** `com.techflash.app`  
**Production API:** `https://skilledhub-production.up.railway.app/api/v1`

This document is the single runbook for Apple’s required **physical iPhone** screen recording.

---

## Pre-flight (must complete before pressing Record)

### 1. Seed review-safe production data

On the production Rails host:

```bash
cd skilled_hub_api
bundle exec rails app_review:prepare
bundle exec rails app_review:status
```

This task:

- Ensures reviewer company/technician accounts exist
- Sets company `job_funding_waived`
- Sets technician trade/class + **premium + fee waived** (so early-access delay does not block claim)
- Creates/refreshes an **unpriced** open `App Review Demo Job` with `go_live_at` in the past
- Ensures a sample conversation with messages

**Do not** create priced jobs for the walkthrough (Stripe charge risk).  
**Do not** claim real customer jobs.

### 2. Build / install native iOS app

From `techflash-mobile/`:

```bash
npm ci
npm run typecheck
npm test
npx expo config --type public
npm run eas:build:prod:ios   # requires Expo auth / EXPO_TOKEN
```

Install the resulting build via **TestFlight** on a physical iPhone running the latest iOS.

Simulator smoke tests are useful but **do not** satisfy Apple’s physical-device recording requirement.

### 3. Clean permission state

iOS shows Location / Notification dialogs only while undecided.

Before recording:

1. Delete TechFlash from the iPhone, **or**
2. Settings → TechFlash → reset Location + Notifications to Ask/Off, **or**
3. Settings → General → Transfer or Reset iPhone → Reset → Reset Location & Privacy (broader)

Fresh install is the most reliable path.

### 4. Credentials (do not type passwords into the recording if avoidable)

| Role | Email | Password |
|------|-------|----------|
| Company reviewer | `review.company.20260804173342@techflash.app` | See `APP_STORE_REVIEW_NOTES.md` |
| Technician reviewer | `review.tech.20260804173342@techflash.app` | Same |
| Disposable registration | Create live in-app during recording | Choose a throwaway `@techflash.app` or similar |

Passwords are documented in `APP_STORE_REVIEW_NOTES.md` / App Store Connect notes — **not** embedded in app source.

---

## Exact recording script (recommended order)

> Order differs slightly from a naive list because **permissions onboarding runs after first login/register**, company posting is safest **unpriced**, and technician **job report** only works after claim/accept. Conversation report/block is the primary safety demo.

1. Start **Control Center → Screen Recording** from the iPhone home screen.
2. Launch **TechFlash** from its real home-screen icon (not Safari).
3. Tap **Create account**. Register a disposable technician with trade + class + city.
4. Complete **permissions onboarding**:
   - Continue → allow **Location** in the system dialog (or Don’t Allow once to prove fallback).
   - Continue → allow **Notifications** in the system dialog (or Don’t Allow).
   - Tap **Enter TechFlash**.
5. Open **Account → Log out**.
6. Log in as **technician reviewer**.
7. If permissions onboarding appears again on this device/install, complete or skip quickly (flag is per-install AsyncStorage).
8. Open **Jobs** → browse open jobs → open **App Review Demo Job**.
9. Confirm pay/location/schedule/company fields render. Tap **Claim**.
10. Open **Messages** → open the sample conversation → send a short message.
11. Scroll to **Safety** → report the conversation → confirm success.
12. Tap **Block this user** → confirm. Verify messaging is disabled afterward.
13. (Optional) Settings → Account → Blocked users → Unblock so the company path remains usable.
14. Log out.
15. Log in as **company reviewer**.
16. Open **Jobs → Create job**. Fill title/description/class/location/schedule. **Leave Hourly rate blank** (review-safe unpriced post). Submit.
17. Open **Account** → Privacy Policy, Terms of Service, Support (mailto). Confirm pages load / mail opens; return to app.
18. Log out. Log in as the **disposable** account from step 3.
19. Account → Open settings → Account → **Delete account permanently** → confirm. App should sign out.
20. Stop screen recording.

### Why this order

| Naive step | Adjustment |
|------------|------------|
| Permissions before register | Native prompts are tied to real features; app shows an explanation screen then triggers OS dialogs after auth. |
| Company create → message immediately | Backend requires an accepted claim or technician profile id; use seeded conversation / claim first. |
| Report open job as technician | API forbids until accepted; use conversation report instead. |
| Priced company post | Mobile has no Stripe SCA completion; unpriced or funding-waived only. |

---

## Pass / fail matrix (pre-recording verification)

| Walkthrough action | Status | Evidence notes |
|--------------------|--------|----------------|
| App launches (native) | UNVERIFIED | Requires physical/TestFlight build |
| Registration fields complete | PASS | Code + live API: trade/skill required; fixed in this PR |
| Registration succeeds | PASS | Verified API create with trade+skill; deleted disposable |
| Keyboard / password UX | PASS | Client validation + keyboardVerticalOffset added |
| Location permission prompt | PASS (code) / UNVERIFIED (device) | `PermissionsOnboardingScreen` + `expo-location`; usage string set |
| Location Allow works | PASS (code) / UNVERIFIED (device) | Dashboard GPS when granted |
| Location Don’t Allow fallback | PASS (code) | City/address registration + profile geocode fallback |
| Notification permission prompt | PASS (code) / UNVERIFIED (device) | Onboarding + Settings toggle; `expo-notifications` plugin |
| Notification denial non-blocking | PASS (code) | Skip / deny continues into app |
| Push delivery end-to-end | NOT APPLICABLE / UNVERIFIED | Token stored locally only; no backend push registration |
| Logout clears session | PASS (code) | AuthContext clears SecureStore session |
| Login reviewer accounts | PASS | Live API 200 for both review accounts (2026-11-14) |
| Auth persists / resume | UNVERIFIED | Needs device background/resume |
| Tech browse jobs | FAIL → fix via rake | Before prepare: 0 open jobs visible (48h basic delay). After `app_review:prepare`: claimable |
| Open job detail | PASS (code) / conditional data | Detail screen renders; visibility gated by membership window |
| Claim review-safe job | FAIL until rake | Live claim returned tier early-access 403; rake sets premium + past `go_live_at` |
| Messages send | PASS | Live API message create on conversation #18 |
| Report conversation | PASS | Live API feedback 201 |
| Block user | PASS (code + API) | Blocks suppress DMs with 403; UI confirms |
| Company create unpriced job | PASS | Live API created job #40 open+funded without card |
| Company priced job on iOS | NOT APPLICABLE | No mobile Stripe confirm path — do not demo priced post |
| Privacy / Terms / Support | PASS | `www.techflash.app` pages 200; mailto support |
| Account deletion | PASS (code + API) | `DELETE /users/me` 204 verified on disposable |
| App icon / splash | PASS | 1024 RGBA assets; configured in app.json |
| iPhone-only | PASS | `supportsTablet: false`, `UIRequiresFullScreen: true` |
| Production API URL | PASS | eas.json production + config.ts default |

---

## Permission implementation status

### Location

- Module: `expo-location`
- Prompt: `PermissionsOnboardingScreen` (first launch after auth) and Dashboard if still undetermined
- Info.plist: `NSLocationWhenInUseUsageDescription`
- Plugin: `expo-location` in `app.json`
- Background location: **not** requested
- Denial: city/address profile fallback; no crash

### Notifications

- Module: `expo-notifications`
- Prompt: onboarding + Settings → Notifications toggle
- Handler configured at app start
- Expo push token stored locally when granted
- Backend device-token registration: **not implemented** — do not claim remote push delivery in review notes
- Denial: does not block registration or core app use

---

## EAS / TestFlight

```bash
cd techflash-mobile
npm ci
npm run eas:build:prod:ios
npm run eas:submit:prod:ios   # only after explicit owner authorization
```

Production profile env: `EXPO_PUBLIC_API_BASE_URL=https://skilledhub-production.up.railway.app/api/v1`

---

## Remaining physical iPhone steps

1. Authenticated EAS iOS production build + TestFlight install
2. Fresh install permission dialogs (Allow and Don’t Allow takes)
3. Full recording pass with seeded data
4. Confirm reviewer accounts still authenticate the day of upload
5. Re-run `rails app_review:prepare` if sample job was claimed/finished during rehearsal
