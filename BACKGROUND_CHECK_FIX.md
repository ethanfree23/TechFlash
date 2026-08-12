# Background Check Authentication Fix

## Problem

When technicians try to start a background check, they encounter a "Bad authentication error (401)" message. This error occurs because the application is attempting to connect to Checkr's background check API without proper credentials configured.

## Root Cause

The application uses Checkr (https://checkr.com) as the background check provider. When the settings page loads, it tries to fetch background check options from Checkr's API to display available packages and configurations. However, if the Checkr API credentials are not configured, the API call fails with a 401 authentication error.

The error occurs in this flow:
1. Frontend calls `/api/v1/verification/background_check_options`
2. Backend tries to fetch packages and nodes from Checkr API
3. Checkr API returns 401 due to missing/invalid API key
4. Error propagates to frontend and displays as "Bad authentication error (401)"

## Solution

There are two ways to fix this issue:

### Option 1: Enable Demo Bypass Mode (Recommended for Development/Testing)

This mode allows the background check flow to work without connecting to Checkr's actual API. The application will simulate the background check process.

**For Local Development:**
1. Environment variables are now configured in `skilled_hub_api/.env`:
   ```bash
   CHECKR_ENABLED=true
   CHECKR_BACKGROUND_CHECKS_ENABLED=true
   CHECKR_DEMO_BYPASS=true
   CHECKR_ENVIRONMENT=staging
   CHECKR_DEFAULT_PACKAGE=essential
   CHECKR_PRODUCTION_ENABLED=false
   ```

2. Restart the Rails server to apply the changes

**For Deployed Environments (like demo.techflash.app):**
1. Set the environment variable on your server/deployment platform:
   ```bash
   CHECKR_DEMO_BYPASS=true
   ```

2. Restart the application

### Option 2: Configure Real Checkr API Credentials (For Production)

If you have a Checkr account and want to use the real background check service:

1. Get your API credentials from Checkr dashboard
2. Set these environment variables:
   ```bash
   CHECKR_SECRET_KEY=your_checkr_api_key_here
   CHECKR_WEBHOOK_SECRET=your_webhook_secret_here
   CHECKR_WEBHOOK_URL=https://your-domain.com/api/v1/webhooks/checkr
   CHECKR_DEFAULT_PACKAGE=essential  # or your package slug
   CHECKR_ENVIRONMENT=staging  # or production
   ```

3. Restart the application

## Code Changes Made

1. **Improved Error Handling**: Modified `background_check_options` endpoint to return graceful error responses instead of throwing exceptions
   - Changed from returning 422 status to returning 200 with error details
   - Frontend can now display helpful error messages without breaking the UI

2. **Better Configuration Check**: Added early check for API credentials before attempting API calls
   - Checks if client is configured before making requests
   - Returns clear error message: "Checkr API credentials are not configured. Set CHECKR_SECRET_KEY or enable CHECKR_DEMO_BYPASS=true for testing."

3. **Environment Configuration**: Created `.env` and `.env.development` files with demo bypass enabled by default for local development

## Testing the Fix

### Local Development:
1. Start the Rails API server:
   ```bash
   cd skilled_hub_api
   rails server
   ```

2. Start the frontend:
   ```bash
   cd skilled-hub-frontend
   npm run dev
   ```

3. Navigate to Settings → Profile tab
4. You should now see the background check section without the 401 error
5. Click "Start background check" - it should work in demo mode

### Deployed Environment:
1. Set `CHECKR_DEMO_BYPASS=true` in your environment variables
2. Restart the application
3. Visit the settings page
4. The error should be resolved

## How Demo Bypass Works

When `CHECKR_DEMO_BYPASS=true`:
- Backend returns mock data for background check options without calling Checkr API
- Frontend displays the background check UI normally  
- When user clicks "Start background check", it creates a simulated background check record
- No actual API calls are made to Checkr
- The flow completes successfully for testing purposes

## Related Files

- `skilled_hub_api/app/controllers/api/v1/verifications_controller.rb` - API endpoint handling
- `skilled_hub_api/app/services/checkr_client.rb` - Checkr API client
- `skilled_hub_api/app/services/checkr_configuration.rb` - Configuration management
- `skilled_hub_api/CHECKR_DEMO_AS_STAGING.md` - Detailed Checkr integration documentation
- `skilled_hub_api/.env` - Environment configuration (local development)
- `skilled-hub-frontend/src/pages/SettingsPage.jsx` - Frontend settings page

## Future Improvements

1. Add admin UI to configure Checkr credentials
2. Add better error messages in the UI when configuration is missing
3. Add health check endpoint to verify Checkr API connectivity
4. Add retry logic for transient API errors
