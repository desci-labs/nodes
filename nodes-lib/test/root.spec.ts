/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import { createDraftNode, getDraftNode, type CreateDraftParams, publishDraftNode, createNewFolder, retrieveDraftFileTree, moveData, uploadFiles, deleteDraftNode } from "../src/api.js";
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
      const expected = {
        title: "New Draft Node",
        defaultLicense: "CC BY",
        researchFields: [],
      };
      const createResponse = await createDraftNode(expected, AUTH_TOKEN);
      expect(createResponse.ok).toEqual(true);

      await deleteDraftNode(createResponse.node.uuid, AUTH_TOKEN);
      await expect(
        getDraftNode(createResponse.node.uuid, AUTH_TOKEN)
      ).rejects.toThrowError("403")
    });

    test("can be published to ceramic", async () => {
      const node = {
        title: "New Draft Node",
        defaultLicense: "CC BY",
        researchFields: [],
      };
      const { node: { uuid }} = await createDraftNode(node, AUTH_TOKEN);

      const publishResult = await publishDraftNode(uuid, AUTH_TOKEN);
      // desci-server success
      expect(publishResult.ok).toEqual(true);

      const ceramicObject = await getPublishedFromCeramic(publishResult.ceramicIDs.streamID);
      // object present on ceramic
      expect(ceramicObject!.title).toEqual(node.title);
    });

    test("can be updated on ceramic", async () => {
      const node = {
        title: "New Draft Node",
        defaultLicense: "CC BY",
        researchFields: [],
      };
      const { node: { uuid }} = await createDraftNode(node, AUTH_TOKEN);

      const publishResult = await publishDraftNode(uuid, AUTH_TOKEN);
      // desci-server success
      expect(publishResult.ok).toEqual(true);

      const ceramicObject = await getPublishedFromCeramic(publishResult.ceramicIDs.streamID);
      // object present on ceramic
      expect(ceramicObject!.title).toEqual(node.title);

      const updateResult = await publishDraftNode(uuid, AUTH_TOKEN);
      expect(updateResult.ok).toEqual(true);
      // Update made to same stream, but with new commit
      expect(updateResult.ceramicIDs.streamID).toEqual(publishResult.ceramicIDs.streamID);
      expect(updateResult.ceramicIDs.commitID).not.toEqual(publishResult.ceramicIDs.commitID);
    });

    // Missing history without lifting over lots of code from nodes-web :thinking:
    test.todo("can be migrated by backfill")

    // Handle all the signing without the browser impl from nodes-web? :/
    test.todo("can be published to legacy contract")
  });

  describe("data management", async () => {
    describe("trees", async () => {
      test("can be retrieved by owner", async () => {
        const node = {
          title: "My Node",
          defaultLicense: "CC BY",
          researchFields: [],
        };

        const { ok, node: { uuid, manifestUrl }} = await createDraftNode(node, AUTH_TOKEN);
        expect(ok).toEqual(true);

        const treeResult = await retrieveDraftFileTree(uuid, manifestUrl, AUTH_TOKEN);
        expect(treeResult.tree).toHaveLength(1);
      });
    });

    describe("folders", async () => {
      test("can be created", async () => {
        const node = {
          title: "My Node",
          defaultLicense: "CC BY",
          researchFields: [],
        };

        const { ok, node: { uuid, manifestUrl }} = await createDraftNode(node, AUTH_TOKEN);
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
        const node = {
          title: "My Node",
          defaultLicense: "CC BY",
          researchFields: [],
        };

        const { ok, node: { uuid }} = await createDraftNode(node, AUTH_TOKEN);
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

    });

    test.todo("can move file", async () => {

    });

    test.todo("can rename file", async () => {

    });

    test.todo("can delete file", async () => {

    });
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
