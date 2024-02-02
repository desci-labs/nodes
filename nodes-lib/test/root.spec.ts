/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import { createDraftNode, getDraftNode, publishDraftNode, createNewFolder, retrieveDraftFileTree, moveData, uploadFiles, deleteDraftNode, getDpidHistory, deleteFile } from "../src/api.js";
import axios from "axios";
import { getPublishedFromCeramic } from "../src/codex.js";
import { chainPublish } from "../src/chain.js";
import { sleep } from "./util.js";
import { convertHexToCID } from "../src/util/converting.js";

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
      const { node: { uuid }} = await createBoilerplateNode();

      await deleteDraftNode(uuid, AUTH_TOKEN);
      await expect(getDraftNode(uuid, AUTH_TOKEN)).rejects.toThrowError("403");
    });
  });

  describe("publish", async () => {
    test("new node to ceramic", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      const publishResult = await publishDraftNode(uuid, AUTH_TOKEN);
      // desci-server success
      expect(publishResult.ok).toEqual(true);

      const ceramicObject = await getPublishedFromCeramic(publishResult.ceramicIDs.streamID);
      // object present on ceramic
      expect(ceramicObject!.manifest).toEqual(publishResult.updatedManifestCid);
    });

    test("node update to ceramic", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      const { ok, ceramicIDs, updatedManifestCid } = await publishDraftNode(uuid, AUTH_TOKEN);
      expect(ok).toEqual(true);

      const ceramicObject = await getPublishedFromCeramic(ceramicIDs.streamID);
      expect(ceramicObject!.manifest).toEqual(updatedManifestCid);

      const updateResult = await publishDraftNode(uuid, AUTH_TOKEN);
      expect(updateResult.ok).toEqual(true);
      // Update made to same stream, but with new commit
      expect(updateResult.ceramicIDs.streamID).toEqual(ceramicIDs.streamID);
      expect(updateResult.ceramicIDs.commitID).not.toEqual(ceramicIDs.commitID);
    });

    // Missing history without lifting over lots of code from nodes-web :thinking:
    test.todo("with backfill ceramic migration", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      const pubResult = await chainPublish(uuid, AUTH_TOKEN);
      expect(pubResult.reciept.status).toEqual(1);
    });

    test("new node to dPID registry", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      const pubResult = await chainPublish(uuid, AUTH_TOKEN);
      expect(pubResult.reciept.status).toEqual(1);

      // Graph node takes a bit to process
      await sleep(2_500);

      const historyResult = await getDpidHistory(uuid);
      const actualCid = convertHexToCID(historyResult.recentCid)

      expect(actualCid).toEqual(pubResult.prepubManifestCid);
    });

    test("node update to dPID registry", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      const pub1Result = await chainPublish(uuid, AUTH_TOKEN);
      expect(pub1Result.reciept.status).toEqual(1);

      const pub2Result = await chainPublish(uuid, AUTH_TOKEN);
      expect(pub2Result.reciept.status).toEqual(1);

      // Graph node takes a bit to process
      await sleep(2_500);

      const historyResult = await getDpidHistory(uuid);
      expect(historyResult.versions.length).toEqual(2);

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
