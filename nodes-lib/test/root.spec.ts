/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import { createDraftNode, getDraftNode, publishDraftNode, createNewFolder, retrieveDraftFileTree, moveData, uploadFiles, deleteDraftNode, getDpidHistory, deleteData, addRawComponent, addPdfComponent, type AddPdfComponentParams, type AddCodeComponentParams, addCodeComponent, uploadPdfFromUrl, type RetrieveResponse, type UploadFilesResponse, type ExternalUrl, uploadGithubRepoFromUrl, type PublishResponse, listNodes, addLinkComponent, type AddLinkComponentParams, deleteComponent, updateComponent, changeManifest, updateTitle, updateDescription, updateLicense, updateResearchFields, addContributor, removeContributor } from "../src/api.js";
import axios from "axios";
import { getCodexHistory, getPublishedFromCodex } from "../src/codex.js";
import { dpidPublish } from "../src/chain.js";
import { sleep } from "./util.js";
import { convertHexToCID } from "../src/util/converting.js";
import {
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentCodeSubtype,
  ResearchObjectComponentLinkSubtype,
  type ResearchObjectV1,
  type License,
  type ResearchField,
  type ResearchObjectV1Author,
  ResearchObjectV1AuthorRole
} from "@desci-labs/desci-models";

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

    test("can be listed", async () => {
      await createBoilerplateNode();
      await createBoilerplateNode();

      const listedNodes = await listNodes(AUTH_TOKEN);
      // Lazy check that listing returns at least these two nodes
      expect(listedNodes.length).toBeGreaterThan(2);
    });

    test("can be deleted", async () => {
      const { node: { uuid }} = await createBoilerplateNode();

      await deleteDraftNode(uuid, AUTH_TOKEN);
      await expect(getDraftNode(uuid, AUTH_TOKEN)).rejects.toThrowError("403");
    });
  });

  describe("manifest document actions", async () => {
    describe("can update top-level property", async () => {
      let uuid: string;

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;
      });

      test("title", async () => {
        const newTitle = "UNTITLED";
        const { document: { manifest }} = await updateTitle(uuid, newTitle, AUTH_TOKEN);
        expect(manifest.title).toEqual(newTitle);
      });

      test("description", async () => {
        const newDesc = "Oh my what an interesting topic";
        const { document: { manifest }} = await updateDescription(uuid, newDesc, AUTH_TOKEN);
        expect(manifest.description).toEqual(newDesc);
      });

      test("license", async () => {
        const newLicense: License = "Mozilla Public License 2.0";
        const { document: { manifest }} = await updateLicense(uuid, newLicense, AUTH_TOKEN);
        expect(manifest.defaultLicense).toEqual(newLicense);
      });

      test("research fields", async () => {
        const newResearchFields: ResearchField[] = [ "Bathymetry", "Fisheries Science" ];
        const { document: { manifest }} = await updateResearchFields(uuid, newResearchFields, AUTH_TOKEN);
        expect(manifest.researchFields).toEqual(newResearchFields);
      });

      test("contributors", async () => {
        const newContributors: ResearchObjectV1Author[] = [
          {
            name: "Dr Jones",
            role: ResearchObjectV1AuthorRole.AUTHOR,
          },
          {
            name: "Assistant Measly",
            role: ResearchObjectV1AuthorRole.NODE_STEWARD,
          }
        ];
        await addContributor(uuid, newContributors[0], AUTH_TOKEN);
        const { document: { manifest }} = await addContributor(
          uuid, newContributors[1], AUTH_TOKEN
        );
        expect(manifest.authors).toEqual(newContributors);

        const { document: { manifest: updatedManifest }} =
          await removeContributor(uuid, 1, AUTH_TOKEN);
        expect(updatedManifest.authors).toEqual([newContributors[0]])
      });
    });

    test("can add link component", async () => {
      const { node: { uuid }} = await createBoilerplateNode();
      const component: AddLinkComponentParams= {
        name: "my component",
        url: "http://google.com",
        subtype: ResearchObjectComponentLinkSubtype.OTHER,
        starred: false,
      };
      await addLinkComponent(uuid, component, AUTH_TOKEN);
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
        {
          uuid,
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
        {
          uuid,
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
      const { node: { uuid }} = await createBoilerplateNode();
      await addLinkComponent(
        uuid,
        {
          name: "Link",
          url: "https://google.com",
          subtype: ResearchObjectComponentLinkSubtype.OTHER,
          starred: false,
        },
        AUTH_TOKEN
      );

      await deleteComponent(uuid, `root/External Links/Link`, AUTH_TOKEN);
      const node = await getDraftNode(uuid, AUTH_TOKEN);
      expect(node.manifestData.components.length).toEqual(1); // Just data-bucket
    });

    test("can update component", async () => {
      const { node: { uuid }} = await createBoilerplateNode();
      const { document: { manifest }} = await addLinkComponent(
        uuid,
        {
          name: "Link",
          url: "https://google.com",
          subtype: ResearchObjectComponentLinkSubtype.OTHER,
          starred: false,
        },
        AUTH_TOKEN
      );

      // Change
      const expectedComponent = manifest.components[1];
      expectedComponent.payload.url = "https://desci.com";

      await updateComponent(
        uuid,
        {
          componentIndex: 1,
          component: expectedComponent,
        },
        AUTH_TOKEN
      );

      const updatedNode = await getDraftNode(uuid, AUTH_TOKEN);
      const updatedComponent = updatedNode.manifestData.components[1];
      expect(updatedComponent.payload.url).toEqual(expectedComponent.payload.url)
    });
  });

  describe("publishing ", async () => {
    let uuid: string;
    let publishResult: PublishResponse;

    beforeAll(async () => {
      const { node } = await createBoilerplateNode();
      uuid = node.uuid;
      publishResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
      expect(publishResult.ok).toEqual(true);
    });

    describe("new node", async () => {
      test("adds it to the dpid registry", async () => {
        // Allow graph node to index
        await sleep(1_500);

        const historyResult = await getDpidHistory(uuid);
        const actualCid = convertHexToCID(historyResult[0].cid);
        expect(actualCid).toEqual(publishResult.updatedManifestCid);
      });

      test("sets dPID in manifest", async () => {
        const node = await getDraftNode(uuid, AUTH_TOKEN);
        expect(node.manifestData.dpid).not.toBeUndefined();
        expect(node.manifestData.dpid?.prefix).toEqual("beta");
        expect(node.manifestData.dpid?.id).not.toBeNaN();
      });

      test("to codex", async () => {
        expect(publishResult.ceramicIDs).not.toBeUndefined();
        const ceramicObject = await getPublishedFromCodex(publishResult.ceramicIDs!.streamID);
        expect(ceramicObject?.manifest).toEqual(publishResult.updatedManifestCid);
      });
    });

    describe("node update", async () => {
      let updateResult: PublishResponse;

      beforeAll(async () => {
        updateResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);
        expect(updateResult.ok).toEqual(true);
        // Allow graph node to index
        await sleep(1_500);
      });

      test("updates entry in dpid registry", async () => {
        const historyResult = await getDpidHistory(uuid);
        const actualCid = convertHexToCID(historyResult[0].cid);
        expect(actualCid).toEqual(publishResult.updatedManifestCid);
        expect(historyResult.length).toEqual(2);
      });

      test("publishes to codex stream", async () => {
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

        // Allow graph node to index
      await sleep(1_500);

      // make a regular publish
      const pubResult = await publishDraftNode(uuid, AUTH_TOKEN, PKEY);

        // Allow graph node to index
      await sleep(1_500);

      // make sure codex history is of equal length
      const dpidHistory = await getDpidHistory(uuid);
      const codexHistory = await getCodexHistory(pubResult.ceramicIDs!.streamID);
      expect(dpidHistory.length).toEqual(2);
      expect (codexHistory.length).toEqual(2);
    });

    /** This is not an user feature, but part of error handling during publish */
    test("can remove dPID from manifest", async () => {
      await changeManifest(
        uuid, [{ type: "Remove Dpid" }], AUTH_TOKEN
      );
      const node = await getDraftNode(uuid, AUTH_TOKEN);
      expect(node.manifestData.dpid).toBeUndefined();
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
      const expectedFolderName = "MyFolder";
      let uuid: string;
      let manifestUrl: string;

      beforeAll(async () => {
        const createRes = await createBoilerplateNode();
        expect(createRes.ok).toEqual(true);

        uuid = createRes.node.uuid;
        manifestUrl = createRes.node.manifestUrl;

        await createNewFolder({
          uuid,
          locationPath: "root",
          folderName: expectedFolderName
        }, AUTH_TOKEN);
      });

      test("can be created", async () => {
        const treeResult = await retrieveDraftFileTree(uuid, manifestUrl, AUTH_TOKEN);
        const actualFolderName = treeResult.tree[0].contains![0].name;

        expect(actualFolderName).toEqual(expectedFolderName);
      });

      test("can be moved", async () => {
        const otherFolderName = "dir";
        await createNewFolder({
          uuid,
          locationPath: "root",
          folderName: otherFolderName,
        }, AUTH_TOKEN);
        const moveResult = await moveData(
          {
            uuid,
            oldPath: `root/${otherFolderName}`,
            newPath: `root/${expectedFolderName}/${expectedFolderName}`
          },
          AUTH_TOKEN,
        );

        const treeResult = await retrieveDraftFileTree(
          uuid,
          moveResult.manifestCid,
          AUTH_TOKEN,
        );

        const dir = treeResult.tree[0].contains![0];
        expect(dir.contains![0].name).toEqual(expectedFolderName);
      });

      test("can be deleted", async () => {
        const deleteResult = await deleteData(
          {
            uuid,
            path: `root/${expectedFolderName}`
          },
          AUTH_TOKEN,
        );
        const treeResult = await retrieveDraftFileTree(
          uuid,
          deleteResult.manifestCid,
          AUTH_TOKEN
        );

        expect(treeResult.tree[0].contains).toEqual([]);
      });
    });

    describe("files", async () => {
      test("can be uploaded", async () => {
        const { node: { uuid }} = await createBoilerplateNode();
        const localFilePaths = [ "package.json", "package-lock.json" ];
        const uploadResult = await uploadFiles(
          {
            uuid,
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
          {
            uuid,
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
          {
            uuid,
            targetPath: "root",
            localFilePaths,
          },
          AUTH_TOKEN
        );

        expect(uploadResult.tree[0].contains![0].name).toEqual("package.json");

        const { manifestCid } = await deleteData({
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
          uploadResult = await uploadGithubRepoFromUrl(
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
});

const createBoilerplateNode = async () => {
  const node = {
    title: "My Node",
    defaultLicense: "CC BY",
    researchFields: [],
  };

  return await createDraftNode(node, AUTH_TOKEN);
}
