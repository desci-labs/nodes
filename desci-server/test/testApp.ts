import { AppServer } from '../src/server.js';

// Global singleton to ensure only one AppServer instance across all test imports
let testServerInstance: AppServer | null = null;

function getTestServer(): AppServer {
  if (!testServerInstance) {
    testServerInstance = new AppServer();
  }
  return testServerInstance;
}

// Export the singleton instance
const testServer = getTestServer();
export const app = testServer.app;
export const server = testServer;
