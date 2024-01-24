/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import { createDraftNode, showNode, type CreateDraftParams, publishDraftNode } from "../src/api.js";
import axios from "axios";
import { getPublishedFromCeramic } from "../src/codex.js";

const NODES_API_URL = process.env.NODES_API_URL || "http://localhost:5420";
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN unset");

describe("nodes-lib", () => {
  beforeAll(async () => {
    try {
      console.log(`Checking server reachable at ${NODES_API_URL}...`);
      await axios.get(NODES_API_URL);
      console.log("Server is reachable.");
    } catch (e) {
      console.error(
        "Failed to connect to desci-server; is the service running?",
      );
      process.exit(1);
    };
  });

  describe("createDraftNode", async () => {
    test("creates a new draft node", async () => {
      const expected: CreateDraftParams = {
        title: "New Draft Node",
        defaultLicense: "CC BY",
        researchFields: [],
      };
      const response = await createDraftNode(expected, AUTH_TOKEN);
      expect(response.ok).toEqual(true);

      const actual = await showNode(response.node.uuid, AUTH_TOKEN);
      expect(actual.title).toEqual(expected.title);
    });
  });

  describe("publishDraftNode", async () => {
    test("publishes node", async () => {
      const node: CreateDraftParams = {
        title: "New Draft Node",
        defaultLicense: "CC BY",
        researchFields: [],
      };
      const { node: { uuid }} = await createDraftNode(node, AUTH_TOKEN);

      const publishResult = await publishDraftNode(uuid, AUTH_TOKEN);
      expect(publishResult.ok).toEqual(true);
      
      const ceramicObject = await getPublishedFromCeramic(publishResult.streamID);
      expect(ceramicObject!.title).toEqual(node.title);
    });
  });
});
