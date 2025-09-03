import { AppServer } from '../src/server.js';

// Get the test server instance created in test/setup.ts, which is run at vitest initialisation
function getTestServer(): AppServer {
  if (!globalThis.__testServer) {
    throw new Error('Test server not initialized. Make sure setup.ts runs before tests.');
  }
  return globalThis.__testServer;
}

// Export the singleton instance
const testServer = getTestServer();
export const app = testServer.app;
export const server = testServer;
