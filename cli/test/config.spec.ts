import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Conf from "conf";

// Create a test-specific config instance
const testConfig = new Conf({
  projectName: "desci-nodes-cli-test",
  schema: {
    apiKey: { type: "string" as const },
    privateKey: { type: "string" as const },
    environment: {
      type: "string" as const,
      default: "dev",
      enum: ["local", "dev", "staging", "prod"],
    },
    defaultNodeUuid: { type: "string" as const },
  },
});

describe("CLI Config", () => {
  beforeEach(() => {
    // Clear config before each test
    testConfig.clear();
  });

  afterEach(() => {
    // Clean up after each test
    testConfig.clear();
  });

  describe("Environment", () => {
    test("should default to dev environment", () => {
      expect(testConfig.get("environment")).toBe("dev");
    });

    test("should set and get environment", () => {
      testConfig.set("environment", "prod");
      expect(testConfig.get("environment")).toBe("prod");
    });

    test("should support all valid environments", () => {
      const envs = ["local", "dev", "staging", "prod"];
      for (const env of envs) {
        testConfig.set("environment", env);
        expect(testConfig.get("environment")).toBe(env);
      }
    });
  });

  describe("API Key", () => {
    test("should initially be undefined", () => {
      expect(testConfig.get("apiKey")).toBeUndefined();
    });

    test("should set and get API key", () => {
      const testKey = "test-api-key-12345";
      testConfig.set("apiKey", testKey);
      expect(testConfig.get("apiKey")).toBe(testKey);
    });

    test("should overwrite existing API key", () => {
      testConfig.set("apiKey", "old-key");
      testConfig.set("apiKey", "new-key");
      expect(testConfig.get("apiKey")).toBe("new-key");
    });
  });

  describe("Private Key", () => {
    test("should initially be undefined", () => {
      expect(testConfig.get("privateKey")).toBeUndefined();
    });

    test("should set and get private key", () => {
      const testPkey = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      testConfig.set("privateKey", testPkey);
      expect(testConfig.get("privateKey")).toBe(testPkey);
    });

    test("should delete private key", () => {
      testConfig.set("privateKey", "some-key");
      expect(testConfig.get("privateKey")).toBe("some-key");
      testConfig.delete("privateKey");
      expect(testConfig.get("privateKey")).toBeUndefined();
    });
  });

  describe("Clear Config", () => {
    test("should clear all configuration", () => {
      testConfig.set("apiKey", "test-key");
      testConfig.set("privateKey", "test-pkey");
      testConfig.set("environment", "prod");
      
      testConfig.clear();
      
      expect(testConfig.get("apiKey")).toBeUndefined();
      expect(testConfig.get("privateKey")).toBeUndefined();
      expect(testConfig.get("environment")).toBe("dev"); // Default value
    });
  });
});

