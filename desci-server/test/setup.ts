import { afterAll, beforeAll } from 'vitest';

import { AppServer, createServer } from '../src/server.js';

declare global {
  /* eslint-disable no-var */
  var __testServer: AppServer | undefined;
  var __testServerReady: Promise<void> | undefined;
  /* eslint-enable no-var */
}

// Only create the server once, even if setupFiles runs multiple times
if (!globalThis.__testServer) {
  console.log('Creating test server instance...');
  const testServer = createServer();
  globalThis.__testServer = testServer;

  // Store the ready promise so all test files can await it
  globalThis.__testServerReady = testServer.ready().then(() => {
    console.log('Test server initialized and ready');
  });
}

// Each test file waits for the server to be ready
beforeAll(async () => {
  if (globalThis.__testServerReady) {
    await globalThis.__testServerReady;
  }
});
