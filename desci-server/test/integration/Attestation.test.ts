import 'dotenv/config';
import 'mocha';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import {
  Annotation,
  AnnotationType,
  Attestation,
  AttestationVersion,
  CommentVote,
  CommunityMember,
  CommunityMembershipRole,
  DesciCommunity,
  Node,
  NodeAttestation,
  NodeAttestationReaction,
  NodeAttestationVerification,
  NodeVersion,
  Prisma,
  User,
  VoteType,
} from '@prisma/client';
import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../src/client.js';
import { NodeAttestationFragment } from '../../src/controllers/attestations/show.js';
import { Engagement, NodeRadar, NodeRadarEntry, NodeRadarItem } from '../../src/controllers/communities/types.js';
import { ForbiddenError } from '../../src/core/ApiError.js';
import {
  DuplicateReactionError,
  DuplicateVerificationError,
  VerificationError,
} from '../../src/core/communities/error.js';
import { app } from '../../src/index.js';
import { AllAttestation, attestationService, CommunityAttestation } from '../../src/services/Attestation.js';
import { communityService } from '../../src/services/Communities.js';
import { client as ipfs, spawnEmptyManifest } from '../../src/services/ipfs.js';
import { randomUUID64 } from '../../src/utils.js';
import { createDraftNode, createUsers } from '../util.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

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

