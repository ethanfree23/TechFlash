# TechFlash App Store Review Notes

## App Summary
TechFlash connects companies with skilled technicians for real-world labor and field work. Companies post jobs, technicians claim and complete jobs, and both sides coordinate in-app.

## Reviewer Test Credentials

Deliver passwords **only** through App Store Connect → App Review Information (Sign-in required).  
Do **not** commit reviewer passwords to git.

- Company reviewer username: `review.company.20260804173342@techflash.app`
- Technician reviewer username: `review.tech.20260804173342@techflash.app`
- Password: store in App Store Connect / password manager only

### Credential hygiene
Reviewer passwords previously appeared in tracked markdown in this repository. Before submission:
1. Rotate both reviewer account passwords in production.
2. Put the new password only in App Store Connect Sign-in Information.
3. Re-run `bundle exec rails app_review:prepare` on production after any account repair.

## Main Reviewer Flows
1. Log in as a company user.
2. Create an **unpriced** job (leave hourly rate blank) with title, description, location, and schedule.
3. Open job detail and start/open a conversation when a technician relationship exists.
4. Open Settings and verify Privacy Policy, Terms of Service, Support, and account deletion.
5. Log in as a technician user.
6. Browse jobs, open **App Review Demo Job**, and claim it.
7. Open Messages and send / report / block.

## Real-World Services and Payments
- TechFlash is a marketplace for real-world labor/services.
- Job and payout billing use hosted Stripe web checkout and card/bank flows.
- No Apple In-App Purchase is used for job labor payments.
- iOS v1 disables in-app membership purchase/upgrade actions; existing members can still sign in and retain benefits.
- App Review walkthrough must use unpriced or funding-waived demo jobs only — no live Stripe charges.

## Support / Contact
- Support email: `support@techflash.app`
- Legal pages:
  - `https://www.techflash.app/privacy-policy`
  - `https://www.techflash.app/terms-of-service`

## Before Recording / Submission
- Production: `bundle exec rails app_review:prepare` then `bundle exec rails app_review:status`
- Install the latest production TestFlight build from EAS (`eas:build:prod:ios`)
- Follow: `techflash-mobile/docs/app-review-recording-readiness.md`
