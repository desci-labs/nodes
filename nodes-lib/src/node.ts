/**
 * Node.js exports from nodes-lib
 * This module includes all functionality, including Node.js-specific functions
 */

// Re-export everything from the browser module
export * from "./browser.js";

// Add Node.js-specific file upload functionality
export { uploadFiles } from "./node-only/file-uploads.js";

// Add FlightSQL-dependent Codex query functions
export {
  getFullState,
  getCurrentState,
  getCodexHistory,
} from "./node-only/flight-sql.js";

// Add history functions that depend on FlightSQL
export { getPublishHistory } from "./node-only/history.js";
