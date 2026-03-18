# Email Setup Guide

TechFlash sends automated emails for key events. Configure your mailer to deliver them.

## Email Events

| Event | Recipient | When |
|-------|-----------|------|
| Welcome | New user | User signs up |
| Job posted | Company | Company creates a job |
| Job claimed | Company | Technician claims a job |
| Job accepted | Technician | Company accepts technician |
| New message | Other party | Someone sends a message |
| Payment confirmation | Company | Company pays for a job |
| Payment received | Technician | Funds released to technician |
| Review received | Reviewee | Someone leaves a review |
| Review reminder | Company/Technician | 3–7 days after job complete, if no review yet |

---

## Quick Start (Development)

### Option A: Mailtrap (recommended for dev)

1. Sign up at [mailtrap.io](https://mailtrap.io) (free).
2. Go to **Email Testing** → **Inboxes** → select your inbox → **SMTP Settings**.
3. Add to `skilled_hub_api/.env`:

```
MAILER_FROM=noreply@techflash.local
SMTP_ADDRESS=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USERNAME=your_mailtrap_username
SMTP_PASSWORD=your_mailtrap_password
```

4. Restart Rails. Emails will appear in your Mailtrap inbox. (SMTP is already configured in `development.rb` when these env vars are set.)

---

### Option B: Letter Opener (open emails in browser)

1. Add to `skilled_hub_api/Gemfile` (in the development group):

```ruby
gem 'letter_opener'
```

2. Run `bundle install`.

3. Add to `skilled_hub_api/config/environments/development.rb`:

```ruby
config.action_mailer.delivery_method = :letter_opener
config.action_mailer.perform_deliveries = true
```

4. Restart Rails. Emails will open in your browser when sent.

---

### Option C: Gmail (real delivery)

1. Enable 2FA on your Google account.
2. Create an [App Password](https://myaccount.google.com/apppasswords).
3. Add to `skilled_hub_api/.env`:

```
MAILER_FROM=your@gmail.com
SMTP_ADDRESS=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your@gmail.com
SMTP_PASSWORD=your_16_char_app_password
```

4. Restart Rails. (SMTP is already configured in `development.rb` when these env vars are set.)

---

## Production

Use a transactional email service (SendGrid, Mailgun, Amazon SES, etc.) and set:

```
MAILER_FROM=noreply@yourdomain.com
SMTP_ADDRESS=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USERNAME=apikey
SMTP_PASSWORD=your_sendgrid_api_key
```

Configure `config/environments/production.rb` with the same SMTP settings block.

---

## Background Jobs

Emails are sent with `deliver_later` (ActiveJob). In development, Rails uses the `:async` adapter by default, which runs jobs in a thread. If emails don’t send, ensure no errors in the Rails log when the event occurs.

For production, use a real queue (Sidekiq, Resque, etc.) and set `config.active_job.queue_adapter`.

---

## Review Reminders (scheduled task)

Run daily via cron or a scheduler:

```bash
cd skilled_hub_api && bundle exec rake skilled_hub:review_reminders
```

Example cron (daily at 9am):

```
0 9 * * * cd /path/to/skilled_hub_api && bundle exec rake skilled_hub:review_reminders
```
