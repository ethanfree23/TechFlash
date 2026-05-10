# TechFlash App Store Review Notes

## App Summary
TechFlash connects companies with skilled technicians for real-world labor and field work. Companies post jobs, technicians claim and complete jobs, and both sides coordinate in-app.

## Reviewer Test Credentials
- Company reviewer account: `TODO_ADD_COMPANY_TEST_EMAIL`
- Technician reviewer account: `TODO_ADD_TECH_TEST_EMAIL`
- Password: `TODO_ADD_TEST_PASSWORD`
- Optional admin account: `TODO_ADD_ADMIN_TEST_EMAIL`

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
- Job and membership billing currently use hosted Stripe web checkout and card/bank flows.
- No Apple In-App Purchase is used for job labor payments.
- TODO(AppReview): legal/product confirmation is still required for whether any membership tier behavior should be treated as a digital iOS entitlement requiring StoreKit IAP.

## Support / Contact
- Support email: `support@techflash.app`
- Legal pages:
  - `https://techflash.app/privacy-policy`
  - `https://techflash.app/terms-of-service`

## Known Limitations / TODO Before Submission
- Replace all `TODO_ADD_*` test credentials with active App Review accounts.
- Confirm final legal position on membership checkout vs Apple IAP requirements.
- Re-verify all production environment variables for API base URLs and frontend URL redirects.
- Run a final iOS device QA pass on an EAS iOS build (not Expo Go).
