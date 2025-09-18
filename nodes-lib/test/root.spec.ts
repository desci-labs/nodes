/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import type {
  AddCodeComponentParams,
  AddLinkComponentParams,
  AddPdfComponentParams,
  CreateDraftParams,
  ExternalUrl,
  NodeResponse,
  PublishResponse,
  RetrieveResponse,
  UploadFilesResponse,
} from "../src/shared/api.js";
import {
  createDraftNode,
  getDraftNode,
  createNewFolder,
  retrieveDraftFileTree,
  moveData,
  deleteDraftNode,
  deleteData,
  addPdfComponent,
  addCodeComponent,
  uploadPdfFromUrl,
  uploadGithubRepoFromUrl,
  listNodes,
  addLinkComponent,
  deleteComponent,
  updateComponent,
  changeManifest,
  updateTitle,
  updateDescription,
  updateLicense,
  updateResearchFields,
  addContributor,
  removeContributor,
  addExternalCid,
  updateCoverImage,
  publishNode,
  getLegacyHistory,
} from "../src/shared/api.js";
import axios from "axios";
import { getStreamController } from "../src/shared/codex.js";
import { sleep } from "./util.js";
import {
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentCodeSubtype,
  ResearchObjectComponentLinkSubtype,
  type License,
  type ResearchField,
  type ResearchObjectV1Author,
  ResearchObjectV1AuthorRole,
  ResearchObjectComponentType,
  ResearchObjectComponentDataSubtype,
} from "@desci-labs/desci-models";
import {
  authorizedSessionDidFromSigner,
  signerFromPkey,
} from "../src/shared/util/signing.js";
import {
  NODESLIB_CONFIGS,
  getNodesLibInternalConfig,
  setApiKey,
  setNodesLibConfig,
} from "../src/index.js";
import { getResources } from "@desci-labs/desci-codex-lib";
import { Signer } from "ethers";
import { DpidAliasRegistry } from "@desci-labs/desci-contracts/dist/typechain-types/index.js";
import { dpidAliasRegistryWriter, findDpid } from "../src/shared/chain.js";
import { randomInt } from "crypto";
import { getCodexHistory, getCurrentState } from "../src/node-only/flight-sql.js";
import { uploadFiles } from "../src/node-only/file-uploads.js";

// Pre-funded ganache account
const TEST_PKEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Pre-seeded for noreply user in local environment
const TEST_API_KEY = "agu+zEH30gwm77C+Em4scbzdiYOnv8uSvA0qr2XAj5k=";

// Prisma seeds test DB's with an API key for noreply@desci.com
setNodesLibConfig(NODESLIB_CONFIGS.local);
setApiKey(TEST_API_KEY);
const testSigner = signerFromPkey(TEST_PKEY);

