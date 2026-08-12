# Quick Fix Guide - Background Check 401 Error

## Immediate Fix (Demo/Testing Environments)

If you're seeing "Bad authentication error (401)" when trying to start a background check, here's the fastest fix:

### Option 1: Set Environment Variable (Recommended)

Add this environment variable to your server/deployment:

```bash
CHECKR_DEMO_BYPASS=true
```

Then restart your application. This enables demo mode which bypasses the Checkr API.

### Option 2: For Local Development

1. Copy the `.env.example` file:
   ```bash
   cd skilled_hub_api
   cp .env.example .env
   ```

2. The file already has `CHECKR_DEMO_BYPASS=true` set

3. Restart the Rails server:
   ```bash
   rails server
   ```

## What This Fixes

- ✅ Removes "Bad authentication error (401)" from settings page
- ✅ Allows background check section to load properly
- ✅ Enables testing the background check flow without Checkr credentials
- ✅ "Start background check" button will work in demo mode

## For Production Use

When you're ready to use real background checks:

1. Get credentials from Checkr: https://dashboard.checkr.com
2. Set these environment variables:
   ```bash
   CHECKR_SECRET_KEY=your_api_key_here
   CHECKR_WEBHOOK_SECRET=your_webhook_secret
   CHECKR_WEBHOOK_URL=https://your-domain.com/api/v1/webhooks/checkr
   CHECKR_DEMO_BYPASS=false
   ```
3. Restart the application

## Need More Help?

See `BACKGROUND_CHECK_FIX.md` for detailed documentation.

## Changes in This PR

- Fixed error handling to show helpful messages instead of breaking the UI
- Added configuration template with comments
- Created detailed documentation
- Made demo mode the default for development

Pull Request: #4
Branch: cursor/fix-background-check-auth-error-3540
