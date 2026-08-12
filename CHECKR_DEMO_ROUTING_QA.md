# Checkr Start + Demo Routing QA

## Preconditions
- Backend Checkr vars are valid on Railway (staging key, `CHECKR_DEMO_BYPASS=false`).
- Browser local override is off: `localStorage.checkrDemoBypassEnabled = "0"`.
- Use a premium technician account in demo.

## Scenario 1: Checkr options failure should not silently simulate
1. Force backend Checkr options failure (invalid key or disabled endpoint).
2. Open `Settings -> Profile` as technician.
3. Verify options request fails in network (`/verification/background_check_options`).
4. Expected:
   - Error message is shown in the UI with backend error text.
   - Start button remains disabled (unless explicit bypass is enabled).
   - No simulated invitation popup appears automatically.

## Scenario 2: Healthy premium start should hit real endpoint
1. Restore valid Checkr staging credentials.
2. Open technician `Settings -> Profile`.
3. Accept both consent checkboxes.
4. Click `Start background check`.
5. Expected:
   - `POST /verification/start_background_check` appears in network.
   - Response includes Checkr `invitation_url`.
   - Browser redirects to Checkr hosted page.

## Scenario 3: Demo admin masquerade stays inside `/demo`
1. Login as admin in demo.
2. Go to Admin Users and masquerade as a technician/company.
3. Expected:
   - Redirect target is `/demo/dashboard` (not `/dashboard`).
   - Back/refresh does not jump to prod `/login`.

## Scenario 4: Demo Environment entry consistency
1. Login as production admin.
2. Click `Open Demo Environment`.
3. Expected:
   - Opens `/demo/login?demo=admin&auto=1`.
   - Auto-login path remains deterministic.
