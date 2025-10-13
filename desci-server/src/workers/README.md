# Workers & Background Jobs

This directory contains background jobs, cron workers, and scheduled tasks that run independently from the main API server.

## Overview

Workers handle long-running, scheduled, or asynchronous tasks that shouldn't block API requests:

- **Email Reminders** - Time-based email notifications (overdue reviews, upcoming deadlines)

## Workers

### Email Reminder Job

**Files:**

- `emailReminderRunner.ts` - Main runner script (executed by K8s CronJob)
- `emailReminderConfig.ts` - Configuration defining all reminder types

**Schedule:** Every 4 hours (configurable in K8s CronJob YAML)

**What it does:**
Checks for time-based conditions and sends email reminders:

- Overdue referee reviews
- Upcoming review deadlines (3 days before)
- Pending editor invites (7+ days old)

**Deployment:**

- **Dev:** `kubectl apply -f kubernetes/cronjob_email_reminders_dev.yaml`
- **Prod:** `kubectl apply -f kubernetes/cronjob_email_reminders_prod.yaml`

**Local Testing:**

```bash
# Normal run
npm run script:email-reminders

# Dry run mode (see what would be sent without sending)
EMAIL_REMINDER_DRY_RUN=true npm run script:email-reminders

# With test handler enabled (set TEST_EMAIL_ADDRESS)
TEST_EMAIL_ADDRESS=your@email.com npm run script:email-reminders

# Dry run + test email
EMAIL_REMINDER_DRY_RUN=true TEST_EMAIL_ADDRESS=your@email.com npm run script:email-reminders
```

**Adding New Reminder Types:**

1. Add a new handler in `emailReminderConfig.ts`:

```typescript
const checkMyNewReminder: EmailReminderHandler = {
  name: 'My New Reminder',
  description: 'Description of what this checks',
  enabled: true,
  handler: async () => {
    // Your logic here
    // Query DB, check conditions, send emails
    return { sent: 0, skipped: 0, errors: 0 };
  },
};
```

2. Add it to the `EMAIL_REMINDER_HANDLERS` array:

```typescript
export const EMAIL_REMINDER_HANDLERS: EmailReminderHandler[] = [
  checkOverdueRefereeReviews,
  checkUpcomingRefereeDeadlines,
  checkMyNewReminder, // <-- Add here
];
```

3. Test locally, then deploy via K8s CronJob

**Monitoring:**

- Check logs: `kubectl logs -l App=EmailReminderDev -n default`
- Discord notifications sent after each run with summary
- Failed jobs kept in history (see `failedJobsHistoryLimit` in YAML)

## Best Practices

1. **Idempotency** - Workers should be safe to run multiple times (use unique constraints, upserts, status checks)
2. **Error Handling** - Catch and log errors, don't crash the entire job
3. **Monitoring** - Send Discord notifications for failures
4. **Testing** - Always test locally with `npm run script:*` before deploying
5. **Resource Limits** - Set appropriate CPU/memory in K8s YAML
6. **Timeouts** - Consider job execution time vs schedule frequency

## Deployment

After making changes:

```bash
# Build and push Docker image
cd nodes/desci-server
npm run build
docker build -t 523044037273.dkr.ecr.us-east-2.amazonaws.com/desci-server-dev:latest .
docker push 523044037273.dkr.ecr.us-east-2.amazonaws.com/desci-server-dev:latest

# Deploy CronJob
kubectl apply -f kubernetes/cronjob_email_reminders_dev.yaml

# Verify
kubectl get cronjobs
kubectl get jobs

# Trigger manually (for testing)
kubectl create job --from=cronjob/email-reminder-cronjob-dev test-run-$(date +%s)

# Test with custom email (easiest method - shell into running pod)
POD=$(kubectl get pods -l App=DesciServerDev -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -- bash -c "TEST_EMAIL_ADDRESS=your@email.com npm run script:email-reminders"
```

## Troubleshooting

**Job not running:**

```bash
kubectl get cronjobs
kubectl describe cronjob email-reminder-cronjob-dev
```

**Check logs:**

```bash
# List jobs
kubectl get jobs -l App=EmailReminderDev

# Get logs from latest job
kubectl logs -l App=EmailReminderDev --tail=100
```

**Job stuck in pending:**

```bash
kubectl describe job <job-name>
# Check for resource limits, image pull errors, etc.
```

**Disable a CronJob:**

```bash
kubectl patch cronjob email-reminder-cronjob-dev -p '{"spec":{"suspend":true}}'
```

**Enable again:**

```bash
kubectl patch cronjob email-reminder-cronjob-dev -p '{"spec":{"suspend":false}}'
```
