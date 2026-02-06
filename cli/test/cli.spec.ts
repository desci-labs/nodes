import { describe, test, expect, beforeAll, afterAll } from "vitest";
import axios from "axios";
import {
  NODESLIB_CONFIGS,
  setApiKey,
  setNodesLibConfig,
  setQuietMode,
} from "@desci-labs/nodes-lib/node";
import {
  listNodes,
  createDraftNode,
  getDraftNode,
  deleteDraftNode,
} from "@desci-labs/nodes-lib/node";

// Use environment variable for API key, or skip tests if not set
const TEST_API_KEY = process.env.NODES_TEST_API_KEY;
// Default to local, but allow override via env var
const TEST_ENV = (process.env.NODES_TEST_ENV || "local") as "local" | "dev" | "staging" | "prod";

// Configure for testing
setQuietMode(true);
setNodesLibConfig(NODESLIB_CONFIGS[TEST_ENV]);
if (TEST_API_KEY) {
  setApiKey(TEST_API_KEY);
}

describe("CLI Integration Tests", () => {
  beforeAll(async () => {
    if (!TEST_API_KEY) {
      console.log("Skipping integration tests - NODES_TEST_API_KEY not set");
      console.log("Set NODES_TEST_API_KEY environment variable to run integration tests");
      return;
    }
    
    const apiUrl = NODESLIB_CONFIGS[TEST_ENV].apiUrl;
    try {
      console.log(`Checking server reachable at ${apiUrl}...`);
      await axios.get(apiUrl);
      console.log("Server is reachable");
    } catch {
      const localHint = TEST_ENV === "local" 
        ? " Run: ./dockerDev.sh (in the nodes root directory)" 
        : "";
      // Throw an error instead of process.exit() so other test suites can still run
      throw new Error(
        `Failed to connect to desci-server at ${apiUrl}.${localHint}`
      );
    }
  });

  describe("List Nodes", () => {
    test.skipIf(!TEST_API_KEY)("should list nodes for authenticated user", async () => {
      const result = await listNodes();
      expect(result).toHaveProperty("nodes");
      expect(Array.isArray(result.nodes)).toBe(true);
    });
  });

  describe("Node CRUD Operations", () => {
    let createdNodeUuid: string | undefined;

    afterAll(async () => {
      // Cleanup: delete any created test node
      if (createdNodeUuid && TEST_API_KEY) {
        try {
          await deleteDraftNode(createdNodeUuid);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test.skipIf(!TEST_API_KEY)("should create a new draft node", async () => {
      const result = await createDraftNode({
        title: "CLI Test Node",
        defaultLicense: "CC-BY-4.0",
      });

      expect(result).toHaveProperty("node");
      expect(result.node).toHaveProperty("uuid");
      expect(result.node.title).toBe("CLI Test Node");

      createdNodeUuid = result.node.uuid;
    });

    test.skipIf(!TEST_API_KEY)("should get draft node by UUID", async () => {
      if (!createdNodeUuid) {
        throw new Error("No node was created in previous test");
      }

      const node = await getDraftNode(createdNodeUuid);
      expect(node).toHaveProperty("uuid");
      expect(node).toHaveProperty("title");
      expect(node.title).toBe("CLI Test Node");
    });

    test.skipIf(!TEST_API_KEY)("should delete draft node", async () => {
      if (!createdNodeUuid) {
        throw new Error("No node was created in previous test");
      }

      const result = await deleteDraftNode(createdNodeUuid);
      expect(result).toHaveProperty("ok");
      expect(result.ok).toBe(true);
    });
  });
});

