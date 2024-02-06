import 'dotenv/config';
import 'mocha';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import {
  Attestation,
  AttestationVersion,
  DesciCommunity,
  Node,
  NodeAttestation,
  NodeAttestationReaction,
  NodeVersion,
  User,
} from '@prisma/client';
import { assert, expect, use } from 'chai';

import { prisma } from '../../src/client.js';
import { attestationService, communityService } from '../../src/internal.js';
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

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
};

describe.only('Attestations Service', async () => {
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
    // console.log({ users });

    const baseManifest = await spawnEmptyManifest();
    // baseManifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = (await ipfs.add(JSON.stringify(baseManifest), { cidVersion: 1, pin: true })).cid;
    baseManifestCid = BASE_MANIFEST_CID.toString();

    nodes = await Promise.all(
      users.map((user, idx) =>
        createDraftNode({
          ownerId: user.id,
          title: `Node${idx} Title`,
          cid: baseManifestCid,
          uuid: randomUUID64(),
          manifestUrl: baseManifestCid,
          replicationFactor: 0,
        }),
      ),
    );
    // console.log({ nodes });

    nodeVersions = await Promise.all(
      nodes.map((node) =>
        prisma.nodeVersion.create({
          data: { nodeId: node.id, manifestUrl: node.manifestUrl, transactionId: randomUUID64() },
        }),
      ),
    );
    // console.log({ nodeVersions });
  };

  const tearDown = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Attestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "AttestationVersion" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
  };

  before(async () => {
    await clearDatabase();
    await tearDown();

    await setup();
  });

  after(async () => {
    await clearDatabase();
    await tearDown();
  });

  describe('Claiming an Attestation', () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;

    before(async () => {
      node = nodes[0];
      author = users[0];
      assert(node.uuid);
      const versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      attestationVersion = versions[versions.length - 1];
      claim = await attestationService.claimAttestation({
        attestationId: reproducibilityAttestation.id,
        attestationVersion: attestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    });

    it('should claim an attestation to a node', () => {
      expect(claim).to.be.not.undefined;
      expect(claim.attestationId).to.be.equal(reproducibilityAttestation.id);
      expect(claim.attestationVersionId).to.be.equal(attestationVersion.id);
      expect(claim.claimedById).to.be.equal(author.id);
      expect(claim.nodeDpid10).to.be.equal('1');
      expect(claim.nodeUuid).to.be.equal(node.uuid);
      expect(claim.nodeVersion).to.be.equal(nodeVersion);
      expect(claim.desciCommunityId).to.be.equal(desciCommunity.id);
    });
    // it('should add author to a community membership', () => {});
    // it('should assign attestation to correct node version', () => {});
    it('should prevent double claim', async () => {
      assert(node.uuid);
      const canClaim = await attestationService.canClaimAttestation({
        nodeVersion,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: attestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        claimerId: author.id,
      });
      // console.log('CAN CLAIM', canClaim);
      expect(canClaim).to.be.false;
    });
  });

  describe('Claiming a Desci Community Selected Attestations', () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let author: User;

    before(async () => {
      node = nodes[0];
      author = users[0];
      assert(node.uuid);
      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];
      claim = await attestationService.claimAttestation({
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      // add to community entry
      await attestationService.addCommunitySelectedAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunitySelectedAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });
      console.log({ claim });
      // console.log(claim);
      // console.log(claim)
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    });

    it('should not add node to community radar', async () => {
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      console.log({ communityRadar });
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.undefined;
    });

    it('should add node to community radar if it meets the entry requirements', async () => {
      assert(node.uuid);
      await attestationService.claimAttestation({
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      console.log({ communityRadar });
      expect(communityRadar.length).to.be.equal(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.not.undefined;
      expect(radarNode?.NodeAttestation.length).be.equal(2);
      expect(radarNode?.NodeAttestation[0].attestationId).to.be.equal(claim.attestationId);
      expect(radarNode?.NodeAttestation[0].attestationVersionId).to.be.equal(claim.attestationVersionId);
      expect(radarNode?.NodeAttestation[0].desciCommunityId).to.be.equal(claim.desciCommunityId);
      expect(radarNode?.NodeAttestation[0].nodeDpid10).to.be.equal('1');
      expect(radarNode?.NodeAttestation[0].nodeVersion).to.be.equal(nodeVersion);
    });

    // it('should assign attestation to correct node version', () => {});
  });

  describe('UnClaiming an Attestation', () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;

    before(async () => {
      node = nodes[0];
      author = users[0];
      assert(node.uuid);
      const versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      attestationVersion = versions[versions.length - 1];
      claim = await attestationService.claimAttestation({
        attestationId: reproducibilityAttestation.id,
        attestationVersion: attestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      // add to community entry list
      await attestationService.addCommunitySelectedAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: attestationVersion.id,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    });

    it('should unclaim an attestation from a node', async () => {
      // check if it's appears in community radar
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      console.log({ communityRadar });
      expect(communityRadar.length).to.be.equal(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.not.undefined;
      expect(radarNode?.NodeAttestation.length).be.equal(1);

      // unclaim attestaion
      const unclaimed = await attestationService.unClaimAttestation(claim.id);
      console.log({ unclaimed });
      expect(unclaimed).to.be.not.null;
      expect(unclaimed).to.be.not.undefined;
      expect(unclaimed.attestationId).to.be.equal(reproducibilityAttestation.id);
      expect(unclaimed.desciCommunityId).to.be.equal(desciCommunity.id);
      expect(unclaimed.attestationVersionId).to.be.equal(attestationVersion.id);
      expect(unclaimed.nodeDpid10).to.be.equal('1');

      const nodeClaim = await attestationService.getClaimOnAttestationVersion(
        '1',
        reproducibilityAttestation.id,
        attestationVersion.id,
      );
      expect(nodeClaim).to.be.null;
    });

    it('should remove/hide node from community feed if entry requirement is not met', async () => {
      // check if it's has been removed from community radar
      // await attestationService.unClaimAttestation(claim.id);
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      console.log({ communityRadar });
      expect(communityRadar.length).to.be.equal(0);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.undefined;
    });
    // it('should assign attestation to correct node version', () => {});
  });

  describe('Reacting to a Node Attestation(Claim)', () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let reaction: NodeAttestationReaction;

    before(async () => {
      node = nodes[0];
      author = users[0];
      assert(node.uuid);
      const versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      attestationVersion = versions[versions.length - 1];
      claim = await attestationService.claimAttestation({
        attestationId: reproducibilityAttestation.id,
        attestationVersion: attestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      reaction = await attestationService.createReaction({
        claimId: claim.id,
        userId: users[1].id,
        reaction: 'U+1F42F',
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    });

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