describe("nodes-lib", () => {
  beforeAll(async () => {
    const apiUrl = getNodesLibInternalConfig().apiUrl;
    try {
      console.log(`Checking server reachable at ${apiUrl}...`);
      await axios.get(apiUrl);
      console.log("Server is reachable");
    } catch (e) {
      console.error(
        "Failed to connect to desci-server; is the service running?"
      );
      process.exit(1);
    }
  });
  describe("draft nodes", async () => {
    test("can be created", async () => {
      const response = await createBoilerplateNode();

      const actual = await getDraftNode(response.node.uuid);
      expect(actual.title).toEqual("My Node");
    });

    test("can be listed", async () => {
      await createBoilerplateNode();
      await createBoilerplateNode();

      const listData = await listNodes();
      // Lazy check that listing returns at least these two nodes
      expect(listData.nodes.length).toBeGreaterThan(2);
    });

    test("can be deleted", async () => {
      const {
        node: { uuid },
      } = await createBoilerplateNode();

      await deleteDraftNode(uuid);
      await expect(getDraftNode(uuid)).rejects.toThrowError("403");
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
        const {
          document: { manifest },
        } = await updateTitle(uuid, newTitle);
        expect(manifest.title).toEqual(newTitle);
      });

      test("description", async () => {
        const newDesc = "Oh my what an interesting topic";
        const {
          document: { manifest },
        } = await updateDescription(uuid, newDesc);
        expect(manifest.description).toEqual(newDesc);
      });

      test("license", async () => {
        const newLicense: License = "Mozilla Public License 2.0";
        const {
          document: { manifest },
        } = await updateLicense(uuid, newLicense);
        expect(manifest.defaultLicense).toEqual(newLicense);
      });

      test("research fields", async () => {
        const newResearchFields: ResearchField[] = [
          "Bathymetry",
          "Fisheries Science",
        ];
        const {
          document: { manifest },
        } = await updateResearchFields(uuid, newResearchFields);
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
          },
        ];
        await addContributor(uuid, newContributors[0]);
        const {
          document: { manifest },
        } = await addContributor(uuid, newContributors[1]);
        expect(manifest.authors).toEqual(newContributors);

        const {
          document: { manifest: updatedManifest },
        } = await removeContributor(uuid, 1);
        expect(updatedManifest.authors).toEqual([newContributors[0]]);
      });

      describe("cover image", async () => {
        test("can be set", async () => {
          const coverCid =
            "bafkreidivzimqfqtoqxkrpge6bjyhlvxqs3rhe73owtmdulaxr5do5in7u";
          const {
            document: { manifest: updatedManifest },
          } = await updateCoverImage(uuid, coverCid);
          expect(updatedManifest.coverImage).toEqual(coverCid);
        });

        test("can be unset", async () => {
          const {
            document: { manifest: updatedManifest },
          } = await updateCoverImage(uuid, undefined);
          expect(updatedManifest.coverImage).toBeUndefined();
        });
      });
    });

    test("can add link component", async () => {
      const {
        node: { uuid },
      } = await createBoilerplateNode();
      const component: AddLinkComponentParams = {
        name: "my component",
        url: "http://google.com",
        subtype: ResearchObjectComponentLinkSubtype.OTHER,
        starred: false,
      };
      await addLinkComponent(uuid, component);
      await sleep(1_000);
      const state = await getDraftNode(uuid);
      const actualComponents = state.manifestData.components;

      // Data bucket already present, so new component at index 1
      expect(actualComponents.length).toEqual(2);
      expect(actualComponents[1].name).toEqual(component.name);
    });

    test("can add pdf component", async () => {
      const {
        node: { uuid },
      } = await createBoilerplateNode();
      const files = ["test/test.pdf"];
      const uploadResult = await uploadFiles({
        uuid,
        contextPath: "root",
        files,
      });

      const pdfComponentParams: AddPdfComponentParams = {
        name: "Manuscript",
        subtype: ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
        pathToFile: "root/test.pdf",
        cid: uploadResult.tree[0].contains![0].cid,
        starred: true,
      };
      await addPdfComponent(uuid, pdfComponentParams);
      const state = await getDraftNode(uuid);
      const actualComponents = state.manifestData.components;

      // Data bucket already present, so new component at index 1
      expect(actualComponents.length).toEqual(2);
      expect(actualComponents[1].payload.cid).toEqual(pdfComponentParams.cid);
    });

    test("can add a code component", async () => {
      const {
        node: { uuid },
      } = await createBoilerplateNode();
      const files = ["test/root.spec.ts"];
      const uploadResult = await uploadFiles({
        uuid,
        contextPath: "root",
        files,
      });
      const uploadedFileCid = uploadResult.tree[0].contains![0].cid;
      const codeComponentParams: AddCodeComponentParams = {
        name: "Tests",
        subtype: ResearchObjectComponentCodeSubtype.CODE_SCRIPTS,
        cid: uploadedFileCid,
        path: "root/root.spec.ts",
        language: "typescript",
        starred: true,
      };
      await addCodeComponent(uuid, codeComponentParams);
      const state = await getDraftNode(uuid);
      const actualComponents = state.manifestData.components;

      // Data bucket already present, so new component at index 1
      expect(actualComponents.length).toEqual(2);
      expect(actualComponents[1].payload.cid).toEqual(uploadedFileCid);
    });

    test("can delete component", async () => {
      const {
        node: { uuid },
      } = await createBoilerplateNode();
      await addLinkComponent(uuid, {
        name: "Link",
        url: "https://google.com",
        subtype: ResearchObjectComponentLinkSubtype.OTHER,
        starred: false,
      });

      await deleteComponent(uuid, `root/External Links/Link`);
      const node = await getDraftNode(uuid);
      expect(node.manifestData.components.length).toEqual(1); // Just data-bucket
    });

    test("can update component", async () => {
      const {
        node: { uuid },
      } = await createBoilerplateNode();
      const {
        document: { manifest },
      } = await addLinkComponent(uuid, {
        name: "Link",
        url: "https://google.com",
        subtype: ResearchObjectComponentLinkSubtype.OTHER,
        starred: false,
      });

      // Change
      const expectedComponent = manifest.components[1];
      expectedComponent.payload.url = "https://desci.com";

      await updateComponent(uuid, {
        componentIndex: 1,
        component: expectedComponent,
      });

      const updatedNode = await getDraftNode(uuid);
      const updatedComponent = updatedNode.manifestData.components[1];
      expect(updatedComponent.payload.url).toEqual(
        expectedComponent.payload.url
      );
    });
  });

  describe("publishing ", async () => {
    let uuid: string;
    let publishResult: PublishResponse;
    const did = await authorizedSessionDidFromSigner(
      testSigner,
      getResources()
    );

    beforeAll(async () => {
      const { node } = await createBoilerplateNode();
      uuid = node.uuid;
      publishResult = await publishNode(uuid, did);
      await sleep(1_000);
    });

    describe("new node", async () => {
      test("to codex", async () => {
        expect(publishResult.ceramicIDs).not.toBeUndefined();
        const ceramicObject = await getCurrentState(
          publishResult.ceramicIDs!.streamID
        );
        expect(ceramicObject?.manifest).toEqual(
          publishResult.updatedManifestCid
        );
      });

      test("has a new version", async () => {
        const history = await getCodexHistory(
          publishResult.ceramicIDs!.streamID
        );
        expect(history.versions.length).toEqual(1);
      });

      test("does NOT set dPID in manifest", async () => {
        const node = await getDraftNode(uuid);
        expect(node.manifestData.dpid).toBeUndefined();
      });

      test("has a CACAO from the passed DID", async () => {
        const controller = await getStreamController(
          publishResult.ceramicIDs!.streamID
        );
        const signerAddress = (await testSigner.getAddress()).toLowerCase();
        console.log('TEST DID:', JSON.stringify(did, undefined, 2));
        console.log('CONTROLLER:', JSON.stringify(controller, undefined, 2));

        expect(controller).toEqual(did.parent);
        expect(controller!.replace(/did:pkh.*:/, "")).toEqual(signerAddress);
      });

      test("can optionally derive DID from just a signer", async () => {
        const { node } = await createBoilerplateNode();
        const result = await publishNode(node.uuid, testSigner);
        const controller = await getStreamController(result.ceramicIDs!.streamID);
        const signerAddress = (await testSigner.getAddress()).toLowerCase();
        expect(controller!.replace(/did:pkh.*:/, "")).toEqual(signerAddress);
      });

      test("tracks streamID with node state", async () => {
        const node = await getDraftNode(uuid);
        expect(node.ceramicStream).toEqual(publishResult.ceramicIDs?.streamID);
      });

      test("tracks new dpid alias with node state", async () => {
        const node = await getDraftNode(uuid);
        expect(node.dpidAlias).toEqual(publishResult.dpid);
      });
    });

    describe("node update", async () => {
      let updateResult: PublishResponse;
      let nodeStateBefore: NodeResponse;

      beforeAll(async () => {
        nodeStateBefore = await getDraftNode(uuid);
        updateResult = await publishNode(uuid, did);
        await sleep(1000);
      });

      test("updates most recent state", async () => {
        const ceramicObject = await getCurrentState(
          updateResult.ceramicIDs!.streamID
        );
        expect(ceramicObject?.manifest).toEqual(
          updateResult.updatedManifestCid
        );
      });

      test("adds a new version", async () => {
        const ceramicHistory = await getCodexHistory(
          updateResult.ceramicIDs!.streamID
        );
        expect(ceramicHistory.versions.length).toEqual(2);
      });

      test("does not change the tracked streamID", async () => {
        const node = await getDraftNode(uuid);
        expect(node.ceramicStream).toEqual(nodeStateBefore.ceramicStream);
      });

      test("does not mint a new dPID alias", async () => {
        const node = await getDraftNode(uuid);
        expect(node.dpidAlias).toEqual(nodeStateBefore.dpidAlias);
      });
    });

    describe("node with long legacy history", async () => {
      let uuid: string;
      let pubResult: PublishResponse;
      let legacyDpid: number = randomInt(1,1000);

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;
        await setManifestDpid(uuid, legacyDpid);
        await addLegacyDpid(testSigner, legacyDpid, await testSigner.getAddress(), [
          { cid: 'bafkreigcc2l7aay34i5zeot5wjvpspdpwp6ipfzffs3cnnpbpt7c2gqu6i', time: 1 },
          { cid: 'bafkreig6lp6265u42llqh6hkzxc54hmyfea7ax7gewg7tdyvthieotmwpy', time: 2 },
          { cid: 'bafkreici3wzz7njqigyo7ebzwn3kibxgwjr43ihowwebl4exmfy75tkpjm', time: 3 },
          { cid: 'bafkreicgxdcypaq5tmmrrva3tl7k2un47pfolg3mox72j5k65zitsukfii', time: 4 },
          { cid: 'bafkreie7j6ji7ynh5d5yoldoxfevak55nkmcx5h7v3c6h4xy7le25sbgke', time: 5 },
        ]);

        // make a regular publish
        pubResult = await publishNode(uuid, did);
      }, 1000000);

      test("migrates history to new stream", async () => {
        // legacy registry only knows about the first update
        const dpidHistory = await getLegacyHistory(legacyDpid);
        expect(dpidHistory.versions.length).toEqual(5);

        // codex history has the legacy history, plus the new update
        const codexHistory = await getCodexHistory(
          pubResult.ceramicIDs!.streamID
        );
        expect(codexHistory.versions.length).toEqual(6);

        const cidsInDpidHistory = dpidHistory.versions.map((v) => v.cid);
        const cidsInCodex = codexHistory.versions.map(v => v.manifest);

        expect(cidsInDpidHistory).toEqual(cidsInCodex.slice(0, -1));
      });
    });

    describe("node with legacy history", async () => {
      let uuid: string;
      let pubResult: PublishResponse;
      let legacyDpid: number = randomInt(1,1000);

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;
        await setManifestDpid(uuid, legacyDpid);
        await addLegacyDpid(testSigner, legacyDpid, await testSigner.getAddress(), [
          { cid: 'bafkreigcc2l7aay34i5zeot5wjvpspdpwp6ipfzffs3cnnpbpt7c2gqu6i', time: 1337 }
        ]);

        // make a regular publish
        pubResult = await publishNode(uuid, did);
      });

      test("migrates history to new stream", async () => {
        // legacy registry only knows about the first update
        const dpidHistory = await getLegacyHistory(legacyDpid);
        expect(dpidHistory.versions.length).toEqual(1);

        // codex history has the legacy and the new update
        const codexHistory = await getCodexHistory(
          pubResult.ceramicIDs!.streamID
        );
        expect(codexHistory.versions.length).toEqual(2);
      });

      test("tracks streamID with node state", async () => {
        const node = await getDraftNode(uuid);
        expect(node.ceramicStream).toEqual(pubResult.ceramicIDs?.streamID);
      });

      test("tracks upgraded dpid alias with node state", async () => {
        const node = await getDraftNode(uuid);
        const dpidAlias = await findDpid(node.ceramicStream!);
        expect(dpidAlias).toEqual(legacyDpid);
      });
    });

    describe("node with legacy history but mismatched stream owner", async () => {
      let uuid: string;
      let legacyDpid: number = randomInt(1,1000);

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;
        await setManifestDpid(uuid, legacyDpid);
        await addLegacyDpid(testSigner, legacyDpid, await testSigner.getAddress(), [
          { cid: 'bafkreigcc2l7aay34i5zeot5wjvpspdpwp6ipfzffs3cnnpbpt7c2gqu6i', time: 1337 }]);
      });

      test("refuses to upgrade with an unmatching DID", async () => {
        const differentDid = await authorizedSessionDidFromSigner(
          signerFromPkey(
            // Different last 4 chars
            "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2aaaa"
          ),
          getResources()
        );
        await expect(publishNode(uuid, differentDid)).rejects.toThrowError(
          "Refusing to migrate history"
        );
      });

      test("refuses to upgrade with an unmatching signer", async () => {
        const differentDid = await authorizedSessionDidFromSigner(
          signerFromPkey(
            "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2aaaa"
          ),
          getResources()
        );
        await expect(publishNode(uuid, differentDid)).rejects.toThrow();
      });
    });

    /** This is not an user feature, but part of error handling during legacy publish */
    test("can remove dPID from manifest", async () => {
      await changeManifest(uuid, [{ type: "Remove Dpid" }]);
      const node = await getDraftNode(uuid);
      expect(node.manifestData.dpid).toBeUndefined();
    });
  });

  describe("data management", async () => {
    describe("trees", async () => {
      test("can be retrieved by owner", async () => {
        const {
          ok,
          node: { uuid },
        } = await createBoilerplateNode();
        expect(ok).toEqual(true);

        const treeResult = await retrieveDraftFileTree(uuid);
        expect(treeResult.tree).toHaveLength(1);
      });
    });

    describe("folders", async () => {
      const expectedFolderName = "MyFolder";
      let uuid: string;

      beforeAll(async () => {
        const createRes = await createBoilerplateNode();
        expect(createRes.ok).toEqual(true);

        uuid = createRes.node.uuid;

        await createNewFolder({
          uuid,
          contextPath: "root",
          newFolderName: expectedFolderName,
        });
      });

      test("can be created", async () => {
        const treeResult = await retrieveDraftFileTree(uuid);
        const actualFolderName = treeResult.tree[0].contains![0].name;

        expect(actualFolderName).toEqual(expectedFolderName);
      });

      test("can be moved", async () => {
        const otherFolderName = "dir";
        await createNewFolder({
          uuid,
          contextPath: "root",
          newFolderName: otherFolderName,
        });
        await moveData({
          uuid,
          oldPath: `root/${otherFolderName}`,
          newPath: `root/${expectedFolderName}/${expectedFolderName}`,
        });

        const treeResult = await retrieveDraftFileTree(uuid);

        const dir = treeResult.tree[0].contains![0];
        expect(dir.contains![0].name).toEqual(expectedFolderName);
      });

      test("can be deleted", async () => {
        await deleteData({
          uuid,
          path: `root/${expectedFolderName}`,
        });
        const treeResult = await retrieveDraftFileTree(uuid);

        expect(treeResult.tree[0].contains).toEqual([]);
      });
    });

    describe("files", async () => {
      test("can be uploaded", async () => {
        const {
          node: { uuid },
        } = await createBoilerplateNode();
        const files = ["package.json", "package-lock.json"];
        await uploadFiles({
          uuid,
          contextPath: "root",
          files,
        });

        const treeResult = await retrieveDraftFileTree(uuid);
        const driveContent = treeResult.tree[0].contains!;

        expect(driveContent.map((driveObject) => driveObject.name)).toEqual(
          expect.arrayContaining(files)
        );
        driveContent.forEach((driveObject) => {
          expect(driveObject.size).toBeGreaterThan(0);
        });
      });

      test("can be moved", async () => {
        const {
          node: { uuid },
        } = await createBoilerplateNode();
        const files = ["package.json"];
        const uploadResult = await uploadFiles({
          uuid,
          contextPath: "root",
          files,
        });
        expect(uploadResult.tree[0].contains![0].path).toEqual(
          "root/package.json"
        );

        await moveData({
          uuid,
          oldPath: "root/package.json",
          newPath: "root/json.package",
        });

        const treeResult = await retrieveDraftFileTree(uuid);
        expect(treeResult.tree[0].contains![0].path).toEqual(
          "root/json.package"
        );
      });

      test("can be deleted", async () => {
        const {
          node: { uuid },
        } = await createBoilerplateNode();
        const files = ["package.json"];
        const uploadResult = await uploadFiles({
          uuid,
          contextPath: "root",
          files,
        });

        expect(uploadResult.tree[0].contains![0].name).toEqual("package.json");

        await deleteData({
          uuid,
          path: "root/package.json",
        });

        const treeResult = await retrieveDraftFileTree(uuid);

        expect(treeResult.tree[0].contains!.length).toEqual(0);
      });

      describe("can be uploaded by PDF URL", async () => {
        let treeResult: RetrieveResponse;
        let uploadResult: UploadFilesResponse;
        let externalUrl: ExternalUrl;
        beforeAll(async () => {
          const {
            node: { uuid },
          } = await createBoilerplateNode();
          externalUrl = {
            url: "https://ipfs.desci.com/ipfs/bafybeiamslevhsvjlnfejg7p2rzk6bncioaapwb3oauu7zqwmfpwko5ho4",
            path: "manuscript.pdf",
          };
          uploadResult = await uploadPdfFromUrl({
            uuid,
            externalUrl,
            targetPath: "root",
            componentSubtype: ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
          });
          treeResult = await retrieveDraftFileTree(uuid);
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
              externalUrl:
                "https://ipfs.desci.com/ipfs/bafybeiamslevhsvjlnfejg7p2rzk6bncioaapwb3oauu7zqwmfpwko5ho4",
            }),
            starred: false,
          });

          expect(components).toEqual(
            expect.arrayContaining([expectedComponent])
          );
        });
      });

      describe("can be uploaded by repo URL", async () => {
        let externalUrl: ExternalUrl;
        let treeResult: RetrieveResponse;
        beforeAll(async () => {
          const {
            node: { uuid },
          } = await createBoilerplateNode();
          externalUrl = {
            // This is probably stupid to do in a unit test
            url: "https://github.com/desci-labs/desci-codex",
            path: "DeSci Codex",
          };
          await uploadGithubRepoFromUrl({
            uuid,
            externalUrl,
            targetPath: "root",
            componentSubtype:
              ResearchObjectComponentCodeSubtype.SOFTWARE_PACKAGE,
          });
          treeResult = await retrieveDraftFileTree(uuid);
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

    describe("external CID", async () => {
      test("can be added", async () => {
        const {
          node: { uuid },
        } = await createBoilerplateNode();
        await createNewFolder({
          uuid,
          contextPath: "root",
          newFolderName: "catpics",
        });
        const catCid =
          "bafkreidivzimqfqtoqxkrpge6bjyhlvxqs3rhe73owtmdulaxr5do5in7u";
        const addResult = await addExternalCid({
          uuid,
          externalCids: [
            {
              cid: catCid,
              name: "cat.jpg",
            },
          ],
          contextPath: "/catpics",
          componentType: ResearchObjectComponentType.DATA,
          componentSubtype: ResearchObjectComponentDataSubtype.IMAGE,
        });

        expect(addResult.tree[0].contains![0].contains![0]).toMatchObject(
          expect.objectContaining({
            cid: catCid,
            path: "root/catpics/cat.jpg",
            name: "cat.jpg",
            external: true,
          })
        );
      });
    });
  });
});

const createBoilerplateNode = async () => {
  const node: Omit<CreateDraftParams, "links"> = {
    title: "My Node",
    defaultLicense: "CC-BY",
    researchFields: ["Horticulture"],
  };

  return await createDraftNode(node);
};

/**
 * Add a legacy dPID to the alias registry (for testing only)
 *
 * Note: only callable as the contract owner
 */
const addLegacyDpid = async (signer: Signer, dpid: number, owner: string, versions: DpidAliasRegistry.LegacyVersionStruct[]) => {
  const tx = await dpidAliasRegistryWriter(signer).importLegacyDpid(dpid, {
    owner,
    versions,
  });
  await tx.wait();
}

const setManifestDpid = async (uuid: string, dpid: number) => {
  return await changeManifest(uuid, [{ type: "Publish Dpid", dpid: { prefix: 'beta', id: dpid.toString() } }]);
}
