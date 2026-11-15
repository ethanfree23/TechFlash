# TechFlash iOS — Exact App Review Recording Script

**Expo app:** `techflash-mobile/`  
**Bundle ID:** `com.techflash.app`  
**API:** `https://skilledhub-production.up.railway.app/api/v1`  
**PR:** #43

---

## 0) Owner prep (once, before picking up the phone)

### A. Production sample data

```bash
cd skilled_hub_api
bundle exec rails app_review:prepare
bundle exec rails app_review:status
```

Expect `claimable: true`, a demo job id, and a conversation id.  
Safe to re-run before every rehearsal (idempotent; only touches reviewer demo data).

### B. TestFlight build

Use the **production** EAS profile (not preview/dev):

```bash
cd techflash-mobile
npm ci && npm run typecheck && npm test
npm run eas:build:prod:ios
```

Install that build from TestFlight. Confirm the home-screen name is **TechFlash** and the icon is the TechFlash mark (not a blank Expo placeholder).

### C. Credentials

| When | Account |
|------|---------|
| Steps 3–5 (register + permissions + delete later) | New disposable technician created live |
| Steps 7–14 | Technician reviewer `review.tech.20260804173342@techflash.app` |
| Steps 16–18 | Company reviewer `review.company.20260804173342@techflash.app` |

Passwords: **App Store Connect / password manager only** — never paste into the recording, chat, or git.

---

## 1) Make iOS show real permission dialogs

iOS shows Location / Notification dialogs only while the permission is **undetermined**.

**Do not assume delete+reinstall always resets every permission on every iOS version.**

Reliable prep (pick one):

1. **Preferred:** Settings → TechFlash  
   - Location → **Ask Next Time** (or equivalent Ask option)  
   - Notifications → Off (so onboarding can request again)
2. **Broader:** Settings → General → Transfer or Reset iPhone → Reset → **Reset Location & Privacy**  
   (resets permission decisions for all apps)
3. Then delete TechFlash and reinstall from TestFlight so onboarding AsyncStorage is also cleared.

Before recording, confirm TechFlash is not already listed as Allowed/Denied for Location if you need the system sheet on camera.

---

## 2) Exact tap script (start recording from the Home Screen)

**Tip:** Have passwords in a password manager; paste once if needed, or cut away from password fields when possible.

1. Control Center → **Screen Recording** → start.
2. Tap the **TechFlash** icon.
3. Welcome → **Create account**.
4. Register a disposable **Technician**:
   - Role: Technician  
   - Email / password / confirm / name / phone  
   - City, State, ZIP  
   - Trade (e.g. Electrician) + Class (Journeyman)  
   - Tap **Create account**
5. Permissions onboarding:
   - **Continue** → iOS Location sheet → **Allow While Using App** (or Don’t Allow once if demonstrating denial; app must still proceed)
   - **Continue** → iOS Notifications sheet → **Allow** (or Don’t Allow)
   - **Enter TechFlash**
6. Account tab → **Log out**.
7. **Log in** as technician reviewer.
8. If permissions onboarding appears again, tap through quickly (Already decided = no second OS sheet).
9. **Jobs** → open **App Review Demo Job**.
10. Confirm location / schedule / company render → tap **Claim** → success notice.
11. **Messages** → open the App Review conversation (Job #… / seeded thread).
12. Send a short message (e.g. `Review walkthrough message`).
13. Safety → enter report text → **Report this conversation** → confirm → see success.
14. **Block this user** → confirm → composer hidden / messaging unavailable notice.
15. Account → Open settings → Account → **Blocked users** → **Unblock** (required so company login messaging isn’t stuck for later rehearsals).
16. **Log out**.
17. **Log in** as company reviewer.
18. Jobs → **Create job** (or Create from Jobs UI):
    - Title / description / class / city / schedule  
    - **Leave Hourly rate blank**  
    - Submit → lands on job detail without Stripe
19. Account → **Privacy Policy**, **Terms of Service**, **Contact Support** (confirm pages/mail open; return to app).
20. **Log out** → log in as the **disposable** account from step 4.
21. Account → Open settings → **Delete account permanently** → confirm → signed out.
22. Stop screen recording.

---

## 3) If a step fails

| Failure | Fix |
|---------|-----|
| No OS permission sheet | Permission already decided — use §1 reset, reinstall, retry from step 2 |
| Registration error about trade/class | Select trade + Apprentice/Journeyman/Master |
| No open jobs / claim 403 | Re-run `rails app_review:prepare` on production |
| Claim succeeded earlier, job gone | Re-run `app_review:prepare` (reopens demo job) |
| Messaging blocked before demo | Settings → Blocked users → Unblock, or re-run prepare |
| Create job asks for payment | Clear Hourly rate and resubmit |
| Legal link blank | Use `www.techflash.app` URLs; check network |
| Wrong API / empty data | Confirm TestFlight build used **production** EAS profile |

---

## 4) Implementation status (honest)

| Area | Status |
|------|--------|
| Registration / login / logout / deletion | Verified via code + live API |
| Permission onboarding wiring + Info.plist / plugins | Verified via Expo config + code |
| OS permission sheets on device | **Requires physical iPhone** |
| Reviewer login | Live API verified |
| Claimable demo job | Requires production `app_review:prepare` (claim currently blocked until that runs) |
| Messaging / report / block | Live API + code verified |
| Unpriced company post | Live API verified |
| Legal links | HTTP 200 verified |
| Full Home-Screen recording | **Physical device only** |

Remote push delivery is **not** claimed (token stored locally only).

---

## 5) Claude / agent: generate TestFlight build

```text
In ethanfree23/TechFlash on branch from merged PR #43 (or the PR branch if building pre-merge):
1. cd techflash-mobile
2. Ensure EXPO_TOKEN / eas login is available
3. npm ci && npm run typecheck && npm test
4. npm run eas:build:prod:ios
5. Wait for EAS success; share TestFlight / build URL with Ethan
6. Do NOT submit to App Store Connect unless Ethan explicitly authorizes npm run eas:submit:prod:ios
7. Reminder: Ethan must run `bundle exec rails app_review:prepare` on production before recording
```

---

## 6) Ethan: record walkthrough

1. Rotate reviewer passwords if they were ever in git; put new password only in App Store Connect.
2. Run `app_review:prepare` on production; confirm `claimable: true`.
3. Install the production TestFlight build from §5.
4. Reset permission state (§1).
5. Follow §2 exactly once.
6. Upload the recording in App Store Connect.
