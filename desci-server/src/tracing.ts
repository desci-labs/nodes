import { HoneycombSDK } from '@honeycombio/opentelemetry-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// uses the HONEYCOMB_API_KEY and OTEL_SERVICE_NAME environment variables
if (process.env.HONEYCOMB_API_KEY && process.env.OTEL_SERVICE_NAME) {
  console.log(
    '[DeSci Nodes] Honeycomb Telemetry Starting',
    process.env.HONEYCOMB_API_KEY,
    process.env.OTEL_SERVICE_NAME,
  );
  const sdk = new HoneycombSDK({
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log('[DeSci Nodes] Honeycomb Telemetry Started');
} else {
  console.log('[DeSci Nodes] Honeycomb Telemetry not configured (ok for local dev)');
}
