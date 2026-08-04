# TechFlash App Store Review Package (iOS 1.0)

## App identity

- Name: `TechFlash`
- Bundle ID: `com.techflash.app`
- SKU: `TECHFLASH-IOS-001`
- Apple ID (`ascAppId`): `6796826209`
- Primary category: `Business`
- Secondary category: `Productivity`
- Suggested subtitle: `Skilled Trades, On Demand`
- License agreement: Apple Standard License Agreement

## Reviewer account requirements

Verified active reviewer accounts (Production API):
- Company: `review.company.20260804173342@techflash.app`
- Technician: `review.tech.20260804173342@techflash.app`
- Password (both): `TfReview!2026`

Validation result:
- Demo credentials (`demo.company@techflash.app`, `demo.tech@techflash.app`) return `401` in production and are not usable for App Review.
- Dedicated fallback accounts were created and verified on the live API.
- Login is email + password only on mobile (`/sessions`) with no OTP/MFA challenge step in the app auth flow.

### Technician reviewer account
- Username: `review.tech.20260804173342@techflash.app`
- Password: `TfReview!2026`
- Must be active during review window
- Must have a completed profile with realistic fictional data
- Must be able to access at least one open job and one message thread
- Must not require real payment or real background-check completion for core app walkthrough

### Company reviewer account
- Username: `review.company.20260804173342@techflash.app`
- Password: `TfReview!2026`
- Must be active during review window
- Must have realistic fictional company profile data
- Must be able to open sample jobs, view job detail, and open message flow
- Must not require private OTP workflows unavailable to Apple reviewers

## Fictional demo-data requirements

- At least 3 open jobs (mixed skill classes)
- At least 1 claimed/in-progress job
- At least 1 completed job
- At least 1 active conversation per role
- Realistic fictional addresses/contacts only
- No real customer data

## Required sample-job state

1. Open job discoverable by technician.
2. Job already claimed and message-capable.
3. Completed job with payment timeline visible.

## Review-safe Stripe behavior

- Real-world job-related payment architecture remains intact.
- Technician payout onboarding remains available via Stripe Connect link flow.
- iOS v1 membership purchase/upgrade CTA is suppressed by platform guard.
- No iOS UI path should direct users to external membership checkout.

## Review-safe Checkr behavior

- Checkr-related backend routes exist, but reviewer demo flow should not require real screening completion.
- Use seeded/demo-ready states where needed for App Review walkthrough.

## Account-deletion test instructions

1. Navigate to Settings -> Account -> Delete account permanently.
2. Verify permanence + retention explanation is visible.
3. Confirm destructive dialog appears and requires explicit confirmation.
4. Confirm deletion call signs user out and local session is cleared.
5. Verify subsequent access with same session is denied.

## Reporting/blocking test instructions

1. Report job from job detail safety section.
2. Report conversation issue from conversation safety section.
3. Block other participant from conversation and verify blocked state behavior.
4. Unblock from Settings -> Account -> Blocked users.

## Recommended screenshot scenes (5)

1. Technician dashboard with map + open jobs list.
2. Company job detail with timeline and messaging action.
3. Conversation screen with reporting/block controls visible.
4. Settings -> Notifications and profile fields.
5. Settings -> Membership panel showing status without iOS purchase CTA.

## Current screenshot dimensions (App Store Connect)

Use Apple App Store Connect screenshot specification references for final upload validation.

### iPhone required class
- 6.9" display accepted portrait sizes:
  - `1320 x 2868`
  - `1290 x 2796`
  - `1260 x 2736`
- Landscape uses reversed dimensions.

### iPad required when app supports iPad
- 13" display accepted portrait sizes:
  - `2064 x 2752`
  - `2048 x 2732`
- Landscape uses reversed dimensions.

Notes:
- Upload 1-10 screenshots per required device class.
- JPEG/PNG RGB, no alpha channel.
- App supports iPad (`supportsTablet: true`), so iPad screenshots are required.

## App Store metadata draft

### Subtitle
- `Skilled Trades, On Demand`

### Description draft
TechFlash connects companies with skilled trade technicians for real-world job work.  
Companies can create and manage jobs, communicate with technicians, and track job progress.  
Technicians can discover opportunities, manage active work, message companies, and maintain profile and notification preferences.  
Built-in reporting and blocking tools support trust and safety workflows.

### Keywords draft
- skilled trades
- technician jobs
- field service
- contractor staffing
- job marketplace
- trade professionals
- dispatch
- workforce

## Content rights response

TechFlash displays user-submitted content, including job listings, company profiles, technician profiles, biographies, credentials, messages, reviews, and images.

Before submission, confirm Terms of Service explicitly grant TechFlash:
- a license to host and display submitted content, and
- user representation that they own or are authorized to submit all uploaded content.

Do not assert sufficient rights in App Store Connect until that legal language is verified.

## Privacy policy and support URL requirements

- Privacy policy URL must be publicly accessible.
- Support URL must be publicly accessible and monitored.
- In-app links should match App Store Connect metadata.

## Age-rating considerations

- User-generated content and messaging require conservative rating inputs.
- If user profiles/jobs/messages can include mature language/content, rate accordingly.
- Keep moderation/reporting controls documented in review notes.

## App Privacy inventory (summary)

Potentially collected in app/backend workflow:
- name
- email
- phone
- address/location
- user role/id
- profile fields
- messages
- job data
- payment-related metadata
- background-check-related status data
- notification preferences

For each item in App Privacy answers, confirm:
- purpose,
- linked/unlinked status,
- tracking usage (if any),
- third-party recipients (e.g., Stripe/Checkr/backends).

## Export-compliance result

Current implementation indicates ordinary HTTPS/TLS + auth + secure storage only.

Configured:
- `ios.config.usesNonExemptEncryption = false`
- `ITSAppUsesNonExemptEncryption = false`

Expected App Store Connect handling:
- No App Encryption Documentation upload needed for this current scope.
- Leave encryption-document upload section empty unless non-exempt encryption is later introduced.

## Draft App Review Notes

TechFlash is a marketplace app for real-world skilled-trade job coordination between companies and technicians.

Reviewer personas:
- Technician: `review.tech.20260804173342@techflash.app` / `TfReview!2026`
- Company: `review.company.20260804173342@techflash.app` / `TfReview!2026`

Suggested review path:
1. Sign in as company and review Jobs, Job Detail, and Messages flows.
2. Sign out and sign in as technician to review Dashboard, Jobs, and Messages flows.
3. Open Settings and confirm account/profile/notification features.
4. Verify trust & safety actions (reporting/blocking).

Billing notes:
- TechFlash preserves real-world job payment and payout architecture.
- iOS v1 intentionally disables in-app membership purchase/upgrade actions.

Support contact placeholders:
- Contact name: `APP_REVIEW_CONTACT_NAME`
- Contact email: `APP_REVIEW_CONTACT_EMAIL`
- Contact phone: `APP_REVIEW_CONTACT_PHONE`

## App Store Connect copy/paste fields

Sign-In Information (required field):
- Username: `review.company.20260804173342@techflash.app`
- Password: `TfReview!2026`

App Review Notes (add secondary role account):
- Secondary technician login: `review.tech.20260804173342@techflash.app` / `TfReview!2026`
- What to test: company job list/detail + messages, then technician dashboard/jobs + messages, then trust/safety report/block actions and settings.
