# Email Setup Guide

SkilledHub sends automated emails for key events. Configure your mailer to deliver them.

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

## Backend Configuration

### 1. Set mailer "from" address

Add to `skilled_hub_api/.env`:

```
MAILER_FROM=noreply@yourdomain.com
```

### 2. Configure SMTP (production)

Edit `skilled_hub_api/config/environments/production.rb` or use environment variables:

```ruby
config.action_mailer.delivery_method = :smtp
config.action_mailer.smtp_settings = {
  address:              ENV['SMTP_ADDRESS'] || 'smtp.example.com',
  port:                 ENV['SMTP_PORT'] || 587,
  domain:               ENV['SMTP_DOMAIN'] || 'yourdomain.com',
  user_name:            ENV['SMTP_USERNAME'],
  password:             ENV['SMTP_PASSWORD'],
  authentication:       :plain,
  enable_starttls_auto: true
}
```

### 3. Development

By default, Rails does not raise delivery errors in development. To test emails:

- Use [Mailtrap](https://mailtrap.io) or [MailHog](https://github.com/mailhog/MailHog)
- Or set `config.action_mailer.delivery_method = :letter_opener` (add gem `letter_opener`)

### 4. Review reminders (scheduled task)

Run daily via cron or a scheduler (e.g. Heroku Scheduler):

```bash
cd skilled_hub_api && bundle exec rake skilled_hub:review_reminders
```

Example cron (daily at 9am):

```
0 9 * * * cd /path/to/skilled_hub_api && bundle exec rake skilled_hub:review_reminders
```