const protectedAttestations = [
  {
    name: 'Open Code',
    description:
      'Digitally-shareable code is available in this research object.\n\nThe code must be provided in a format that is time-stamped, immutable, and permanent. It must also have associated persistent identifiers.\n\nBy publishing your code with default licensing via DeSci Nodes, you automatically satisfy this requirement.\n\nThe code has an open license allowing others to copy, distribute, and make use of the code while allowing the licensor to retain credit and copyright as applicable.\n\nSufficient explanation is present for an independent researcher to understand how the code is used and relates to the reported methodology, including information about versions of software, systems, and packages.',
    image_url: 'https://pub.desci.com/ipfs/bafkreicwcj7drcyvkhvlva53qbjcrqbh6kuyr6zjdxb5sc4ehe7hxb43qu',
    protected: true,
  },
  {
    name: 'Open Data',
    description:
      'Digitally-shareable data are publicly available on an open-access repository. The data must have a **persistent identifier and be provided in a format that is time-stamped, immutable, and permanent** (e.g., university repository, a registration on the [Open Science Framework](http://osf.io/), or an independent repository at [www.re3data.org](http://www.re3data.org/)). By publishing your data via DeSci Nodes, you automatically satisfy this requirement.\n\nA data dictionary (for example, a codebook or metadata describing the data) is included with sufficient description for an independent researcher to reproduce the reported analyses and results. Data from the same project that are not needed to reproduce the reported results can be kept private without losing eligibility for the Open Data Badge.\n\nAn open license allowing others to copy, distribute, and make use of the data while allowing the licensor to retain credit and copyright as applicable. Creative Commons has defined several licenses for this purpose, which are described at [www.creativecommons.org/licenses](http://creativecommons.org/licenses). CC0 or CC-BY is strongly recommended.',
    image_url: 'https://pub.desci.com/ipfs/bafkreia5ajqjlrhydhvwrwipfnpxl4otvr6777r3xm37fq2thh6l6ds7wq',
    protected: true,
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
  let desciCommunityMembers: CommunityMember[];
  let localCommunity: DesciCommunity;
  let reproducibilityAttestation: Attestation;
  let openDataAttestation: Attestation;
  let fairMetadataAttestation: Attestation;

  let LocalReproducibilityAttestation: Attestation;
  let LocalOpenDataAttestation: Attestation;
  let LocalFairMetadataAttestation: Attestation;

  // protected attestation declaration
  let protectedOpenData: Attestation;
  let protectedOpenCode: Attestation;

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

    [protectedOpenCode, protectedOpenData] = await Promise.all(
      protectedAttestations.map((data) =>
        attestationService.create({ communityId: desciCommunity.id as number, ...data }),
      ),
    );

    users = await createUsers(10);

    // add Members to open
    const mock_users = users.slice(8);
    desciCommunityMembers = await Promise.all(
      mock_users.map((user) =>
        communityService.addCommunityMember(desciCommunity.id, {
          userId: user.id,
          role: CommunityMembershipRole.MEMBER,
          communityId: desciCommunity.id,
        }),
      ),
    );

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

    let nodeVersion2: NodeVersion, UserJwtToken: string, UserAuthHeaderVal: string;

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
      // trigger update radar entry
      await communityService.addToRadar(desciCommunity.id, node.uuid);

      // publish new node version
      nodeVersion2 = await prisma.nodeVersion.create({
        data: { nodeId: node.id, manifestUrl: node.manifestUrl, transactionId: randomUUID64() },
      });

      UserJwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      UserAuthHeaderVal = `Bearer ${UserJwtToken}`;
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;

      // clean up (delete new node version entry)
      await prisma.nodeVersion.delete({ where: { id: nodeVersion2.id } });
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

    it('should prevent double claim on new version if old claim is not revoked', async () => {
      assert(node.uuid);

      // create request to claim node on new version using both claim and claimAll apis
      let res = await request(app).post(`/v1/attestations/claim`).set('authorization', UserAuthHeaderVal).send({
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion: 1,
        claimerId: author.id,
        attestationId: reproducibilityAttestation.id,
      });
      expect(res.status).to.equal(200);

      res = await request(app).post(`/v1/attestations/claimAll`).set('authorization', UserAuthHeaderVal).send({
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion: 1,
        claimerId: author.id,
        communityId: reproducibilityAttestation.communityId,
      });
      expect(res.status).to.equal(200);

      // verify only one claim exists on the old version of the node
      const attestations = await attestationService.getAllNodeAttestations(node.uuid);
      expect(attestations.length).to.equal(2);
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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
        nodeDpid: '1',
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
        // claimerId: node.ownerId,
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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).post(`/v1/attestations/claimAll`).set('authorization', authHeaderVal).send({
        nodeVersion,
        nodeDpid: '1',
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
        nodeDpid: '1',
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
        required: true,
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

    let author1: User;
    let reply: Annotation;

    before(async () => {
      node = nodes[0];
      author = users[0];
      author1 = users[1];

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
        links: [],
        claimId: claim.id,
        authorId: users[1].id,
        comment: 'Love the attestation',
        visible: true,
        uuid: nodes[1].uuid ?? '',
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

    it('should edit a comment', async () => {
      comment = await attestationService.createComment({
        links: [],
        claimId: claim.id,
        authorId: users[1].id,
        comment: 'Old comment to be edited',
        visible: true,
        uuid: nodes[1].uuid ?? '',
      });

      const editedComment = await attestationService.editComment({
        update: { body: 'edited comment', links: ['https://google.com'] },
        authorId: users[1].id,
        id: comment.id,
      });
      expect(editedComment.body).to.be.equal('edited comment');
      expect(editedComment.links[0]).to.be.equal('https://google.com');
    });

    it('should not allow another author to edit a comment', async () => {
      try {
        await attestationService.editComment({
          update: { body: 'edited comment', links: ['https://google.com'] },
          authorId: users[2].id,
          id: comment.id,
        });
      } catch (error) {
        expect(error).to.be.instanceOf(ForbiddenError);
      }
    });

    it('should edit a comment(via api)', async () => {
      const commenterJwtToken = jwt.sign({ email: users[1].email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      console.log('edit comment', nodes[1], comment);
      const res = await request(app)
        .put(`/v1/nodes/${nodes[1].uuid}/comments/${comment.id}`)
        .set('authorization', commenterJwtHeader)
        .send({ body: 'edit comment via api', links: ['https://desci.com'] });
      console.log('response', res.body);
      expect(res.statusCode).to.equal(200);
      const editedComment = (await res.body.data) as Annotation;

      expect(editedComment.body).to.be.equal('edit comment via api');
      expect(editedComment.links[0]).to.be.equal('https://desci.com');
    });

    it('should reply a comment', async () => {
      comment = await attestationService.createComment({
        links: [],
        claimId: claim.id,
        authorId: users[1].id,
        comment: 'Old comment to be edited',
        visible: true,
      });

      const reply = await attestationService.createComment({
        authorId: users[2].id,
        replyTo: comment.id,
        links: [],
        claimId: claim.id,
        comment: 'Reply to Old comment to be edited',
        visible: true,
      });
      expect(reply.body).to.be.equal('Reply to Old comment to be edited');
      expect(reply.replyToId).to.be.equal(comment.id);
    });

    // should post comments and reply, should validate comments length,  getComments Api, replyCount and pull reply via api
    it('should create and reply a comment', async () => {
      const authorJwtToken = jwt.sign({ email: author.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const authorJwtHeader = `Bearer ${authorJwtToken}`;

      // send create a comment request
      let res = await request(app).post(`/v1/attestations/comments`).set('authorization', authorJwtHeader).send({
        authorId: author.id,
        body: 'post comment with reply',
        links: [],
        uuid: node.uuid,
        visible: true,
      });
      expect(res.statusCode).to.equal(200);
      console.log('comment', res.body.data);
      comment = res.body.data as Annotation;
      expect(comment.body).to.equal('post comment with reply');

      const author1JwtToken = jwt.sign({ email: author1.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const author1JwtHeader = `Bearer ${author1JwtToken}`;
      // send reply to a comment request
      res = await request(app).post(`/v1/attestations/comments`).set('authorization', author1JwtHeader).send({
        authorId: author1.id,
        body: 'reply to post comment with reply',
        links: [],
        uuid: node.uuid,
        visible: true,
        replyTo: comment.id,
      });
      reply = res.body.data as Annotation;

      expect(res.statusCode).to.equal(200);
      expect(reply.replyToId).to.equal(comment.id);

      // check comment
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', authorJwtHeader).send();
      expect(res.statusCode).to.equal(200);
      expect(res.body.data.count).to.be.equal(1);
      const data = (await res.body.data.comments) as (Annotation & {
        meta: {
          upvotes: number;
          downvotes: number;
          replyCount: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
      })[];
      console.log('commentsss', data);
      const parentComment = data.find((c) => c.id === comment.id);
      expect(parentComment?.meta.replyCount).to.be.equal(1);
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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
        links: [],
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
        visible: true,
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.createComment({
        links: [],
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
        links: [],
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
        visible: true,
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.createComment({
        links: [],
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
        communityId: desciCommunity.id,
        attestationId: openDataAttestation.id,
        attestationVersion: openDataAttestationVersion.id,
      });

      // add to local community entry
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
        links: [],
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
        visible: true,
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.verifyClaim(fairMetadataAttestationClaim2.id, users[2].id);
      await attestationService.createComment({
        links: [],
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
      });
      await attestationService.createComment({
        links: [],
        claimId: fairMetadataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
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
        links: [],
        claimId: localClaim.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
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
      const res = await request(app).get(`/v1/attestations/${node.uuid}`).set('authorization', authHeaderVal);
      const attestations: NodeAttestationFragment[] = res.body.data;
      console.log(attestations);
      expect(attestations.length).to.be.equal(3);
    });

    // TESTS FOR showNodeAttestations api
    it('should show DPID 2 node attestations(API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).get(`/v1/attestations/${node2.uuid}`).set('authorization', authHeaderVal);
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
    let apiResponse: NodeRadarEntry[];

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
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
      // trigger update radar entry
      await communityService.addToRadar(desciCommunity.id, node.uuid);

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
      // trigger update radar entry
      await communityService.addToRadar(desciCommunity.id, node2.uuid);

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
      // trigger update radar entry
      await communityService.addToRadar(desciCommunity.id, node3.uuid);

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

      apiResponse = res.body.data.data;
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

    it('should return nodes in radar in ASC order of verified engagements sorted by last submission/claim date', async () => {
      expect(res.status).to.equal(200);
      expect(apiResponse.length).to.equal(3);
      expect(apiResponse[0].nodeUuid).to.be.equal(node2.uuid);
      expect(apiResponse[1].nodeUuid).to.be.equal(node3.uuid);
      expect(apiResponse[2].nodeUuid).to.be.equal(node.uuid);
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
        links: [],
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
        visible: true,
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.verifyClaim(fairMetadataAttestationClaim2.id, users[2].id);
      await attestationService.createComment({
        links: [],
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
      });
      await attestationService.createComment({
        links: [],
        claimId: fairMetadataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
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
        links: [],
        claimId: localClaim.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
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

  describe('Revoking NodeAttestation(Claims)', async () => {
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
      await attestationService.addCommunityEntryAttestation({
        required: true,
        communityId: desciCommunity.id,
        attestationId: reproducibilityAttestation.id,
        attestationVersion: reproducibilityAttestationVersion.id,
      });

      versions = await attestationService.getAttestationVersions(openDataAttestation.id);
      openDataAttestationVersion = versions[versions.length - 1];
      await attestationService.addCommunityEntryAttestation({
        required: true,
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
      // trigger update radar entry
      await communityService.addToRadar(desciCommunity.id, node.uuid);

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
      // trigger update radar entry
      await communityService.addToRadar(desciCommunity.id, node2.uuid);

      // verify both claims for node 1
      await attestationService.verifyClaim(claim.id, users[1].id);
      await attestationService.verifyClaim(claim.id, users[2].id);
      await attestationService.verifyClaim(openDataAttestationClaim.id, users[1].id);
      await attestationService.createComment({
        links: [],
        claimId: openDataAttestationClaim.id,
        authorId: users[2].id,
        comment: 'I love this game',
        visible: true,
      });

      // verify one claims for node 2 attestations
      await attestationService.verifyClaim(claim2.id, users[3].id);
      await attestationService.verifyClaim(claim2.id, users[2].id);
      await attestationService.createComment({
        links: [],
        claimId: openDataAttestationClaim2.id,
        authorId: users[3].id,
        comment: 'I love this guy',
        visible: true,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should revoke node attestation', async () => {
      const res = await request(app).post(`/v1/attestations/unclaim`).set('authorization', authHeaderVal).send({
        dpid: '1',
        nodeUuid: node.uuid,
        claimId: claim.id,
      });
      expect(res.status).to.equal(200);

      const claims = await attestationService.getAllNodeAttestations(node.uuid!);
      expect(claims.length).to.equal(1);
    });

    it('should remove revoked claim engagements from node and community engagement signals', async () => {
      const engagmentSignal = await attestationService.getNodeEngagementSignals('1');
      expect(engagmentSignal.verifications).to.equal(1);
      expect(engagmentSignal.annotations).to.equal(1);
      expect(engagmentSignal.reactions).to.equal(0);

      const communityEngagementSignal = await communityService.getCommunityEngagementSignals(desciCommunity.id);
      expect(communityEngagementSignal.verifications).to.equal(3);
      expect(communityEngagementSignal.annotations).to.equal(2);
      expect(communityEngagementSignal.reactions).to.equal(0);
    });

    it('should remove node from radar and curated if claim is revoked', async () => {
      const res1 = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/radar`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);
      console.log('radar', res1.body);
      const radar = res1.body.data.data as NodeRadarEntry[];
      expect(res1.status).to.equal(200);
      expect(radar.length).to.equal(1);
      const radarNode = radar[0];
      // expect(radarNode.nodeDpid10).to.be.equal('2');
      expect(radarNode.nodeUuid).to.be.equal(node2.uuid);

      const res = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/feed`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);

      console.log('feed', res.body);
      const curatedNodes = res.body.data.data as NodeRadarEntry[];
      expect(res.status).to.equal(200);
      expect(curatedNodes.length).to.equal(0);
    });

    it('should reclaim node attestation', async () => {
      let res = await request(app).post(`/v1/attestations/claim`).set('authorization', authHeaderVal).send({
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
        attestationId: reproducibilityAttestation.id,
      });
      expect(res.status).to.equal(200);

      const attestations = await attestationService.getAllNodeAttestations(node.uuid!);
      expect(attestations.length).to.equal(2);

      res = await request(app).get(`/v1/attestations/${node.uuid}`).set('authorization', authHeaderVal);
      const claims = res.body.data as NodeClaim[];
      const revoked = claims.find((c) => c.id === claim.id);
      expect(revoked?.revoked).to.be.false;
      // expect(revoked?.revokedAt).to.be.undefined;
    });
  });

  describe('Protected Attestation Verification', async () => {
    let openCodeClaim: NodeAttestation;
    let openDataClaim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let verification: NodeAttestationVerification;
    let members: (CommunityMember & {
      user: User;
    })[];
    let UserJwtToken: string,
      UserAuthHeaderVal: string,
      MemberJwtToken1: string,
      MemberJwtToken2: string,
      memberAuthHeaderVal1: string,
      memberAuthHeaderVal2: string;

    before(async () => {
      node = nodes[0];
      author = users[0];
      assert(node.uuid);
      const versions = await attestationService.getAttestationVersions(protectedOpenCode.id);
      attestationVersion = versions[versions.length - 1];
      openCodeClaim = await attestationService.claimAttestation({
        attestationId: protectedOpenCode.id,
        attestationVersion: attestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      members = await communityService.getAllMembers(desciCommunity.id);
      MemberJwtToken1 = jwt.sign({ email: members[0].user.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      memberAuthHeaderVal1 = `Bearer ${MemberJwtToken1}`;

      MemberJwtToken2 = jwt.sign({ email: members[1].user.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      memberAuthHeaderVal2 = `Bearer ${MemberJwtToken2}`;

      UserJwtToken = jwt.sign({ email: users[1].email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      UserAuthHeaderVal = `Bearer ${UserJwtToken}`;
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      // await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    });

    it('should allow only members verify a node attestation(claim)', async () => {
      let res = await request(app)
        .post(`/v1/attestations/verification`)
        .set('authorization', memberAuthHeaderVal1)
        .send({
          claimId: openCodeClaim.id,
        });
      expect(res.statusCode).to.equal(200);

      res = await request(app).post(`/v1/attestations/verification`).set('authorization', memberAuthHeaderVal2).send({
        claimId: openCodeClaim.id,
      });
      expect(res.statusCode).to.equal(200);

      const verifications = await attestationService.getAllClaimVerfications(openCodeClaim.id);
      expect(verifications.length).to.equal(2);
      expect(verifications.some((v) => v.userId === members[0].userId)).to.equal(true);
      expect(verifications.some((v) => v.userId === members[1].userId)).to.equal(true);
    });

    it('should prevent non-authorized users from verifying a protected attestation(claim)', async () => {
      const userVerificationResponse = await request(app)
        .post(`/v1/attestations/verification`)
        .set('authorization', UserAuthHeaderVal)
        .send({
          claimId: openCodeClaim.id,
        });
      expect(userVerificationResponse.statusCode).to.equal(401);

      const verifications = await attestationService.getAllClaimVerfications(openCodeClaim.id);
      expect(verifications.length).to.equal(2);
      expect(verifications.some((v) => v.userId === members[0].userId)).to.equal(true);
      expect(verifications.some((v) => v.userId === members[1].userId)).to.equal(true);
    });
  });

  describe('Protected Attestation Review', async () => {
    let openCodeClaim: NodeAttestation;
    let openDataClaim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let members: (CommunityMember & {
      user: User;
    })[];
    let UserJwtToken: string,
      UserAuthHeaderVal: string,
      MemberJwtToken1: string,
      MemberJwtToken2: string,
      memberAuthHeaderVal1: string,
      memberAuthHeaderVal2: string;

    before(async () => {
      node = nodes[0];
      author = users[0];
      assert(node.uuid);
      const versions = await attestationService.getAttestationVersions(protectedOpenCode.id);
      attestationVersion = versions[versions.length - 1];
      openCodeClaim = await attestationService.claimAttestation({
        attestationId: protectedOpenCode.id,
        attestationVersion: attestationVersion.id,
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
      });

      members = await communityService.getAllMembers(desciCommunity.id);
      MemberJwtToken1 = jwt.sign({ email: members[0].user.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      memberAuthHeaderVal1 = `Bearer ${MemberJwtToken1}`;

      MemberJwtToken2 = jwt.sign({ email: members[1].user.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      memberAuthHeaderVal2 = `Bearer ${MemberJwtToken2}`;

      UserJwtToken = jwt.sign({ email: users[1].email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      UserAuthHeaderVal = `Bearer ${UserJwtToken}`;
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      // await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    });

    it('should allow only community members review/comment a claimed attestation', async () => {
      let body = {
        authorId: members[0].userId,
        claimId: openCodeClaim.id,
        body: 'review 1',
        uuid: openCodeClaim.nodeUuid,
      };
      let res = await request(app)
        .post(`/v1/attestations/comments`)
        .set('authorization', memberAuthHeaderVal1)
        .send(body);
      expect(res.statusCode).to.equal(200);

      body = {
        authorId: members[1].userId,
        claimId: openCodeClaim.id,
        body: 'review 2',
        uuid: openCodeClaim.nodeUuid,
      };
      res = await request(app).post(`/v1/attestations/comments`).set('authorization', memberAuthHeaderVal2).send(body);
      expect(res.statusCode).to.equal(200);

      const comments = await attestationService.getAllClaimComments({ nodeAttestationId: openCodeClaim.id });
      expect(comments.length).to.equal(2);
      expect(comments.some((v) => v.authorId === members[0].userId && v.body)).to.equal(true);
      expect(comments.some((v) => v.authorId === members[1].userId)).to.equal(true);
    });

    it('should prevent non community members from reviewing a protected attestation(claim)', async () => {
      const apiResponse = await request(app)
        .post(`/v1/attestations/comments`)
        .set('authorization', UserAuthHeaderVal)
        .send({
          authorId: users[1].id,
          claimId: openCodeClaim.id,
          body: 'review 1',
          uuid: openCodeClaim.nodeUuid,
        });
      expect(apiResponse.statusCode).to.equal(401);

      const comments = await attestationService.getAllClaimComments({ nodeAttestationId: openCodeClaim.id });
      expect(comments.length).to.equal(2);
    });
  });

  describe('Annotations(Comments) Vote', async () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let commenter: User;
    let commenter1: User;
    let comment: Annotation;
    let comment1: Annotation;
    let voter: User;
    let voter1: User;
    let voter2: User;

    let vote: CommentVote;

    before(async () => {
      node = nodes[0];
      author = users[0];
      commenter = users[1];
      commenter1 = users[5];
      voter = users[2];
      voter1 = users[3];
      voter2 = users[4];
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
        links: [],
        claimId: claim.id,
        authorId: commenter.id,
        comment: 'Love the attestation',
        visible: true,
        uuid: node.uuid,
      });
      comment1 = await attestationService.createComment({
        links: [],
        claimId: claim.id,
        authorId: commenter1.id,
        comment: 'Comment1',
        visible: true,
        uuid: node.uuid,
      });
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommentVote" CASCADE;`;
    });

    it('should upvote comment', async () => {
      const vote = await attestationService.upvoteComment({
        userId: voter.id,
        annotationId: comment.id,
        type: VoteType.Yes,
      });
      expect(vote.annotationId).to.be.equal(comment.id);
      expect(vote.userId).to.be.equal(voter.id);
      expect(vote.type).to.be.equal(VoteType.Yes);

      const cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).to.be.equal(1);
    });

    it('should downvote comment', async () => {
      vote = await attestationService.downvoteComment({
        userId: voter.id,
        annotationId: comment.id,
        type: VoteType.No,
      });
      expect(vote.annotationId).to.be.equal(comment.id);
      expect(vote.userId).to.be.equal(voter.id);
      expect(vote.type).to.be.equal(VoteType.No);

      let cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).to.be.equal(0);
      cVote = await attestationService.getCommentDownvotes(comment.id);
      expect(cVote).to.be.equal(1);
    });

    it('should delete comment vote', async () => {
      await attestationService.deleteCommentVote(vote.id);
      let cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).to.be.equal(0);
      cVote = await attestationService.getCommentDownvotes(comment.id);
      expect(cVote).to.be.equal(0);
    });

    it('should account for multiple upvotes/downvotes on comment', async () => {
      await attestationService.upvoteComment({
        userId: voter.id,
        annotationId: comment.id,
        type: VoteType.Yes,
      });
      await attestationService.downvoteComment({
        userId: voter.id,
        annotationId: comment1.id,
        type: VoteType.No,
      });
      await attestationService.upvoteComment({
        userId: voter1.id,
        annotationId: comment.id,
        type: VoteType.Yes,
      });
      await attestationService.downvoteComment({
        userId: voter1.id,
        annotationId: comment1.id,
        type: VoteType.No,
      });
      await attestationService.downvoteComment({
        userId: voter2.id,
        annotationId: comment.id,
        type: VoteType.No,
      });
      await attestationService.upvoteComment({
        userId: voter2.id,
        annotationId: comment1.id,
        type: VoteType.Yes,
      });

      const comments = await attestationService.getComments({ visible: true });
      expect(comments.length).to.be.equal(2);
      // const [commentVotes, comment1Votes] = comments;

      expect((await attestationService.getVotesByCommentId(comment.id)).length).to.be.equal(3);
      expect((await attestationService.getVotesByCommentId(comment1.id)).length).to.be.equal(3);
      // expect(comment1Votes.CommentVote.length).to.be.equal(3);

      // verify voter comments
      const voterComment = await attestationService.getUserCommentVote(voter.id, comment.id);
      const voterComment1 = await attestationService.getUserCommentVote(voter.id, comment1.id);
      expect(voterComment).to.not.be.undefined;
      expect(voterComment1).to.not.be.undefined;
      expect(voterComment?.type).to.be.equal(VoteType.Yes);
      expect(voterComment1?.type).to.be.equal(VoteType.No);
      // verify voter1 comments
      const voter1Comment = await attestationService.getUserCommentVote(voter1.id, comment.id);
      const voter1Comment1 = await attestationService.getUserCommentVote(voter1.id, comment1.id);
      expect(voter1Comment).to.not.be.undefined;
      expect(voter1Comment1).to.not.be.undefined;
      expect(voter1Comment?.type).to.be.equal(VoteType.Yes);
      expect(voter1Comment1?.type).to.be.equal(VoteType.No);
      // verify voter2 comments
      const voter2Comment = await attestationService.getUserCommentVote(voter2.id, comment.id);
      const voter2Comment1 = await attestationService.getUserCommentVote(voter2.id, comment1.id);
      expect(voter2Comment).to.not.be.undefined;
      expect(voter2Comment1).to.not.be.undefined;
      expect(voter2Comment?.type).to.be.equal(VoteType.No);
      expect(voter2Comment1?.type).to.be.equal(VoteType.Yes);

      // verify comment upvotes
      let cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).to.be.equal(2);
      // verify comment downvotes
      cVote = await attestationService.getCommentDownvotes(comment.id);
      expect(cVote).to.be.equal(1);

      // verify comment1 upvotes
      cVote = await attestationService.getCommentUpvotes(comment1.id);
      expect(cVote).to.be.equal(1);
      // verify comment downvotes
      cVote = await attestationService.getCommentDownvotes(comment1.id);
      expect(cVote).to.be.equal(2);

      // clean up
      await prisma.commentVote.deleteMany({});
    });

    it('should test user upvote via api', async () => {
      const voterJwtToken = jwt.sign({ email: voter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const voterJwtHeader = `Bearer ${voterJwtToken}`;

      // send upvote request
      let res = await request(app)
        .post(`/v1/nodes/${node.uuid}/comments/${comment.id}/upvote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).to.equal(200);

      // check upvote
      res = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).to.equal(200);
      const data = (await res.body.data) as CommentVote;
      expect(data.userId).to.be.equal(voter.id);
      expect(data.annotationId).to.be.equal(comment.id);
      expect(data.type).to.be.equal(VoteType.Yes);

      // check comment has votes
      const commenterJwtToken = jwt.sign({ email: commenter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', commenterJwtHeader).send();
      expect(res.statusCode).to.equal(200);
      let comments = (await res.body.data.comments) as {
        meta: {
          upvotes: number;
          downvotes: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
        highlights: any[];
        id: number;
        body: string;
        links: string[];
        authorId: number;
      }[];
      let c1 = comments.find((c) => c.id === comment.id);
      expect(c1?.meta.upvotes).to.be.equal(1);
      expect(c1?.meta.downvotes).to.be.equal(0);

      const voterRes = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(voterRes.statusCode).to.equal(200);
      comments = (await voterRes.body.data.comments) as {
        meta: {
          upvotes: number;
          downvotes: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
        highlights: any[];
        id: number;
        body: string;
        links: string[];
        authorId: number;
      }[];
      c1 = comments.find((c) => c.id === comment.id);
      expect(c1?.meta.isUpvoted).to.be.true;
      expect(c1?.meta.isDownVoted).to.be.false;
    });

    it('should test user downvote via api', async () => {
      const voterJwtToken = jwt.sign({ email: voter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const voterJwtHeader = `Bearer ${voterJwtToken}`;

      // send upvote request
      let res = await request(app)
        .post(`/v1/nodes/${node.uuid}/comments/${comment.id}/downvote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).to.equal(200);

      // check downvote
      res = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).to.equal(200);
      const data = (await res.body.data) as CommentVote;
      expect(data.userId).to.be.equal(voter.id);
      expect(data.annotationId).to.be.equal(comment.id);
      expect(data.type).to.be.equal(VoteType.No);

      // check comment has votes
      const commenterJwtToken = jwt.sign({ email: commenter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', commenterJwtHeader).send();
      expect(res.statusCode).to.equal(200);
      let comments = (await res.body.data.comments) as {
        meta: {
          upvotes: number;
          downvotes: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
        highlights: any[];
        id: number;
        body: string;
        links: string[];
        authorId: number;
      }[];
      let c1 = comments.find((c) => c.id === comment.id);
      expect(c1?.meta.upvotes).to.be.equal(0);
      expect(c1?.meta.downvotes).to.be.equal(1);

      const voterRes = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(voterRes.statusCode).to.equal(200);
      comments = (await voterRes.body.data.comments) as {
        meta: {
          upvotes: number;
          downvotes: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
        highlights: any[];
        id: number;
        body: string;
        links: string[];
        authorId: number;
      }[];
      c1 = comments.find((c) => c.id === comment.id);
      expect(c1?.meta.isUpvoted).to.be.false;
      expect(c1?.meta.isDownVoted).to.be.true;
    });

    it('should delete user vote via api', async () => {
      const voterJwtToken = jwt.sign({ email: voter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const voterJwtHeader = `Bearer ${voterJwtToken}`;

      // send delete vote request
      let res = await request(app)
        .delete(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).to.equal(200);

      // check upvote
      res = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).to.equal(200);
      const data = (await res.body.data) as CommentVote;
      expect(data).to.be.undefined;

      // check comment has votes
      const commenterJwtToken = jwt.sign({ email: commenter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', commenterJwtHeader).send();
      expect(res.statusCode).to.equal(200);
      const comments = (await res.body.data.comments) as {
        meta: {
          upvotes: number;
          downvotes: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
        highlights: any[];
        id: number;
        body: string;
        links: string[];
        authorId: number;
      }[];
      const c1 = comments.find((c) => c.id === comment.id);
      expect(c1?.meta.upvotes).to.be.equal(0);
      expect(c1?.meta.downvotes).to.be.equal(0);
      expect(c1?.meta.isUpvoted).to.be.false;
      expect(c1?.meta.isDownVoted).to.be.false;
    });
  });
});
