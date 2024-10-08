import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const ENABLE_TELEMETRY = process.env.NODE_ENV === 'production';

if (ENABLE_TELEMETRY) {
  Sentry.init({
    dsn: 'https://d508a5c408f34b919ccd94aac093e076@o1330109.ingest.sentry.io/6619754',
    release: 'desci-nodes-repo@' + process.env.npm_package_version,
    integrations: [nodeProfilingIntegration()],
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}
