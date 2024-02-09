/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import { createDraftNode, getDraftNode, publishDraftNode, createNewFolder, retrieveDraftFileTree, moveData, uploadFiles, deleteDraftNode, getDpidHistory, deleteFile, addRawComponent, addPdfComponent, type AddPdfComponentParams, AddCodeComponentParams, addCodeComponent, uploadPdfFromUrl, RetrieveResponse, UploadFilesResponse, ExternalUrl, uploadRepositoryFromUrl } from "../src/api.js";
import axios from "axios";
import { getCodexHistory, getPublishedFromCodex } from "../src/codex.js";
import { dpidPublish } from "../src/chain.js";
import { sleep } from "./util.js";
import { convertHexToCID } from "../src/util/converting.js";
import {
  ResearchObjectComponentType,
  type ExternalLinkComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentCodeSubtype
} from "@desci-labs/desci-models";
import { randomUUID } from "crypto";

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

  describe("manifest document actions", async () => {
    test("can add link component", async () => {
      const { node: { uuid }} = await createBoilerplateNode();
      const id = randomUUID();
      const component: ExternalLinkComponent = {
        id,
        name: "my component",
        type: ResearchObjectComponentType.LINK,
        payload: {
          url: "http://google.com",
          path: "root",
        },
        starred: false,
      };
      await addRawComponent(uuid, component, AUTH_TOKEN);
      const state = await getDraftNode(uuid, AUTH_TOKEN);
      const actualComponents = state.manifestData.components;

      // Data bucket already present, so new component at index 1
      expect(actualComponents.length).toEqual(2);
      expect(actualComponents[1].name).toEqual(component.name);
    });

    test("can add pdf component", async () => {
      const { node: { uuid }} = await createBoilerplateNode();
      const localFilePaths = [ "test/test.pdf" ];
      const uploadResult = await uploadFiles(
        uuid,
        {
          targetPath: "root",
          localFilePaths
        },
        AUTH_TOKEN
      );

      const pdfComponentParams: AddPdfComponentParams = {
        name: "Manuscript",
        subtype: ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
        pathToFile: "root/test.pdf",
        cid: uploadResult.tree[0].contains![0].cid,
        starred: true,
      };
      await addPdfComponent(uuid, pdfComponentParams, AUTH_TOKEN);
      const state = await getDraftNode(uuid, AUTH_TOKEN);
      const actualComponents = state.manifestData.components;

      // Data bucket already present, so new component at index 1
      expect(actualComponents.length).toEqual(2);
      expect(actualComponents[1].payload.cid).toEqual(pdfComponentParams.cid);
    });

    test("can add a code component", async () => {
      const { node: { uuid }} = await createBoilerplateNode();
      const localFilePaths = [ "test/root.spec.ts" ];
      const uploadResult = await uploadFiles(
        uuid,
        {
          targetPath: "root",
          localFilePaths
        },
        AUTH_TOKEN
      );
      const uploadedFileCid = uploadResult.tree[0].contains![0].cid;
      const codeComponentParams: AddCodeComponentParams = {
        name: "Tests",
        subtype: ResearchObjectComponentCodeSubtype.CODE_SCRIPTS,
        cid: uploadedFileCid,
        path: "root/root.spec.ts",
        language: "typescript",
        starred: true,
      };
      await addCodeComponent(uuid, codeComponentParams, AUTH_TOKEN);
      const state = await getDraftNode(uuid, AUTH_TOKEN);
      const actualComponents = state.manifestData.components;

      // Data bucket already present, so new component at index 1
      expect(actualComponents.length).toEqual(2);
      expect(actualComponents[1].payload.cid).toEqual(uploadedFileCid);

    });

    test("can delete component", async () => {

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
        const localFilePaths = [ "package.json", "package-lock.json" ];
        const uploadResult = await uploadFiles(
          uuid,
          {
            targetPath: "root",
            localFilePaths,
          },
          AUTH_TOKEN
        );

        const treeResult = await retrieveDraftFileTree(
          uuid,
          uploadResult.manifestCid,
          AUTH_TOKEN
        );
        const driveContent = treeResult.tree[0].contains!;

        expect(driveContent.map(driveObject => driveObject.name))
          .toEqual(expect.arrayContaining(localFilePaths));
        driveContent.forEach(driveObject => {
          expect(driveObject.size).toBeGreaterThan(0);
        });
      });

      test("can be moved", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const localFilePaths = [ "package.json" ];
        const uploadResult = await uploadFiles(
          uuid,
          {
            targetPath: "root",
            localFilePaths,
          },
          AUTH_TOKEN
        );
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
        const localFilePaths = [ "package.json" ];
        const uploadResult = await uploadFiles(
          uuid,
          {
            targetPath: "root",
            localFilePaths,
          },
          AUTH_TOKEN
        );

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

      describe("can be uploaded by PDF URL", async () => {
        let treeResult: RetrieveResponse;
        let uploadResult: UploadFilesResponse;
        let externalUrl: ExternalUrl;
        beforeAll(async () => {
          const { node: { uuid }} = await createBoilerplateNode();
          externalUrl = {
            url: "https://ipfs.desci.com/ipfs/bafybeiamslevhsvjlnfejg7p2rzk6bncioaapwb3oauu7zqwmfpwko5ho4",
            path: "manuscript.pdf",
          };
          uploadResult = await uploadPdfFromUrl(
            {
              uuid,
              externalUrl,
              targetPath: "root",
              componentSubtype: ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
            },
            AUTH_TOKEN,
          );
          treeResult = await retrieveDraftFileTree(
            uuid,
            uploadResult.manifestCid,
            AUTH_TOKEN,
          );
        });

        test("adds file to tree", async () => {
          const files = treeResult.tree[0].contains;
          expect(files).not.toBeUndefined();
          expect(files!.length).toEqual(1);
          expect(files![0].name).toEqual(externalUrl.path);
        });

        test("automatically gets a component", async () => {
          const components = uploadResult.manifest.components;
          // TODO backend bug creates duplicates: https://github.com/desci-labs/nodes/issues/206
          // expect(components.length).toEqual(2);

          const expectedComponent = expect.objectContaining({
            // id: some UUID,
            name: "manuscript.pdf",
            type: "pdf",
            subtype: "manuscript",
            payload: expect.objectContaining({
              // cid: some cid,
              path: "root/manuscript.pdf",
              externalUrl: "https://ipfs.desci.com/ipfs/bafybeiamslevhsvjlnfejg7p2rzk6bncioaapwb3oauu7zqwmfpwko5ho4"
            }),
            starred: false
          });

          expect(components).toEqual(
            expect.arrayContaining([expectedComponent])
          );
        });
      });

      describe("can be uploaded by repo URL", async () => {
        let externalUrl: ExternalUrl;
        let uploadResult: UploadFilesResponse;
        let treeResult: RetrieveResponse;
        beforeAll(async () => {
          const { node: { uuid}} = await createBoilerplateNode();
          externalUrl = {
            // This is probably stupid to do in a unit test
            url: "https://github.com/desci-labs/desci-codex",
            path: "DeSci Codex",
          };
          uploadResult = await uploadRepositoryFromUrl(
            {
              uuid,
              externalUrl,
              targetPath: "root",
              componentSubtype: ResearchObjectComponentCodeSubtype.SOFTWARE_PACKAGE,
            },
            AUTH_TOKEN
          );
          treeResult = await retrieveDraftFileTree(
            uuid,
            uploadResult.manifestCid,
            AUTH_TOKEN
          );
        });

        test("adds repo to tree", async () => {
          expect(treeResult.tree[0]).not.toBeUndefined();
          const tree = treeResult.tree[0];
          // Lazy size check, prob ok if it got a lot of stuff
          expect(tree.size).toBeGreaterThan(10_000);
          expect(tree.contains).not.toBeUndefined();
          expect(tree.contains![0].name).toEqual(externalUrl.path);
          expect(tree.contains![0].contains!.length).toBeGreaterThan(5);
        });
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
