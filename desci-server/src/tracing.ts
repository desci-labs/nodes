import { HoneycombSDK } from '@honeycombio/opentelemetry-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

import logger from './logger';

// uses the HONEYCOMB_API_KEY and OTEL_SERVICE_NAME environment variables
if (process.env.HONEYCOMB_API_KEY && process.env.OTEL_SERVICE_NAME) {
  logger.info(
    '[DeSci Nodes] Honeycomb Telemetry Starting',
    process.env.HONEYCOMB_API_KEY,
    process.env.OTEL_SERVICE_NAME,
  );
  const sdk = new HoneycombSDK({
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  logger.info('[DeSci Nodes] Honeycomb Telemetry Started');
} else {
  logger.info('[DeSci Nodes] Honeycomb Telemetry not configured (ok for local dev)');
}
