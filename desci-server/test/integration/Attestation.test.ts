import 'dotenv/config';
import 'mocha';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Attestation, DesciCommunity, Node, NodeVersion, User } from '@prisma/client';
import { assert } from 'chai';

import { prisma } from '../../src/client.js';
import attestationService from '../../src/services/Attestation.js';
import communityService from '../../src/services/Communities.js';
import { client as ipfs, spawnEmptyManifest } from '../../src/services/ipfs.js';
import { randomUUID64 } from '../../src/utils.js';
import { createDraftNode, createUsers } from '../util.js';

const communitiesData = [
  {
    name: 'Desci Labs',
    image_url:
      'https://assets-global.website-files.com/634742417f9e1c182c6697d4/634f55796f66af7ee884539f_logo-white.svg',
    description: 'Desci Labs is revolutionalizing the future of scientic publishing.',
  },
  {
    name: 'Local Community',
    image_url:
      'https://assets-global.website-files.com/634742417f9e1c182c6697d4/634f55796f66af7ee884539f_logo-white.svg',
    description: 'Local communities matter too.',
  },
];

const attestationData = [
  {
    name: 'Reproducibility',
    description:
      'For research objects that provide the code and data needed to computationally reproduce key figures, tables and results.',
    image_url: 'http://image_pat.png',
  },
  {
    name: 'Open Data Access',
    description: 'For research objects that provide the code and data openly',
    image_url: 'http://image_pat.png',
  },
  {
    name: 'Fair Metadata',
    description:
      'For research objects that provide the code and data needed to computationally reproduce key figures, tables and results.',
    image_url: 'http://image_pat.png',
  },
];

const nodesData = [
  {
    title: 'Node1 title',
  },
  {
    title: 'Node2 title',
  },
  {
    title: 'Node3 title',
  },
  {
    title: 'Node4 title',
  },
];

describe('Attestations', async () => {
  let baseManifest: ResearchObjectV1;
  let baseManifestCid: string;
  let users: User[];
  let nodes: Node[];
  let nodeVersions: NodeVersion[];
  let desciCommunity: DesciCommunity;
  let localCommunity: DesciCommunity;
  let reproducibilityAttestation: Attestation;
  let openDataAttestation: Attestation;
  let fairMetadataAttestation: Attestation;
  // let localAttestation: Attestation;

  /**
   * INIT USERS
   * Init user nodes
   * Publish different versions of nodes
   * Seed Communities
   * Seed attestations
   */
  const setup = async () => {
    // Create communities
    desciCommunity = await communityService.createCommunity(communitiesData[0]);
    console.log({ desciCommunity });
    localCommunity = await communityService.createCommunity(communitiesData[1]);
    console.log({ localCommunity });
    assert(desciCommunity, 'desciCommunity is null or undefined');
    assert(localCommunity, 'localCommunity is null or undefined');
    // Create attestations
    [reproducibilityAttestation, openDataAttestation, fairMetadataAttestation] = await Promise.all(
      attestationData.map((data) => attestationService.create({ communityId: desciCommunity.id as number, ...data })),
    );
    console.log({ reproducibilityAttestation, openDataAttestation, fairMetadataAttestation });

    users = await createUsers(5);
    console.log({ users });

    const BASE_MANIFEST = await spawnEmptyManifest();
    baseManifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = (await ipfs.add(JSON.stringify(BASE_MANIFEST), { cidVersion: 1, pin: true })).cid;
    baseManifestCid = BASE_MANIFEST_CID.toString();

    nodes = await Promise.all(
      users.map((user, idx) =>
        createDraftNode({
          ownerId: user.id,
          title: `Node${idx} Title`,
          uuid: randomUUID64(),
          manifestUrl: baseManifestCid,
          replicationFactor: 0,
        }),
      ),
    );
    console.log({ nodes });

    nodeVersions = await Promise.all(
      nodes.map((node) => prisma.nodeVersion.create({ data: { nodeId: node.id, manifestUrl: node.manifestUrl } })),
    );
    console.log({ nodeVersions });
  };

  const tearDown = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Attestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "AttestationVersion" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
  };

  before(async () => {
    await setup();
  });

  after(async () => {
    tearDown();
  });

  describe('Claiming an Attestation', () => {
    it('should claim an attestation to a node', () => {});
    it('should add author to a community membership', () => {});
    it('should assign attestation to correct node version', () => {});
    it('should add node to community feed', () => {});
  });

  describe('Claiming an Desci Community Selected Attestations', () => {
    it('should claim an attestation to a node', () => {});
    it('should add author to a community membership', () => {});
    it('should assign attestation to correct node version', () => {});
    it('should add node to community feed', () => {});
  });

  describe('UnClaiming an Attestation', () => {
    it('should unclaim an attestation from a node', () => {});
    it('should remove/hide node from community feed if entry requirement is not met', () => {});
    it('should assign attestation to correct node version', () => {});
  });

  describe('Reacting to a Node Attestation', () => {
    it('should react to a node attestation', () => {});
    it('should remove reaction to a node attestation', () => {});
  });

  describe('Node Attestation Comments', () => {
    it('should comment to a node attestation', () => {});
    it('should remove comment to a node attestation', () => {});
  });

  describe('Node Attestation Verification', () => {
    it('should allow member verify a node attestation', () => {});
    it('should restrict author from verifying their claim', () => {});
  });

  describe('Community Engagement/Verification Signal', () => {
    it('should curate all node impressions across all attestations', () => {});
    it('should list all engaging users and only count users once', () => {});
  });

  describe('Node Attestation Engagement/Verification Signal', () => {
    it('should curate all node impressions across all claims', () => {});
    it('should list all engaging users and only count users once', () => {});
  });
});
