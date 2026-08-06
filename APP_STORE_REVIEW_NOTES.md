# TechFlash App Store Review Notes

## App Summary
TechFlash connects companies with skilled technicians for real-world labor and field work. Companies post jobs, technicians claim and complete jobs, and both sides coordinate in-app.

## Reviewer Test Credentials
- Company reviewer account: `review.company.20260804173342@techflash.app`
- Technician reviewer account: `review.tech.20260804173342@techflash.app`
- Password (both): `TfReview!2026`

## Main Reviewer Flows
1. Log in as a company user.
2. Create a job with title, description, location, and schedule.
3. Open job detail and start a conversation.
4. Submit a job report from job detail.
5. Open Settings and verify:
   - Privacy Policy link
   - Terms of Service link
   - Support contact link
   - Account deletion flow
6. Log in as a technician user.
7. Browse jobs, open a job detail, and claim a job.
8. Open Messages and:
   - send a message
   - report a conversation
   - block the other user

## Real-World Services and Payments
- TechFlash is a marketplace for real-world labor/services.
- Job and payout billing use hosted Stripe web checkout and card/bank flows.
- No Apple In-App Purchase is used for job labor payments.
- iOS v1 disables in-app membership purchase/upgrade actions; existing members can still sign in and retain benefits.

## Support / Contact
- Support email: `support@techflash.app`
- Legal pages:
  - `https://techflash.app/privacy-policy`
  - `https://techflash.app/terms-of-service`

## Known Limitations / TODO Before Submission
- Run a final on-device TestFlight pass with both reviewer accounts (company + technician).
- Confirm sample data remains visible during Apple's review window.
