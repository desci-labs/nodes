/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import { createDraftNode, getDraftNode, publishDraftNode, createNewFolder, retrieveDraftFileTree, moveData, uploadFiles, deleteDraftNode, getDpidHistory, deleteFile, prePublishDraftNode } from "../src/api.js";
import axios from "axios";
import { codexPublish, getCodexHistory, getPublishedFromCodex } from "../src/codex.js";
import { resolveHistory } from "@desci-labs/desci-codex-lib/dist/src/index.js";
import { dpidPublish } from "../src/chain.js";
import { sleep } from "./util.js";
import { convertHexToCID } from "../src/util/converting.js";

const NODES_API_URL = process.env.NODES_API_URL || "http://localhost:5420";
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PKEY = process.env.PKEY;

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN unset");
if (!PKEY) throw new Error("PKEY unset");

describe("nodes-lib", () => {
  beforeAll(async () => {
    try {
      console.log(`Checking server reachable at ${NODES_API_URL}...`);
      await axios.get(NODES_API_URL);
      console.log("Server is reachable");
    } catch (e) {
      console.error(
        "Failed to connect to desci-server; is the service running?",
      );
      process.exit(1);
    }
  });
  describe("draft nodes", async () => {
    test("can be created", async () => {
      const expected = {
        title: "New Draft Node",
        defaultLicense: "CC BY",
        researchFields: [],
      };
      const response = await createDraftNode(expected, AUTH_TOKEN);
      expect(response.ok).toEqual(true);

      const actual = await getDraftNode(response.node.uuid, AUTH_TOKEN);
      expect(actual.title).toEqual(expected.title);
    });

    test("can be deleted", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      await deleteDraftNode(uuid, AUTH_TOKEN);
      await expect(getDraftNode(uuid, AUTH_TOKEN)).rejects.toThrowError("403");
    });
  });

  describe("publish", async () => {
    describe("new node", async () => {
      test("to dPID registry", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const publishResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(publishResult.ok).toEqual(true);

        // Graph node is a bit sleepy
        await sleep(1_500);
        const historyResult = await getDpidHistory(uuid);
        const actualCid = convertHexToCID(historyResult[0].cid);
        expect(actualCid).toEqual(publishResult.updatedManifestCid);
      });

      test("to codex", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const publishResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(publishResult.ok).toEqual(true);

        expect(publishResult.ceramicIDs).not.toBeUndefined();
        const ceramicObject = await getPublishedFromCodex(publishResult.ceramicIDs!.streamID);
        expect(ceramicObject?.manifest).toEqual(publishResult.updatedManifestCid);
      });
    });

    describe("node update", async () => {
      test("to dPID registry", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const publishResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(publishResult.ok).toEqual(true);

        // Wait for graph node to update
        await sleep(1_500);

        const updateResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(updateResult.ok).toEqual(true);

        // Wait for graph node to update
        await sleep(1_500);

        const historyResult = await getDpidHistory(uuid);
        const actualCid = convertHexToCID(historyResult[0].cid);
        expect(actualCid).toEqual(publishResult.updatedManifestCid);
        expect(historyResult.length).toEqual(2);
      });

      test("to codex", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const publishResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(publishResult.ok).toEqual(true);

        // Wait for graph node to update
        await sleep(1_500);

        const updateResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(updateResult.ok).toEqual(true);

        expect(publishResult.ceramicIDs).not.toBeUndefined();
        const ceramicObject = await getPublishedFromCodex(publishResult.ceramicIDs!.streamID);
        expect(ceramicObject?.manifest).toEqual(publishResult.updatedManifestCid);

        const ceramicHistory = await getCodexHistory(publishResult.ceramicIDs!.streamID);
        expect(ceramicHistory.length).toEqual(2);
      });
    });

    test("with backfill ceramic migration", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      // make a dpid-only publish
      await dpidPublish(uuid, AUTH_TOKEN, false);

      // Wait for graph node to update
      await sleep(1_500);

      // make a regular publish
      const pubResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);

      // Wait for graph node to update
      await sleep(1_500);

      // make sure codex history is of equal length
      const dpidHistory = await getDpidHistory(uuid);
      const codexHistory = await getCodexHistory(pubResult.ceramicIDs!.streamID);
      expect(dpidHistory.length).toEqual(2);
      expect (codexHistory.length).toEqual(2);
    });
  });

  describe("data management", async () => {
    describe("trees", async () => {
      test("can be retrieved by owner", async () => {
        const { ok, node: { uuid, manifestUrl }} = await createBoilerplateNode();
        expect(ok).toEqual(true);

        const treeResult = await retrieveDraftFileTree(uuid, manifestUrl, AUTH_TOKEN);
        expect(treeResult.tree).toHaveLength(1);
      });
    });

    describe("folders", async () => {
      test("can be created", async () => {
        const { ok, node: { uuid, manifestUrl }} = await createBoilerplateNode();
        expect(ok).toEqual(true);

        const expectedFolderName = "MyFolder";
        await createNewFolder({
          uuid,
          locationPath: "root",
          folderName: expectedFolderName
        }, AUTH_TOKEN);
        const treeResult = await retrieveDraftFileTree(uuid, manifestUrl, AUTH_TOKEN);
        const actualFolderName = treeResult.tree[0].contains![0].name;

        expect(actualFolderName).toEqual(expectedFolderName);
      });

      test("can be moved", async () => {
        const { ok, node: { uuid }} = await createBoilerplateNode();
        expect(ok).toEqual(true);

        await createNewFolder({
          uuid,
          locationPath: "root",
          folderName: "MyFolder"
        }, AUTH_TOKEN);
        await createNewFolder({
          uuid,
          locationPath: "root",
          folderName: "dir"
        }, AUTH_TOKEN);
        const moveResult = await moveData(
          { uuid, oldPath: "root/MyFolder", newPath: "root/dir/MyFolder" },
          AUTH_TOKEN
        );

        const treeResult = await retrieveDraftFileTree(
          uuid,
          moveResult.manifestCid,
          AUTH_TOKEN
        );

        const dir = treeResult.tree[0].contains![0];
        expect(dir.contains![0].name).toEqual("MyFolder");
      });
    });

    describe("files", async () => {
      test("can be uploaded", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const filePaths = [ "package.json", "package-lock.json" ];
        const uploadResult = await uploadFiles({
          uuid,
          targetPath: "root",
          filePaths,
        }, AUTH_TOKEN);

        const treeResult = await retrieveDraftFileTree(
          uuid,
          uploadResult.manifestCid,
          AUTH_TOKEN
        );
        const driveContent = treeResult.tree[0].contains!;

        expect(driveContent.map(driveObject => driveObject.name))
          .toEqual(expect.arrayContaining(filePaths));
        driveContent.forEach(driveObject => {
          expect(driveObject.size).toBeGreaterThan(0);
        });
      });

      test("can be moved", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const filePaths = [ "package.json" ];
        const uploadResult = await uploadFiles({
          uuid,
          targetPath: "root",
          filePaths,
        }, AUTH_TOKEN);
        expect(uploadResult.tree[0].contains![0].path).toEqual("root/package.json");

        const moveResult = await moveData({
          uuid,
          oldPath: "root/package.json",
          newPath: "root/json.package",
        }, AUTH_TOKEN);

        const treeResult = await retrieveDraftFileTree(
          uuid,
          moveResult.manifestCid,
          AUTH_TOKEN
        );
        expect(treeResult.tree[0].contains![0].path).toEqual("root/json.package");
      });

      test("can be deleted", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const filePaths = [ "package.json" ];
        const uploadResult = await uploadFiles({
          uuid,
          targetPath: "root",
          filePaths,
        }, AUTH_TOKEN);

        expect(uploadResult.tree[0].contains![0].name).toEqual("package.json");

        const { manifestCid } = await deleteFile({
          uuid,
          path: "root/package.json"
        }, AUTH_TOKEN);

        const treeResult = await retrieveDraftFileTree(
          uuid,
          manifestCid,
          AUTH_TOKEN
        );

        expect(treeResult.tree[0].contains!.length).toEqual(0);
      });
    });
  });

  describe.skip("utils", async () => {
    test.todo("cidEncode")
    test.todo("cidDecode")
  });
});

const createBoilerplateNode = async () => {
  const node = {
    title: "My Node",
    defaultLicense: "CC BY",
    researchFields: [],
  };

  return await createDraftNode(node, AUTH_TOKEN);
}
