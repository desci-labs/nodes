/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeAll, expect } from "vitest";
import type {
  AddCodeComponentParams,
  AddLinkComponentParams,
  AddPdfComponentParams,
  CreateDraftParams,
  ExternalUrl,
  NodeResponse,
  LegacyPublishResponse,
  RetrieveResponse,
  UploadFilesResponse,
} from "../src/api.js";
import {
  createDraftNode,
  getDraftNode,
  publishDraftNode,
  createNewFolder,
  retrieveDraftFileTree,
  moveData,
  uploadFiles,
  deleteDraftNode,
  getDpidHistory,
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
} from "../src/api.js";
import axios from "axios";
import { getCodexHistory, getCurrentState, getRawState } from "../src/codex.js";
import { dpidPublish, findDpid } from "../src/chain.js";
import { sleep } from "./util.js";
import { convert0xHexToCid } from "../src/util/converting.js";
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
} from "../src/util/signing.js";
import {
  NODESLIB_CONFIGS,
  getNodesLibInternalConfig,
  setApiKey,
  setNodesLibConfig,
} from "../src/index.js";
import { getResources } from "@desci-labs/desci-codex-lib";
import { contracts, typechain as tc } from "@desci-labs/desci-contracts";
import { Wallet, providers } from "ethers";

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

  describe("legacy publishing ", async () => {
    let uuid: string;
    let publishResult: LegacyPublishResponse;
    const did = await authorizedSessionDidFromSigner(
      testSigner,
      getResources()
    );

    beforeAll(async () => {
      const { node } = await createBoilerplateNode();
      uuid = node.uuid;
      publishResult = await publishDraftNode({ uuid, signer: testSigner, did });
      // Wait for repo and subgraph changes to go through
      // await sleep(2_500);
    });

    describe("new node", async () => {
      test("adds it to the dpid registry", async () => {
        const historyResult = await getDpidHistory(uuid);
        const actualCid = convert0xHexToCid(historyResult.versions[0].cid);
        expect(actualCid).toEqual(publishResult.updatedManifestCid);
      });

      test("sets dPID in manifest", async () => {
        const node = await getDraftNode(uuid);
        expect(node.manifestData.dpid).not.toBeUndefined();
        expect(node.manifestData.dpid?.prefix).toEqual("beta");
        expect(node.manifestData.dpid?.id).not.toBeNaN();
      });

      test("to codex", async () => {
        expect(publishResult.ceramicIDs).not.toBeUndefined();
        const ceramicObject = await getCurrentState(
          publishResult.ceramicIDs!.streamID
        );
        expect(ceramicObject?.manifest).toEqual(
          publishResult.updatedManifestCid
        );
      });

      test("has a CACAO from the passed DID", async () => {
        const streamState = await getRawState(
          publishResult.ceramicIDs!.streamID
        );
        const controller = streamState.state.metadata.controllers.at(0);
        const signerAddress = (await testSigner.getAddress()).toLowerCase();

        expect(controller).toEqual(did.parent);
        expect(controller!.replace(/did:pkh.*:/, "")).toEqual(signerAddress);
      });

      test("can optionally derive DID from just a signer", async () => {
        const { node } = await createBoilerplateNode();
        const result = await publishDraftNode({
          uuid: node.uuid,
          signer: testSigner,
        });
        const streamState = await getRawState(result.ceramicIDs!.streamID);
        const controller = streamState.state.metadata.controllers.at(0);
        const signerAddress = (await testSigner.getAddress()).toLowerCase();
        expect(controller!.replace(/did:pkh.*:/, "")).toEqual(signerAddress);
      });
    });

    describe("node with long legacy history", async () => {
      let uuid: string;
      let pubResult: LegacyPublishResponse;
      let legacyDpid: number;

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;

        let updatedManifestCids = [];
        // make a dpid-only publish
        for (let i = 0; i < 5; i++) {
          await updateTitle(uuid, `Title ${i}`);
          const dpidExists = i > 0;
          const {
            prepubResult: { updatedManifest, updatedManifestCid },
          } = await dpidPublish(uuid, dpidExists, testSigner);
          legacyDpid = parseInt(updatedManifest.dpid!.id!);
          updatedManifestCids.push(updatedManifestCid);
        }

        // Allow graph node to index
        await sleep(2_500);

        // Import as legacy entry (i.e., fake migration step)
        // Publish uses this to validate history before migrating dPID
        const wallet = new Wallet(
          TEST_PKEY,
          new providers.JsonRpcProvider(
            getNodesLibInternalConfig().chainConfig.rpcUrl
          )
        );
        const aliasRegistry = tc.DpidAliasRegistry__factory.connect(
          contracts.localDpidAliasInfo.proxies.at(0)!.address,
          wallet
        );
        const tx = await aliasRegistry.importLegacyDpid(legacyDpid!, {
          owner: await testSigner.getAddress(),
          versions: updatedManifestCids.map((cid) => ({ cid, time: 1337 })),
        });
        await tx.wait();

        // make a regular publish
        try {
          await publishDraftNode({ uuid, signer: testSigner });
        } catch (e) {
          // Expect this to fail
          // To be able to test incorrect histories, we ignore the error thrown from the publish route
          // and compare histories manually
        }
      }, 1333333337);

      test("migrates history to new stream", async () => {
        const { ceramicStream } = await getDraftNode(uuid);

        // legacy registry only knows about the first update
        const dpidHistory = await getLegacyHistory(legacyDpid);
        expect(dpidHistory.versions.length).toEqual(5);

        // codex history has the legacy and the new update
        const codexHistory = await getCodexHistory(ceramicStream!);
        expect(codexHistory.length).toEqual(6);

        const codexVersionsDpidResolver = await (
          await fetch(`http://localhost:5460/api/v2/resolve/dpid/${legacyDpid}`)
        ).json();

        const cidsInDpidHistory = dpidHistory.versions.map((v) => v.cid);
        const cidsInCodex = codexVersionsDpidResolver.versions.map(
          (v: any) => v.manifest
        );

        // debugger

        expect(cidsInDpidHistory).toEqual(cidsInCodex);
      });
    });

    describe("node update", async () => {
      beforeAll(async () => {
        // async publish errors on re-publish before it finishes
        await sleep(5_000);
        await publishDraftNode({ uuid, signer: testSigner, did });
        // Allow graph node to index
        await sleep(2_500);
      });

      test("updates entry in dpid registry", async () => {
        const historyResult = await getDpidHistory(uuid);
        const actualCid = convert0xHexToCid(historyResult.versions[0].cid);
        expect(actualCid).toEqual(publishResult.updatedManifestCid);
        expect(historyResult.versions.length).toEqual(2);
      });

      test("publishes to codex stream", async () => {
        expect(publishResult.ceramicIDs).not.toBeUndefined();

        const ceramicObject = await getCurrentState(
          publishResult.ceramicIDs!.streamID
        );
        expect(ceramicObject?.manifest).toEqual(
          publishResult.updatedManifestCid
        );

        const ceramicHistory = await getCodexHistory(
          publishResult.ceramicIDs!.streamID
        );
        expect(ceramicHistory.length).toEqual(2);
      });
    });

    test(
      "with backfill ceramic migration",
      async () => {
        const {
          node: { uuid },
        } = await createBoilerplateNode();

        // make a dpid-only publish
        await dpidPublish(uuid, false, testSigner);

        // Allow graph node to index
        await sleep(2_500);

        // make a regular publish
        const pubResult = await publishDraftNode({
          uuid,
          signer: testSigner,
          did,
        });

        // Allow graph node to index
        await sleep(5_000);

        // make sure codex history is of equal length
        const dpidHistory = await getDpidHistory(uuid);
        const codexHistory = await getCodexHistory(
          pubResult.ceramicIDs!.streamID
        );
        expect(dpidHistory.versions.length).toEqual(2);
        expect(codexHistory.length).toEqual(2);
      },
      { timeout: 10_000 }
    );

    /** This is not an user feature, but part of error handling during publish */
    test("can remove dPID from manifest", async () => {
      await changeManifest(uuid, [{ type: "Remove Dpid" }]);
      const node = await getDraftNode(uuid);
      expect(node.manifestData.dpid).toBeUndefined();
    });
  });

  describe("publishing ", async () => {
    let uuid: string;
    let publishResult: LegacyPublishResponse;
    const did = await authorizedSessionDidFromSigner(
      testSigner,
      getResources()
    );

    beforeAll(async () => {
      const { node } = await createBoilerplateNode();
      uuid = node.uuid;
      publishResult = await publishNode(uuid, did);
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
        expect(history.length).toEqual(1);
      });

      test("does NOT set dPID in manifest", async () => {
        const node = await getDraftNode(uuid);
        expect(node.manifestData.dpid).toBeUndefined();
      });

      test("has a CACAO from the passed DID", async () => {
        const streamState = await getRawState(
          publishResult.ceramicIDs!.streamID
        );
        const controller = streamState.state.metadata.controllers.at(0);
        const signerAddress = (await testSigner.getAddress()).toLowerCase();

        expect(controller).toEqual(did.parent);
        expect(controller!.replace(/did:pkh.*:/, "")).toEqual(signerAddress);
      });

      test("can optionally derive DID from just a signer", async () => {
        const { node } = await createBoilerplateNode();
        const result = await publishNode(node.uuid, testSigner);
        const streamState = await getRawState(result.ceramicIDs!.streamID);
        const controller = streamState.state.metadata.controllers.at(0);
        const signerAddress = (await testSigner.getAddress()).toLowerCase();
        expect(controller!.replace(/did:pkh.*:/, "")).toEqual(signerAddress);
      });

      test("tracks streamID with node state", async () => {
        const node = await getDraftNode(uuid);
        expect(node.ceramicStream).toEqual(publishResult.ceramicIDs?.streamID);
      });

      test("tracks new dpid alias with node state", async () => {
        const node = await getDraftNode(uuid);
        const dpidAlias = await findDpid(node.ceramicStream!);
        expect(node.dpidAlias).toEqual(dpidAlias);
      });
    });

    describe("node update", async () => {
      let updateResult: LegacyPublishResponse;
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
        expect(ceramicHistory.length).toEqual(2);
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
      let pubResult: LegacyPublishResponse;
      let legacyDpid: number;

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;

        let updatedManifestCids = [];
        // make a dpid-only publish
        for (let i = 0; i < 5; i++) {
          await updateTitle(uuid, `Title ${i}`);
          const dpidExists = i > 0;
          const {
            prepubResult: { updatedManifest, updatedManifestCid },
          } = await dpidPublish(uuid, dpidExists, testSigner);
          legacyDpid = parseInt(updatedManifest.dpid!.id!);
          updatedManifestCids.push(updatedManifestCid);
        }

        // Allow graph node to index
        await sleep(2_500);

        // Import as legacy entry (i.e., fake migration step)
        // Publish uses this to validate history before migrating dPID
        const wallet = new Wallet(
          TEST_PKEY,
          new providers.JsonRpcProvider(
            getNodesLibInternalConfig().chainConfig.rpcUrl
          )
        );
        const aliasRegistry = tc.DpidAliasRegistry__factory.connect(
          contracts.localDpidAliasInfo.proxies.at(0)!.address,
          wallet
        );
        const tx = await aliasRegistry.importLegacyDpid(legacyDpid!, {
          owner: await testSigner.getAddress(),
          versions: updatedManifestCids.map((cid) => ({ cid, time: 1337 })),
        });
        await tx.wait();

        // make a regular publish
        pubResult = await publishNode(uuid, did);
      }, 1333333337);

      test("migrates history to new stream", async () => {
        // legacy registry only knows about the first update
        const dpidHistory = await getLegacyHistory(legacyDpid);
        expect(dpidHistory.versions.length).toEqual(5);

        // codex history has the legacy and the new update
        const codexHistory = await getCodexHistory(
          pubResult.ceramicIDs!.streamID
        );
        expect(codexHistory.length).toEqual(6);

        const codexVersionsDpidResolver = await (
          await fetch(`http://localhost:5460/api/v2/resolve/dpid/${legacyDpid}`)
        ).json();

        const cidsInDpidHistory = dpidHistory.versions.map((v) => v.cid);
        const cidsInCodex = codexVersionsDpidResolver.versions
          .map((v: any) => v.manifest)
          .slice(0, -1);

        expect(cidsInDpidHistory).toEqual(cidsInCodex);
      });
    });
    describe("node with legacy history", async () => {
      let uuid: string;
      let pubResult: LegacyPublishResponse;
      let legacyDpid: number;

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;

        // make a dpid-only publish
        const {
          prepubResult: { updatedManifest, updatedManifestCid },
        } = await dpidPublish(uuid, false, testSigner);

        // Allow graph node to index
        await sleep(2_500);

        legacyDpid = parseInt(updatedManifest.dpid!.id);

        // Import as legacy entry (i.e., fake migration step)
        // Publish uses this to validate history before migrating dPID
        const wallet = new Wallet(
          TEST_PKEY,
          new providers.JsonRpcProvider(
            getNodesLibInternalConfig().chainConfig.rpcUrl
          )
        );
        const aliasRegistry = tc.DpidAliasRegistry__factory.connect(
          contracts.localDpidAliasInfo.proxies.at(0)!.address,
          wallet
        );
        const tx = await aliasRegistry.importLegacyDpid(legacyDpid, {
          owner: await testSigner.getAddress(),
          versions: [
            {
              cid: updatedManifestCid,
              time: 1337, // Import fn can't validate this anyway
            },
          ],
        });
        await tx.wait();

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
        expect(codexHistory.length).toEqual(2);
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
      let legacyDpid: number;

      beforeAll(async () => {
        const { node } = await createBoilerplateNode();
        uuid = node.uuid;

        // make a dpid-only publish
        const {
          prepubResult: { updatedManifest, updatedManifestCid },
        } = await dpidPublish(uuid, false, testSigner);

        // Allow graph node to index
        await sleep(2_500);

        legacyDpid = parseInt(updatedManifest.dpid!.id);

        // Import as legacy entry (i.e., fake migration step)
        // Publish uses this to validate history before migrating dPID
        const wallet = new Wallet(
          TEST_PKEY,
          new providers.JsonRpcProvider(
            getNodesLibInternalConfig().chainConfig.rpcUrl
          )
        );
        const aliasRegistry = tc.DpidAliasRegistry__factory.connect(
          contracts.localDpidAliasInfo.proxies.at(0)!.address,
          wallet
        );
        const tx = await aliasRegistry.importLegacyDpid(legacyDpid, {
          owner: await testSigner.getAddress(),
          versions: [
            {
              cid: updatedManifestCid,
              time: 1337, // Import fn can't validate this anyway
            },
          ],
        });
        await tx.wait();
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
