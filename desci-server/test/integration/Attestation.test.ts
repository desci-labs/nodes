import 'dotenv/config';
import 'mocha';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import {
  Annotation,
  Attestation,
  AttestationVersion,
  DesciCommunity,
  Node,
  NodeAttestation,
  NodeAttestationReaction,
  NodeAttestationVerification,
  NodeVersion,
  Prisma,
  User,
} from '@prisma/client';
import { assert, expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../src/client.js';
import { app } from '../../src/index.js';
import {
  AllAttestation,
  CommunityAttestation,
  DuplicateReactionError,
  DuplicateVerificationError,
  Engagement,
  NodeAttestationFragment,
  NodeRadar,
  NodeRadarItem,
  VerificationError,
  attestationService,
  communityService,
} from '../../src/internal.js';
import { client as ipfs, spawnEmptyManifest } from '../../src/services/ipfs.js';
import { randomUUID64 } from '../../src/utils.js';
import { createDraftNode, createUsers } from '../util.js';

const communitiesData = [
  {
    name: 'Desci Labs',
    image_url:
      'https://assets-global.website-files.com/634742417f9e1c182c6697d4/634f55796f66af7ee884539f_logo-white.svg',
    description: 'Desci Labs is revolutionalizing the future of scientic publishing.',
    keywords: ['science'],
  },
  {
    name: 'Local Community',
    image_url:
      'https://assets-global.website-files.com/634742417f9e1c182c6697d4/634f55796f66af7ee884539f_logo-white.svg',
    description: 'Local communities matter too.',
    keywords: ['art'],
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
const attestationData2 = [
  {
    name: 'Local Reproducibility',
    description:
      'For research objects that provide the code and data needed to computationally reproduce key figures, tables and results.',
    image_url: 'http://image_pat.png',
  },
  {
    name: 'Local Open Data Access',
    description: 'For research objects that provide the code and data openly',
    image_url: 'http://image_pat.png',
  },
  {
    name: 'Local Fair Metadata',
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

describe('Attestations Service', async () => {
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

  let LocalReproducibilityAttestation: Attestation;
  let LocalOpenDataAttestation: Attestation;
  let LocalFairMetadataAttestation: Attestation;

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
    [LocalReproducibilityAttestation, LocalOpenDataAttestation, LocalFairMetadataAttestation] = await Promise.all(
      attestationData2.map((data) => attestationService.create({ communityId: localCommunity.id as number, ...data })),
    );
    // console.log({ LocalReproducibilityAttestation, LocalOpenDataAttestation, LocalFairMetadataAttestation });

    users = await createUsers(10);
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
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
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
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
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

    let openDataClaim: NodeAttestation;
    let reproducibilityClaim: NodeAttestation;

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
      reproducibilityClaim = Object.assign({}, claim);

      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should not add node to community radar', async () => {
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ communityRadar });
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.undefined;
    });

    it('should add node to community radar if it meets the entry requirements', async () => {
      assert(node.uuid);
      claim = await attestationService.claimAttestation({
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });
      openDataClaim = Object.assign({}, claim);

      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      expect(communityRadar.length).to.be.equal(1);

      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.not.undefined;
      expect(radarNode?.NodeAttestation.length).be.equal(2);
    });

    it('should claim an attestation (API)', async () => {
      // unclaim attestation from last call
      await attestationService.unClaimAttestation(reproducibilityClaim.id);
      await attestationService.unClaimAttestation(openDataClaim.id);

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).post(`/v1/attestations/claim`).set('authorization', authHeaderVal).send({
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
        nodeVersion,
        nodeUuid: node.uuid,
        dpid: '1',
        claimerId: node.ownerId,
      });
      expect(res.status).to.equal(200);
      console.log('CLAIM', claim);
      claim = res.body.data;

      const claimed: NodeAttestation = res.body.data;
      expect(claimed.attestationId).to.equal(reproducibilityAttestation.id);
      expect(claimed.attestationVersionId).to.equal(reproducibilityAttestationVersion.id);
      expect(claimed.claimedById).to.equal(node.ownerId);
      expect(claimed.desciCommunityId).to.equal(desciCommunity.id);
      expect(claimed.nodeDpid10).to.equal('1');
      expect(claimed.nodeVersion).to.equal(nodeVersion);
      expect(claimed.nodeUuid).to.equal(node.uuid);
    });

    it('should unclaim an attestation (API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      console.log('UNCLAIM', claim);
      const res = await request(app).post(`/v1/attestations/unclaim`).set('authorization', authHeaderVal).send({
        claimId: claim.id,
        nodeUuid: node.uuid,
        dpid: '1',
        claimerId: node.ownerId,
      });
      expect(res.status).to.equal(200);
      const attestations = await attestationService.getAllNodeAttestations('1');
      expect(attestations.length).to.equal(0);
    });
  });

  describe('Claiming Desci Community Entry Requirements Attestations', async () => {
    let claim: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
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

      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      // claim all entry requirements
      [claim, openDataAttestationClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });
      // console.log({ claim, openDataAttestationClaim });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should claim all entry requirements to community radar', async () => {
      // check reproducibilityAttestation claim
      expect(claim.attestationId).equal(reproducibilityAttestation.id);
      expect(claim.attestationVersionId).equal(reproducibilityAttestationVersion.id);
      expect(claim.desciCommunityId).equal(desciCommunity.id);
      expect(claim.nodeDpid10).equal('1');
      expect(claim.nodeVersion).equal(0);
      expect(claim.claimedById).equal(author.id);

      // check openDataAttestation claim
      expect(openDataAttestationClaim.attestationId).equal(openDataAttestation.id);
      expect(openDataAttestationClaim.attestationVersionId).equal(openDataAttestationVersion.id);
      expect(openDataAttestationClaim.desciCommunityId).equal(desciCommunity.id);
      expect(openDataAttestationClaim.nodeDpid10).equal('1');
      expect(openDataAttestationClaim.nodeVersion).equal(0);
      expect(openDataAttestationClaim.claimedById).equal(author.id);

      const claims = await attestationService.getNodeCommunityClaims('1', desciCommunity.id);
      // console.log({ claims });
      expect(claims.length).equal(2);
    });

    it('should add node to community radar after claiming all entry requirements', async () => {
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ communityRadar });
      expect(communityRadar.length).to.be.equal(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.not.undefined;
      expect(radarNode?.NodeAttestation.length).be.equal(2);
      // console.log({ radarNode });
      //
      expect(radarNode?.NodeAttestation[0].attestationId).to.be.equal(claim.attestationId);
      expect(radarNode?.NodeAttestation[0].attestationVersionId).to.be.equal(claim.attestationVersionId);
      expect(radarNode?.NodeAttestation[0].desciCommunityId).to.be.equal(claim.desciCommunityId);
      expect(radarNode?.NodeAttestation[0].nodeDpid10).to.be.equal('1');
      expect(radarNode?.NodeAttestation[0].nodeVersion).to.be.equal(nodeVersion);

      expect(radarNode?.NodeAttestation[1].attestationId).to.be.equal(openDataAttestationClaim.attestationId);
      expect(radarNode?.NodeAttestation[1].attestationVersionId).to.be.equal(
        openDataAttestationClaim.attestationVersionId,
      );
      expect(radarNode?.NodeAttestation[1].desciCommunityId).to.be.equal(openDataAttestationClaim.desciCommunityId);
      expect(radarNode?.NodeAttestation[1].nodeDpid10).to.be.equal('1');
      expect(radarNode?.NodeAttestation[1].nodeVersion).to.be.equal(nodeVersion);
    });
  });

  describe('Claiming Desci Community Entry Requirements Attestations(API)', async () => {
    let claim: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
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

      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).post(`/v1/attestations/claimAll`).set('authorization', authHeaderVal).send({
        nodeVersion,
        dpid: '1',
        nodeUuid: node.uuid,
        claimerId: author.id,
        communityId: desciCommunity.id,
      });

      expect(res.status).to.equal(200);
      const claims: NodeAttestation[] = res.body.data;
      [claim, openDataAttestationClaim] = claims;
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should claim all entry requirements to community radar', async () => {
      // check reproducibilityAttestation claim
      expect(claim.attestationId).equal(reproducibilityAttestation.id);
      expect(claim.attestationVersionId).equal(reproducibilityAttestationVersion.id);
      expect(claim.desciCommunityId).equal(desciCommunity.id);
      expect(claim.nodeDpid10).equal('1');
      expect(claim.nodeVersion).equal(0);
      expect(claim.claimedById).equal(author.id);

      // check openDataAttestation claim
      expect(openDataAttestationClaim.attestationId).equal(openDataAttestation.id);
      expect(openDataAttestationClaim.attestationVersionId).equal(openDataAttestationVersion.id);
      expect(openDataAttestationClaim.desciCommunityId).equal(desciCommunity.id);
      expect(openDataAttestationClaim.nodeDpid10).equal('1');
      expect(openDataAttestationClaim.nodeVersion).equal(0);
      expect(openDataAttestationClaim.claimedById).equal(author.id);

      const claims = await attestationService.getNodeCommunityClaims('1', desciCommunity.id);
      expect(claims.length).equal(2);
    });

    it('should add node to community radar after claiming all entry requirements', async () => {
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ communityRadar });
      expect(communityRadar.length).to.be.equal(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.not.undefined;
      expect(radarNode?.NodeAttestation.length).be.equal(2);
      // console.log({ radarNode });
      //
      expect(radarNode?.NodeAttestation[0].attestationId).to.be.equal(claim.attestationId);
      expect(radarNode?.NodeAttestation[0].attestationVersionId).to.be.equal(claim.attestationVersionId);
      expect(radarNode?.NodeAttestation[0].desciCommunityId).to.be.equal(claim.desciCommunityId);
      expect(radarNode?.NodeAttestation[0].nodeDpid10).to.be.equal('1');
      expect(radarNode?.NodeAttestation[0].nodeVersion).to.be.equal(nodeVersion);

      expect(radarNode?.NodeAttestation[1].attestationId).to.be.equal(openDataAttestationClaim.attestationId);
      expect(radarNode?.NodeAttestation[1].attestationVersionId).to.be.equal(
        openDataAttestationClaim.attestationVersionId,
      );
      expect(radarNode?.NodeAttestation[1].desciCommunityId).to.be.equal(openDataAttestationClaim.desciCommunityId);
      expect(radarNode?.NodeAttestation[1].nodeDpid10).to.be.equal('1');
      expect(radarNode?.NodeAttestation[1].nodeVersion).to.be.equal(nodeVersion);
    });

    it('should claim all entry requirements attestations even if some have been claimed before', async () => {
      // unclaim one of the claimed attestations
      await attestationService.unClaimAttestation(claim.id);

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).post(`/v1/attestations/claimAll`).set('authorization', authHeaderVal).send({
        nodeVersion,
        dpid: '1',
        nodeUuid: node.uuid,
        claimerId: author.id,
        communityId: desciCommunity.id,
      });

      expect(res.status).to.equal(200);
      expect(res.body.data.length).to.equal(1);
    });
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
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: attestationVersion.id,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should unclaim an attestation from a node', async () => {
      // check if it's appears in community radar
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ communityRadar });
      expect(communityRadar.length).to.be.equal(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).to.be.not.undefined;
      expect(radarNode?.NodeAttestation.length).be.equal(1);

      // unclaim attestaion
      const unclaimed = await attestationService.unClaimAttestation(claim.id);
      // console.log({ unclaimed });
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
      // console.log({ communityRadar });
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
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
    });

    it('should react to a node attestation', () => {
      expect(reaction.authorId).to.be.equal(users[1].id);
      expect(reaction.nodeAttestationId).to.be.equal(claim.id);
      expect(reaction.reaction).to.be.equal('U+1F42F');
    });

    it('should prevent duplicate reaction', async () => {
      try {
        await attestationService.createReaction({
          claimId: claim.id,
          userId: users[1].id,
          reaction: 'U+1F42F',
        });
      } catch (err) {
        expect(err).to.be.instanceOf(DuplicateReactionError);
      }
    });

    it('should remove reaction to a node attestation', async () => {
      const removedReaction = await attestationService.removeReaction(reaction.id);
      expect(removedReaction).to.not.be.null;
      expect(removedReaction).to.not.be.undefined;
      expect(removedReaction.id).to.equal(reaction.id);
      expect(removedReaction.reaction).to.equal('U+1F42F');

      const voidReaction = await attestationService.getReactions({
        nodeAttestationId: claim.id,
        authorId: users[1].id,
        reaction: 'U+1F42F',
      });
      expect(voidReaction.length).to.be.equal(0);
      expect(voidReaction[0]).to.be.undefined;
    });
  });

  describe('Annotations(Comments)', async () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let comment: Annotation;

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

      comment = await attestationService.createComment({
        claimId: claim.id,
        authorId: users[1].id,
        comment: 'Love the attestation',
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
    });

    it('should add comment to a node attestation', async () => {
      expect(comment.authorId).to.be.equal(users[1].id);
      expect(comment.nodeAttestationId).to.be.equal(claim.id);
      expect(comment.body).to.be.equal('Love the attestation');
    });

    it('should remove comment on a node attestation', async () => {
      const removedComment = await attestationService.removeComment(comment.id);
      expect(removedComment).to.not.be.null;
      expect(removedComment).to.not.be.undefined;
      expect(removedComment.id).to.equal(comment.id);
      expect(removedComment.body).to.equal('Love the attestation');

      const voidComment = await attestationService.getUserClaimComments(claim.id, users[1].id);
      expect(voidComment.length).to.be.equal(0);
      expect(voidComment[0]).to.be.undefined;
    });
  });

  describe('Node Attestation Verification', async () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let verification: NodeAttestationVerification;

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

      verification = await attestationService.verifyClaim(claim.id, users[1].id);
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
    });

    it('should allow users verify a node attestation(claim)', async () => {
      expect(verification.nodeAttestationId).to.be.equal(claim.id);
      expect(verification.userId).to.be.equal(users[1].id);
    });

    it('should prevent double verification of Node Attestation(Claim)', async () => {
      try {
        await attestationService.verifyClaim(claim.id, users[1].id);
      } catch (err) {
        expect(err).to.be.instanceOf(DuplicateVerificationError);
      }
    });

    it('should restrict author from verifying their claim', async () => {
      try {
        assert(author.id === node.ownerId);
        await attestationService.verifyClaim(claim.id, author.id);
      } catch (err) {
        expect(err).to.be.instanceOf(VerificationError);
      }
    });

    it('should remove verification', async () => {
      const removedVerification = await attestationService.removeVerification(verification.id, users[1].id);
      expect(removedVerification).to.not.be.null;
      expect(removedVerification).to.not.be.undefined;
      expect(removedVerification.id).to.equal(verification.id);

      const voidVerification = await attestationService.getUserClaimVerification(claim.id, users[1].id);
      expect(voidVerification).to.be.null;
    });

    it('should allow multiple users verify a node attestation(claim)', async () => {
      const user2Verification = await attestationService.verifyClaim(claim.id, users[2].id);
      expect(user2Verification.nodeAttestationId).to.be.equal(claim.id);
      expect(user2Verification.userId).to.be.equal(users[2].id);

      const user3Verification = await attestationService.verifyClaim(claim.id, users[3].id);
      expect(user3Verification.nodeAttestationId).to.be.equal(claim.id);
      expect(user3Verification.userId).to.be.equal(users[3].id);

      const verifications = await attestationService.getAllClaimVerfications(claim.id);
      expect(verifications.length).to.be.equal(2);

      assert(node.uuid);
      const nodeVerifications = await attestationService.getAllNodeVerfications(node.uuid);
      expect(nodeVerifications.length).to.be.equal(2);
    });
  });

  describe('Radar and Curated Nodes', async () => {
    let claim: NodeAttestation;
    let claim2: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
    let openDataAttestationClaim2: NodeAttestation;
    let node: Node;
    let node2: Node;
    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let author: User;
    let author2: User;

    before(async () => {
      node = nodes[0];
      node2 = nodes[1];
      author = users[0];
      author2 = users[1];
      assert(node.uuid);
      assert(node2.uuid);
      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];

      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      // claim all entry requirements
      [claim, openDataAttestationClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      [claim2, openDataAttestationClaim2] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '2',
        nodeUuid: node2.uuid,
        nodeVersion,
        claimerId: author2.id,
      });
      // console.log({ claim, openDataAttestationClaim });

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[1].id);
      await attestationService.verifyClaim(claim.id, users[2].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[1].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should return curated community nodes', async () => {
      const curatedNodes = await communityService.getCuratedNodes(desciCommunity.id);
      // console.log({ curatedNodes });
      expect(curatedNodes.length).to.be.equal(1);

      const curatedNode = curatedNodes[0];
      expect(curatedNode.NodeAttestation.length).to.be.equal(2);
      expect(curatedNode.nodeDpid10).to.be.equal('1');
      expect(curatedNode.nodeuuid).to.be.equal(node.uuid);
    });

    it('should return community nodes on Radar', async () => {
      const curatedNodes = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ curatedNodes });
      expect(curatedNodes.length).to.be.equal(2);

      const curatedNode = curatedNodes[0];
      expect(curatedNode.NodeAttestation.length).to.be.equal(2);
      expect(curatedNode.nodeDpid10).to.be.equal('1');
      expect(curatedNode.nodeuuid).to.be.equal(node.uuid);

      const curatedNode1 = curatedNodes[1];
      expect(curatedNode1.NodeAttestation.length).to.be.equal(2);
      expect(curatedNode1.nodeDpid10).to.be.equal('2');
      expect(curatedNode1.nodeuuid).to.be.equal(node2.uuid);
    });

    it('should remove node from curated feed if verification requirement is not met', async () => {
      const verifications = await attestationService.getAllClaimVerfications(openDataAttestationClaim.id);
      // console.log({ verifications });
      expect(verifications.length).to.equal(1);
      await attestationService.removeVerification(verifications[0].id, users[1].id);

      const curatedNodes = await communityService.getCuratedNodes(desciCommunity.id);
      // console.log({ curatedNodes });
      expect(curatedNodes.length).to.be.equal(0);

      const radarNodes = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ radarNodes });
      expect(radarNodes.length).to.be.equal(2);
    });
  });

  describe('Community Engagement/Verification Signal', async () => {
    let claim: NodeAttestation;
    let claim2: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
    let openDataAttestationClaim2: NodeAttestation;
    let node: Node;
    let node2: Node;
    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let author: User;
    let author2: User;

    before(async () => {
      node = nodes[0];
      node2 = nodes[1];
      author = users[0];
      author2 = users[1];
      assert(node.uuid);
      assert(node2.uuid);
      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];

      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      // claim all entry requirements
      [claim, openDataAttestationClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      [claim2, openDataAttestationClaim2] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '2',
        nodeUuid: node2.uuid,
        nodeVersion,
        claimerId: author2.id,
      });
      // console.log({ claim, openDataAttestationClaim });

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[1].id);
      await attestationService.verifyClaim(claim.id, users[2].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[1].id);
      await attestationService.createReaction({
        claimId: openDataAttestationClaim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createReaction({
        claimId: claim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createComment({
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createReaction({
        claimId: claim2.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should curate all node impressions across all attestations', async () => {
      const engagements = await communityService.getCommunityEngagementSignals(desciCommunity.id);
      console.log({ engagements });
      expect(engagements.annotations).to.be.equal(2);
      expect(engagements.reactions).to.be.equal(3);
      expect(engagements.verifications).to.be.equal(5);
    });
    it.skip('should list all engaging users and only count users once', () => {});
  });

  describe('Node Attestation (Engagement/Verification Signal/Show)', async () => {
    let claim: NodeAttestation;
    let claim2: NodeAttestation;
    let localClaim: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
    let openDataAttestationClaim2: NodeAttestation;
    let localClaim2: NodeAttestation;
    // let fairMetadataAttestationClaim: NodeAttestation;
    let fairMetadataAttestationClaim2: NodeAttestation;
    let node: Node;
    let node2: Node;
    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let localReproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let fairMetadataAttestationVersion: AttestationVersion;
    let author: User;
    let author2: User;

    before(async () => {
      node = nodes[0];
      node2 = nodes[1];
      author = users[0];
      author2 = users[1];
      assert(node.uuid);
      assert(node2.uuid);
      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];

      versions = await attestationService.getAttestationVersions(LocalReproducibilityAttestation.id);
      localReproducibilityAttestationVersion = versions[versions.length - 1];

      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      // add to local community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: localCommunity.id,
        attestationId: LocalReproducibilityAttestation.id,
        attestationVersion: localReproducibilityAttestationVersion.id,
      });

      // get version for fairMetadata attestations
      versions = await attestationService.getAttestationVersions(fairMetadataAttestation.id);
      fairMetadataAttestationVersion = versions[versions.length - 1];

      // claim all entry requirements
      [claim, openDataAttestationClaim, localClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
          {
            attestationId: LocalReproducibilityAttestation.id,
            attestationVersion: localReproducibilityAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      [claim2, openDataAttestationClaim2, fairMetadataAttestationClaim2, localClaim2] =
        await attestationService.claimAttestations({
          attestations: [
            {
              attestationId: reproducibilityAttestation.id,
              attestationVersion: reproducibilityAttestationVersion.id,
            },
            {
              attestationId: openDataAttestation.id,
              attestationVersion: openDataAttestationVersion.id,
            },
            {
              attestationId: fairMetadataAttestation.id,
              attestationVersion: fairMetadataAttestationVersion.id,
            },
            {
              attestationId: LocalReproducibilityAttestation.id,
              attestationVersion: localReproducibilityAttestationVersion.id,
            },
          ],
          nodeDpid: '2',
          nodeUuid: node2.uuid,
          nodeVersion,
          claimerId: author2.id,
        });
      // console.log({ claim, openDataAttestationClaim });

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[1].id);
      await attestationService.verifyClaim(claim.id, users[2].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[1].id);

      await attestationService.createReaction({
        claimId: openDataAttestationClaim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createReaction({
        claimId: claim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createComment({
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.verifyClaim(fairMetadataAttestationClaim2.id, users[2].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createComment({
        claimId: fairMetadataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createReaction({
        claimId: claim2.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createReaction({
        claimId: fairMetadataAttestationClaim2.id,
        reaction: 'U+1F350',
        userId: users[2].id,
      });

      // engagments for local community
      await attestationService.verifyClaim(localClaim.id, users[1].id);
      await attestationService.createComment({
        claimId: localClaim.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createReaction({
        claimId: localClaim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.verifyClaim(localClaim2.id, users[2].id);
      await attestationService.verifyClaim(localClaim2.id, users[3].id);
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should return all node engagement signal across all attestations in a community', async () => {
      const dPid1Engagements = await communityService.getNodeCommunityEngagementSignals(desciCommunity.id, '1');
      // console.log({ dPid1Engagements });
      expect(dPid1Engagements.annotations).to.equal(1);
      expect(dPid1Engagements.reactions).to.equal(2);
      expect(dPid1Engagements.verifications).to.equal(3);

      const dPid2Engagements = await communityService.getNodeCommunityEngagementSignals(desciCommunity.id, '2');
      // console.log({ dPid2Engagements });
      expect(dPid2Engagements.annotations).to.equal(2);
      expect(dPid2Engagements.reactions).to.equal(2);
      expect(dPid2Engagements.verifications).to.equal(3);
    });

    it('should curate all node engagement across all attestations(claims)', async () => {
      const dPid1Engagements = await attestationService.getNodeEngagementSignals('1');
      // console.log({ dPid1Engagements });
      expect(dPid1Engagements.annotations).to.equal(2);
      expect(dPid1Engagements.reactions).to.equal(3);
      expect(dPid1Engagements.verifications).to.equal(4);

      const dPid2Engagements = await attestationService.getNodeEngagementSignals('2');
      // console.log({ dPid2Engagements });
      expect(dPid2Engagements.annotations).to.equal(2);
      expect(dPid2Engagements.reactions).to.equal(2);
      expect(dPid2Engagements.verifications).to.equal(5);
    });

    it('should curate all node community verification signal across all attestations(claims)', async () => {
      const dPid1Engagements = await attestationService.getNodeCommunityVerificationSignals(desciCommunity.id, '1');
      const dPid1LocalEngagements = await attestationService.getNodeCommunityVerificationSignals(
        localCommunity.id,
        '1',
      );
      // console.log({ dPid1Engagements });
      // console.log({ dPid1LocalEngagements });
      expect(dPid1Engagements.verifications).to.equal(3);
      expect(dPid1LocalEngagements.verifications).to.equal(1);

      const dPid2Engagements = await attestationService.getNodeCommunityVerificationSignals(desciCommunity.id, '2');
      const dPid2LocalEngagements = await attestationService.getNodeCommunityVerificationSignals(
        localCommunity.id,
        '2',
      );
      // console.log({ dPid2Engagements });
      // console.log({ dPid2LocalEngagements });
      expect(dPid2Engagements.verifications).to.equal(2);
      expect(dPid2LocalEngagements.verifications).to.equal(2);
    });

    it('should validate all attestations engagement signals', async () => {
      const reproducibilityAttestationEngagements = await attestationService.getAttestationVersionEngagementSignals(
        reproducibilityAttestation.id,
        reproducibilityAttestationVersion.id,
      );
      // console.log({ reproducibilityAttestationEngagements });
      expect(reproducibilityAttestationEngagements.annotations).to.equal(0);
      expect(reproducibilityAttestationEngagements.reactions).to.equal(2);
      expect(reproducibilityAttestationEngagements.verifications).to.equal(4);

      const openDataAttestationEngagements = await attestationService.getAttestationVersionEngagementSignals(
        openDataAttestation.id,
        openDataAttestationVersion.id,
      );
      // console.log({ openDataAttestationEngagements });
      expect(openDataAttestationEngagements.annotations).to.equal(2);
      expect(openDataAttestationEngagements.reactions).to.equal(1);
      expect(openDataAttestationEngagements.verifications).to.equal(1);

      const fairMetadataAttestationEngagements = await attestationService.getAttestationVersionEngagementSignals(
        fairMetadataAttestation.id,
        fairMetadataAttestationVersion.id,
      );
      // console.log({ fairMetadataAttestationEngagements });
      expect(fairMetadataAttestationEngagements.annotations).to.equal(1);
      expect(fairMetadataAttestationEngagements.reactions).to.equal(1);
      expect(fairMetadataAttestationEngagements.verifications).to.equal(1);

      const LocalReproducibilityAttestationEngagements =
        await attestationService.getAttestationVersionEngagementSignals(
          LocalReproducibilityAttestation.id,
          localReproducibilityAttestationVersion.id,
        );
      // console.log({ LocalReproducibilityAttestationEngagements });
      expect(LocalReproducibilityAttestationEngagements.annotations).to.equal(1);
      expect(LocalReproducibilityAttestationEngagements.reactions).to.equal(1);
      expect(LocalReproducibilityAttestationEngagements.verifications).to.equal(3);
    });

    // TESTS FOR showNodeAttestations api
    it('should show DPID 1 node attestations(API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).get(`/v1/attestations/${1}`).set('authorization', authHeaderVal);
      const attestations: NodeAttestationFragment[] = res.body.data;
      console.log(attestations);
      expect(attestations.length).to.be.equal(3);
    });

    // TESTS FOR showNodeAttestations api
    it('should show DPID 2 node attestations(API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).get(`/v1/attestations/${2}`).set('authorization', authHeaderVal);
      const attestations: NodeAttestationFragment[] = res.body.data;
      expect(attestations.length).to.be.equal(4);
    });

    it.skip('should list all engaging users and only count users once', () => {});
  });

  describe('Community Radar', async () => {
    let node: Node;
    let node2: Node;
    let node3: Node;
    let author: User;
    let author2: User;
    let author3: User;

    let claim: NodeAttestation;
    let claim2: NodeAttestation;
    let claim3: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
    let openDataAttestationClaim2: NodeAttestation;
    let openDataAttestationClaim3: NodeAttestation;
    let fairMetadataAttestationClaim: NodeAttestation;

    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let fairMetadataAttestationVersion: AttestationVersion;

    let res: request.Response;
    let apiResponse: NodeRadar[];

    before(async () => {
      node = nodes[0];
      node2 = nodes[1];
      node3 = nodes[2];

      author = users[0];
      author2 = users[1];
      author3 = users[2];
      assert(node.uuid);
      assert(node2.uuid);
      assert(node3.uuid);

      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];
      // add to community entry
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      // get version for fairMetadata attestations
      versions = await attestationService.getAttestationVersions(fairMetadataAttestation.id);
      fairMetadataAttestationVersion = versions[versions.length - 1];

      // claim all entry requirements
      [claim, openDataAttestationClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      // claim all entry requirements for node 2
      [claim2, openDataAttestationClaim2] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '2',
        nodeUuid: node2.uuid,
        nodeVersion,
        claimerId: author2.id,
      });

      // claim all entry requirements for node 3
      [claim3, openDataAttestationClaim3] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '3',
        nodeUuid: node3.uuid,
        nodeVersion,
        claimerId: author3.id,
      });

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[3].id);
      await attestationService.verifyClaim(claim.id, users[4].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[4].id);

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[4].id);
      await attestationService.verifyClaim(claim2.id, users[5].id);

      // verifications for claim 3
      await attestationService.verifyClaim(claim3.id, users[6].id);
      await attestationService.verifyClaim(openDataAttestationClaim3.id, users[5].id);
      await attestationService.verifyClaim(openDataAttestationClaim3.id, users[4].id);

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      res = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/radar`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);

      apiResponse = res.body.data;
      console.log(apiResponse[0]);
      console.log(apiResponse[1]);
      console.log(apiResponse[2]);
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should return nodes in radar in ASC order of verified engagements', async () => {
      expect(res.status).to.equal(200);
      expect(apiResponse.length).to.equal(3);
      expect(apiResponse[0].nodeDpid10).to.be.equal('2');
      expect(apiResponse[1].nodeDpid10).to.be.equal('1');
      expect(apiResponse[2].nodeDpid10).to.be.equal('3');
    });
  });

  describe('Attestation Recommendations', async () => {
    let claim: NodeAttestation;
    let claim2: NodeAttestation;
    let localClaim: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
    let openDataAttestationClaim2: NodeAttestation;
    let localClaim2: NodeAttestation;
    // let fairMetadataAttestationClaim: NodeAttestation;
    let fairMetadataAttestationClaim2: NodeAttestation;
    let node: Node;
    let node2: Node;
    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let localReproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let fairMetadataAttestationVersion: AttestationVersion;
    let author: User;
    let author2: User;

    let res: request.Response;
    let allResponse: AllAttestation[];
    let communityResponse: CommunityAttestation[];

    before(async () => {
      node = nodes[0];
      node2 = nodes[1];
      author = users[0];
      author2 = users[1];
      assert(node.uuid);
      assert(node2.uuid);
      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];

      versions = await attestationService.getAttestationVersions(LocalReproducibilityAttestation.id);
      localReproducibilityAttestationVersion = versions[versions.length - 1];

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];

      // get version for fairMetadata attestations
      versions = await attestationService.getAttestationVersions(fairMetadataAttestation.id);
      fairMetadataAttestationVersion = versions[versions.length - 1];

      // claim all entry requirements
      [claim, openDataAttestationClaim, localClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
          {
            attestationId: LocalReproducibilityAttestation.id,
            attestationVersion: localReproducibilityAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      [claim2, openDataAttestationClaim2, fairMetadataAttestationClaim2, localClaim2] =
        await attestationService.claimAttestations({
          attestations: [
            {
              attestationId: reproducibilityAttestation.id,
              attestationVersion: reproducibilityAttestationVersion.id,
            },
            {
              attestationId: openDataAttestation.id,
              attestationVersion: openDataAttestationVersion.id,
            },
            {
              attestationId: fairMetadataAttestation.id,
              attestationVersion: fairMetadataAttestationVersion.id,
            },
            {
              attestationId: LocalReproducibilityAttestation.id,
              attestationVersion: localReproducibilityAttestationVersion.id,
            },
          ],
          nodeDpid: '2',
          nodeUuid: node2.uuid,
          nodeVersion,
          claimerId: author2.id,
        });
      // console.log({ claim, openDataAttestationClaim });

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[1].id);
      await attestationService.verifyClaim(claim.id, users[2].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[1].id);

      await attestationService.createReaction({
        claimId: openDataAttestationClaim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createReaction({
        claimId: claim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createComment({
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.verifyClaim(fairMetadataAttestationClaim2.id, users[2].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createComment({
        claimId: fairMetadataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createReaction({
        claimId: claim2.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.createReaction({
        claimId: fairMetadataAttestationClaim2.id,
        reaction: 'U+1F350',
        userId: users[2].id,
      });

      // engagments for local community
      await attestationService.verifyClaim(localClaim.id, users[1].id);
      await attestationService.createComment({
        claimId: localClaim.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
      await attestationService.createReaction({
        claimId: localClaim.id,
        reaction: 'U+1F350',
        userId: users[1].id,
      });
      await attestationService.verifyClaim(localClaim2.id, users[2].id);
      await attestationService.verifyClaim(localClaim2.id, users[3].id);

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;

      // const Recommendations = await request(app)
      //   .get(`/v1/attestations/recommendations`)
      //   .set('authorization', authHeaderVal);
      // console.log('Recommendations', Recommendations.status, Recommendations.body, Recommendations.body.data);

      const allRes = await request(app).get(`/v1/attestations/suggestions/all`).set('authorization', authHeaderVal);
      allResponse = allRes.body.data;
      console.log({ allResponse });

      res = await request(app)
        .get(`/v1/communities/${desciCommunity.slug}/attestations`)
        .set('authorization', authHeaderVal);
      communityResponse = res.body.data;
      console.log({ communityResponse });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it.skip('should list all attestation Recommendations', async () => {
      const rawListAll = await attestationService.listAll();
      console.log({ rawListAll: rawListAll.length });

      expect(res.status).to.equal(200);
      expect(allResponse.length).to.equal(6);
      const desciAttestations = allResponse.filter((att) => att.communityId === desciCommunity.id);
      const desciEngagements = desciAttestations.reduce(
        (total, att) => total + att.annotations + att.reactions + att.verifications,
        0,
      );
      expect(desciAttestations.length).to.equal(3);
      expect(desciEngagements).to.equal(13);

      const localAttestations = allResponse.filter((att) => att.communityId === localCommunity.id);
      const localEngagements = localAttestations.reduce(
        (total, att) => total + att.annotations + att.reactions + att.verifications,
        0,
      );
      expect(localAttestations.length).to.equal(3);
      expect(localEngagements).to.equal(5);
    });

    it.skip('should list all community attestations Recommendations', async () => {
      communityResponse = res.body.data;
      expect(res.status).to.equal(200);
      expect(communityResponse.length).to.equal(3);

      const desciAttestations = communityResponse.filter((att) => att.communityId === desciCommunity.id);
      const desciEngagements = desciAttestations.reduce(
        (total, att) => total + att.annotations + att.reactions + att.verifications,
        0,
      );

      expect(desciAttestations.length).to.equal(3);
      expect(desciEngagements).to.equal(13);
    });
  });

  describe.only('Revoking NodeAttestation(Claims)', async () => {
    let claim: NodeAttestation;
    let claim2: NodeAttestation;
    let openDataAttestationClaim: NodeAttestation;
    let openDataAttestationClaim2: NodeAttestation;
    let node: Node;
    let node2: Node;
    const nodeVersion = 0;
    let reproducibilityAttestationVersion: AttestationVersion;
    let openDataAttestationVersion: AttestationVersion;
    let author: User;
    let author2: User;
    let authHeaderVal;

    type NodeClaim = NodeAttestation &
      Omit<NodeRadarItem, 'NodeAttestation'> & {
        engagements: Engagement;
        attestationVersion: {
          name: string;
          description: string;
          image_url: string;
        };
        community: DesciCommunity;
        selfAssigned: boolean;
      };

    before(async () => {
      node = nodes[0];
      node2 = nodes[1];
      author = users[0];
      author2 = users[1];
      assert(node.uuid);
      assert(node2.uuid);

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      authHeaderVal = `Bearer ${JwtToken}`;

      let versions = await attestationService.getAttestationVersions(reproducibilityAttestation.id);
      reproducibilityAttestationVersion = versions[versions.length - 1];

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

      // claim all entry requirements
      [claim, openDataAttestationClaim] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      [claim2, openDataAttestationClaim2] = await attestationService.claimAttestations({
        attestations: [
          {
            attestationId: reproducibilityAttestation.id,
            attestationVersion: reproducibilityAttestationVersion.id,
          },
          {
            attestationId: openDataAttestation.id,
            attestationVersion: openDataAttestationVersion.id,
          },
        ],
        nodeDpid: '2',
        nodeUuid: node2.uuid,
        nodeVersion,
        claimerId: author2.id,
      });

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[1].id);
      await attestationService.verifyClaim(claim.id, users[2].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[1].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.createComment({
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    });

    it('should revoke node attestation', async () => {
      const res = await request(app).post(`/v1/attestations/unclaim`).set('authorization', authHeaderVal).send({
        dpid: '1',
        nodeUuid: node.uuid,
        claimId: claim.id,
      });
      expect(res.status).to.equal(200);

      const claims = await attestationService.getAllNodeAttestations('1');
      expect(claims.length).to.equal(2);
    });

    it('should remove revoked claim engagements from node and community engagement signals', async () => {});

    it('should remove node from radar and curated if an entry attestation claim is revoked', async () => {
      const res1 = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/radar`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);
      const radar = res1.body.data as NodeRadar[];
      expect(res1.status).to.equal(200);
      expect(radar.length).to.equal(1);
      const radarNode = radar[0];
      expect(radarNode.nodeDpid10).to.be.equal('2');
      expect(radarNode.nodeuuid).to.be.equal(node2.uuid);

      const res = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/feed`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);

      const curatedNodes = res.body.data as NodeRadar[];
      expect(res.status).to.equal(200);
      expect(curatedNodes.length).to.equal(0);
    });

    it('should reclaim node attestation', async () => {
      let res = await request(app).post(`/v1/attestations/claim`).set('authorization', authHeaderVal).send({
        dpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
        attestationId: reproducibilityAttestation.id,
      });
      expect(res.status).to.equal(200);

      const attestations = await attestationService.getAllNodeAttestations('1');
      expect(attestations.length).to.equal(2);

      res = await request(app).get(`/v1/attestations/${1}`).set('authorization', authHeaderVal);
      const claims = res.body.data as NodeClaim[];
      const revoked = claims.find((c) => c.id === claim.id);
      expect(revoked?.revoked).to.be.false;
      expect(revoked?.revokedAt).to.be.null;
    });
  });
});
