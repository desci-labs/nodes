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
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, it, beforeEach, expect, assert, beforeAll, afterAll } from 'vitest';

import { prisma } from '../../src/client.js';
import { NodeAttestationFragment } from '../../src/controllers/attestations/show.js';
import { Engagement, NodeRadar, NodeRadarEntry, NodeRadarItem } from '../../src/controllers/communities/types.js';
import { ForbiddenError } from '../../src/core/ApiError.js';
import {
  DuplicateReactionError,
  DuplicateVerificationError,
  VerificationError,
} from '../../src/core/communities/error.js';
import { AllAttestation, attestationService, CommunityAttestation } from '../../src/services/Attestation.js';
import { communityService } from '../../src/services/Communities.js';
import { client as ipfs, IPFS_NODE, spawnEmptyManifest } from '../../src/services/ipfs.js';
import { randomUUID64 } from '../../src/utils.js';
import { app } from '../testApp.js';
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
    localCommunity = await communityService.createCommunity(communitiesData[1]);
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

    const baseManifest = await spawnEmptyManifest(IPFS_NODE.PRIVATE);
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

    nodeVersions = await Promise.all(
      nodes.map((node) =>
        prisma.nodeVersion.create({
          data: { nodeId: node.id, manifestUrl: node.manifestUrl, transactionId: randomUUID64() },
        }),
      ),
    );
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

  beforeAll(async () => {
    await clearDatabase();
    await tearDown();

    await setup();
  });

  afterAll(async () => {
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;

      // clean up (delete new node version entry)
      await prisma.nodeVersion.delete({ where: { id: nodeVersion2.id } });
    });

    it('should claim an attestation to a node', () => {
      expect(claim).toBeDefined();
      expect(claim.attestationId).toBe(reproducibilityAttestation.id);
      expect(claim.attestationVersionId).toBe(attestationVersion.id);
      expect(claim.claimedById).toBe(author.id);
      expect(claim.nodeDpid10).toBe('1');
      expect(claim.nodeUuid).toBe(node.uuid);
      expect(claim.nodeVersion).toBe(nodeVersion);
      expect(claim.desciCommunityId).toBe(desciCommunity.id);
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
      expect(canClaim).toBe(false);
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
      expect(res.status).toBe(200);

      res = await request(app).post(`/v1/attestations/claimAll`).set('authorization', UserAuthHeaderVal).send({
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion: 1,
        claimerId: author.id,
        communityId: reproducibilityAttestation.communityId,
      });
      expect(res.status).toBe(200);

      // verify only one claim exists on the old version of the node
      const attestations = await attestationService.getAllNodeAttestations(node.uuid);
      expect(attestations.length).toBe(2);
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should not add node to community radar', async () => {
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ communityRadar });
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).toBeUndefined();
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
      expect(communityRadar.length).toBe(1);

      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).toBeDefined();
      expect(radarNode?.NodeAttestation.length).toBe(2);
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
      expect(res.status).toBe(200);
      claim = res.body.data;

      const claimed: NodeAttestation = res.body.data;
      expect(claimed.attestationId).toBe(reproducibilityAttestation.id);
      expect(claimed.attestationVersionId).toBe(reproducibilityAttestationVersion.id);
      expect(claimed.claimedById).toBe(node.ownerId);
      expect(claimed.desciCommunityId).toBe(desciCommunity.id);
      expect(claimed.nodeDpid10).toBe('1');
      expect(claimed.nodeVersion).toBe(nodeVersion);
      expect(claimed.nodeUuid).toBe(node.uuid);
    });

    it('should unclaim an attestation (API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).post(`/v1/attestations/unclaim`).set('authorization', authHeaderVal).send({
        claimId: claim.id,
        nodeUuid: node.uuid,
        dpid: '1',
        // claimerId: node.ownerId,
      });
      expect(res.status).toBe(200);
      const attestations = await attestationService.getAllNodeAttestations('1');
      expect(attestations.length).toBe(0);
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

    beforeAll(async () => {
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
    });

    afterAll(async () => {
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
      expect(communityRadar.length).toBe(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).toBeDefined();
      expect(radarNode?.NodeAttestation.length).toBe(2);
      expect(radarNode?.NodeAttestation[0].attestationId).toBe(claim.attestationId);
      expect(radarNode?.NodeAttestation[0].attestationVersionId).toBe(claim.attestationVersionId);
      expect(radarNode?.NodeAttestation[0].desciCommunityId).toBe(claim.desciCommunityId);
      expect(radarNode?.NodeAttestation[0].nodeDpid10).toBe('1');
      expect(radarNode?.NodeAttestation[0].nodeVersion).toBe(nodeVersion);

      expect(radarNode?.NodeAttestation[1].attestationId).toBe(openDataAttestationClaim.attestationId);
      expect(radarNode?.NodeAttestation[1].attestationVersionId).toBe(openDataAttestationClaim.attestationVersionId);
      expect(radarNode?.NodeAttestation[1].desciCommunityId).toBe(openDataAttestationClaim.desciCommunityId);
      expect(radarNode?.NodeAttestation[1].nodeDpid10).toBe('1');
      expect(radarNode?.NodeAttestation[1].nodeVersion).toBe(nodeVersion);
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

    beforeAll(async () => {
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

      expect(res.status).toBe(200);
      const claims: NodeAttestation[] = res.body.data;
      [claim, openDataAttestationClaim] = claims;
    });

    afterAll(async () => {
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
      expect(communityRadar.length).toBe(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).toBeDefined();
      expect(radarNode?.NodeAttestation.length).toBe(2);
      expect(radarNode?.NodeAttestation[0].attestationId).toBe(claim.attestationId);
      expect(radarNode?.NodeAttestation[0].attestationVersionId).toBe(claim.attestationVersionId);
      expect(radarNode?.NodeAttestation[0].desciCommunityId).toBe(claim.desciCommunityId);
      expect(radarNode?.NodeAttestation[0].nodeDpid10).toBe('1');
      expect(radarNode?.NodeAttestation[0].nodeVersion).toBe(nodeVersion);

      expect(radarNode?.NodeAttestation[1].attestationId).toBe(openDataAttestationClaim.attestationId);
      expect(radarNode?.NodeAttestation[1].attestationVersionId).toBe(openDataAttestationClaim.attestationVersionId);
      expect(radarNode?.NodeAttestation[1].desciCommunityId).toBe(openDataAttestationClaim.desciCommunityId);
      expect(radarNode?.NodeAttestation[1].nodeDpid10).toBe('1');
      expect(radarNode?.NodeAttestation[1].nodeVersion).toBe(nodeVersion);
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

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('UnClaiming an Attestation', () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should unclaim an attestation from a node', async () => {
      // check if it's appears in community radar
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      expect(communityRadar.length).toBe(1);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).toBeDefined();
      expect(radarNode?.NodeAttestation.length).toBe(1);

      // unclaim attestaion
      const unclaimed = await attestationService.unClaimAttestation(claim.id);
      expect(unclaimed).not.toBeNull();
      expect(unclaimed).toBeDefined();
      expect(unclaimed.attestationId).toBe(reproducibilityAttestation.id);
      expect(unclaimed.desciCommunityId).toBe(desciCommunity.id);
      expect(unclaimed.attestationVersionId).toBe(attestationVersion.id);
      expect(unclaimed.nodeDpid10).toBe('1');

      const nodeClaim = await attestationService.getClaimOnAttestationVersion(
        '1',
        reproducibilityAttestation.id,
        attestationVersion.id,
      );
      expect(nodeClaim).toBeNull();
    });

    it('should remove/hide node from community feed if entry requirement is not met', async () => {
      // check if it's has been removed from community radar
      // await attestationService.unClaimAttestation(claim.id);
      const communityRadar = await communityService.getCommunityRadar(desciCommunity.id);
      expect(communityRadar.length).toBe(0);
      const radarNode = communityRadar.find((radarNode) => radarNode.nodeDpid10 === '1');
      expect(radarNode).toBeUndefined();
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
    });

    it('should react to a node attestation', () => {
      expect(reaction.authorId).toBe(users[1].id);
      expect(reaction.nodeAttestationId).toBe(claim.id);
      expect(reaction.reaction).toBe('U+1F42F');
    });

    it('should prevent duplicate reaction', async () => {
      try {
        await attestationService.createReaction({
          claimId: claim.id,
          userId: users[1].id,
          reaction: 'U+1F42F',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateReactionError);
      }
    });

    it('should remove reaction to a node attestation', async () => {
      const removedReaction = await attestationService.removeReaction(reaction.id);
      expect(removedReaction).not.toBeNull();
      expect(removedReaction).toBeDefined();
      expect(removedReaction.id).toBe(reaction.id);
      expect(removedReaction.reaction).toBe('U+1F42F');

      const voidReaction = await attestationService.getReactions({
        nodeAttestationId: claim.id,
        authorId: users[1].id,
        reaction: 'U+1F42F',
      });
      expect(voidReaction.length).toBe(0);
      expect(voidReaction[0]).toBeUndefined();
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
    });

    it('should add comment to a node attestation', async () => {
      expect(comment.authorId).toBe(users[1].id);
      expect(comment.nodeAttestationId).toBe(claim.id);
      expect(comment.body).toBe('Love the attestation');
    });

    it('should remove comment on a node attestation', async () => {
      const removedComment = await attestationService.removeComment(comment.id);
      expect(removedComment).not.toBeNull();
      expect(removedComment).toBeDefined();
      expect(removedComment.id).toBe(comment.id);
      expect(removedComment.body).toBe('Love the attestation');

      const voidComment = await attestationService.getUserClaimComments(claim.id, users[1].id);
      expect(voidComment.length).toBe(0);
      expect(voidComment[0]).toBeUndefined();
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
      expect(editedComment.body).toBe('edited comment');
      expect(editedComment.links[0]).toBe('https://google.com');
    });

    it('should not allow another author to edit a comment', async () => {
      try {
        await attestationService.editComment({
          update: { body: 'edited comment', links: ['https://google.com'] },
          authorId: users[2].id,
          id: comment.id,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenError);
      }
    });

    it('should edit a comment(via api)', async () => {
      const commenterJwtToken = jwt.sign({ email: users[1].email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      const res = await request(app)
        .put(`/v1/nodes/${nodes[1].uuid}/comments/${comment.id}`)
        .set('authorization', commenterJwtHeader)
        .send({ body: 'edit comment via api', links: ['https://desci.com'] });
      expect(res.statusCode).toBe(200);
      const editedComment = (await res.body.data) as Annotation;

      expect(editedComment.body).toBe('edit comment via api');
      expect(editedComment.links[0]).toBe('https://desci.com');
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
      expect(reply.body).toBe('Reply to Old comment to be edited');
      expect(reply.replyToId).toBe(comment.id);
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
      expect(res.statusCode).toBe(200);
      comment = res.body.data as Annotation;
      expect(comment.body).toBe('post comment with reply');

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

      expect(res.statusCode).toBe(200);
      expect(reply.replyToId).toBe(comment.id);

      // check comment
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', authorJwtHeader).send();
      expect(res.statusCode).toBe(200);
      expect(res.body.data.count).toBe(1);
      const data = (await res.body.data.comments) as (Annotation & {
        meta: {
          upvotes: number;
          downvotes: number;
          replyCount: number;
          isUpvoted: boolean;
          isDownVoted: boolean;
        };
      })[];
      const parentComment = data.find((c) => c.id === comment.id);
      expect(parentComment?.meta.replyCount).toBe(1);
    });
  });

  describe('Node Attestation Verification', async () => {
    let claim: NodeAttestation;
    let node: Node;
    const nodeVersion = 0;
    let attestationVersion: AttestationVersion;
    let author: User;
    let verification: NodeAttestationVerification;

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
    });

    it('should allow users verify a node attestation(claim)', async () => {
      expect(verification.nodeAttestationId).toBe(claim.id);
      expect(verification.userId).toBe(users[1].id);
    });

    it('should prevent double verification of Node Attestation(Claim)', async () => {
      try {
        await attestationService.verifyClaim(claim.id, users[1].id);
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateVerificationError);
      }
    });

    it('should restrict author from verifying their claim', async () => {
      try {
        assert(author.id === node.ownerId);
        await attestationService.verifyClaim(claim.id, author.id);
      } catch (err) {
        expect(err).toBeInstanceOf(VerificationError);
      }
    });

    it('should remove verification', async () => {
      const removedVerification = await attestationService.removeVerification(verification.id, users[1].id);
      expect(removedVerification).not.toBeNull();
      expect(removedVerification).toBeDefined();
      expect(removedVerification.id).toBe(verification.id);

      const voidVerification = await attestationService.getUserClaimVerification(claim.id, users[1].id);
      expect(voidVerification).toBeNull();
    });

    it('should allow multiple users verify a node attestation(claim)', async () => {
      const user2Verification = await attestationService.verifyClaim(claim.id, users[2].id);
      expect(user2Verification.nodeAttestationId).toBe(claim.id);
      expect(user2Verification.userId).toBe(users[2].id);

      const user3Verification = await attestationService.verifyClaim(claim.id, users[3].id);
      expect(user3Verification.nodeAttestationId).toBe(claim.id);
      expect(user3Verification.userId).toBe(users[3].id);

      const verifications = await attestationService.getAllClaimVerfications(claim.id);
      expect(verifications.length).toBe(2);

      assert(node.uuid);
      const nodeVerifications = await attestationService.getAllNodeVerfications(node.uuid);
      expect(nodeVerifications.length).toBe(2);
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should return curated community nodes', async () => {
      const curatedNodes = await communityService.getCuratedNodes(desciCommunity.id);
      // console.log({ curatedNodes });
      expect(curatedNodes.length).toBe(1);

      const curatedNode = curatedNodes[0];
      expect(curatedNode.NodeAttestation.length).toBe(2);
      expect(curatedNode.nodeDpid10).toBe('1');
      expect(curatedNode.nodeuuid).toBe(node.uuid);
    });

    it('should return community nodes on Radar', async () => {
      const curatedNodes = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ curatedNodes });
      expect(curatedNodes.length).toBe(2);

      const curatedNode = curatedNodes[0];
      expect(curatedNode.NodeAttestation.length).toBe(2);
      expect(curatedNode.nodeDpid10).toBe('1');
      expect(curatedNode.nodeuuid).toBe(node.uuid);

      const curatedNode1 = curatedNodes[1];
      expect(curatedNode1.NodeAttestation.length).toBe(2);
      expect(curatedNode1.nodeDpid10).toBe('2');
      expect(curatedNode1.nodeuuid).toBe(node2.uuid);
    });

    it('should remove node from curated feed if verification requirement is not met', async () => {
      const verifications = await attestationService.getAllClaimVerfications(openDataAttestationClaim.id);
      // console.log({ verifications });
      expect(verifications.length).toBe(1);
      await attestationService.removeVerification(verifications[0].id, users[1].id);

      const curatedNodes = await communityService.getCuratedNodes(desciCommunity.id);
      // console.log({ curatedNodes });
      expect(curatedNodes.length).toBe(0);

      const radarNodes = await communityService.getCommunityRadar(desciCommunity.id);
      // console.log({ radarNodes });
      expect(radarNodes.length).toBe(2);
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should curate all node impressions across all attestations', async () => {
      const engagements = await communityService.getCommunityEngagementSignals(desciCommunity.id);
      expect(engagements.annotations).toBe(2);
      expect(engagements.reactions).toBe(3);
      expect(engagements.verifications).toBe(5);
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should return all node engagement signal across all attestations in a community', async () => {
      const dPid1Engagements = await communityService.getNodeCommunityEngagementSignals(desciCommunity.id, '1');
      // console.log({ dPid1Engagements });
      expect(dPid1Engagements.annotations).toBe(1);
      expect(dPid1Engagements.reactions).toBe(2);
      expect(dPid1Engagements.verifications).toBe(3);

      const dPid2Engagements = await communityService.getNodeCommunityEngagementSignals(desciCommunity.id, '2');
      // console.log({ dPid2Engagements });
      expect(dPid2Engagements.annotations).toBe(2);
      expect(dPid2Engagements.reactions).toBe(2);
      expect(dPid2Engagements.verifications).toBe(3);
    });

    it('should curate all node engagement across all attestations(claims)', async () => {
      const dPid1Engagements = await attestationService.getNodeEngagementSignals('1');
      // console.log({ dPid1Engagements });
      expect(dPid1Engagements.annotations).toBe(2);
      expect(dPid1Engagements.reactions).toBe(3);
      expect(dPid1Engagements.verifications).toBe(4);

      const dPid2Engagements = await attestationService.getNodeEngagementSignals('2');
      // console.log({ dPid2Engagements });
      expect(dPid2Engagements.annotations).toBe(2);
      expect(dPid2Engagements.reactions).toBe(2);
      expect(dPid2Engagements.verifications).toBe(5);
    });

    it('should curate all node community verification signal across all attestations(claims)', async () => {
      const dPid1Engagements = await attestationService.getNodeCommunityVerificationSignals(desciCommunity.id, '1');
      const dPid1LocalEngagements = await attestationService.getNodeCommunityVerificationSignals(
        localCommunity.id,
        '1',
      );
      // console.log({ dPid1Engagements });
      // console.log({ dPid1LocalEngagements });
      expect(dPid1Engagements.verifications).toBe(3);
      expect(dPid1LocalEngagements.verifications).toBe(1);

      const dPid2Engagements = await attestationService.getNodeCommunityVerificationSignals(desciCommunity.id, '2');
      const dPid2LocalEngagements = await attestationService.getNodeCommunityVerificationSignals(
        localCommunity.id,
        '2',
      );
      // console.log({ dPid2Engagements });
      // console.log({ dPid2LocalEngagements });
      expect(dPid2Engagements.verifications).toBe(2);
      expect(dPid2LocalEngagements.verifications).toBe(2);
    });

    it('should validate all attestations engagement signals', async () => {
      const reproducibilityAttestationEngagements = await attestationService.getAttestationVersionEngagementSignals(
        reproducibilityAttestation.id,
        reproducibilityAttestationVersion.id,
      );
      // console.log({ reproducibilityAttestationEngagements });
      expect(reproducibilityAttestationEngagements.annotations).toBe(0);
      expect(reproducibilityAttestationEngagements.reactions).toBe(2);
      expect(reproducibilityAttestationEngagements.verifications).toBe(4);

      const openDataAttestationEngagements = await attestationService.getAttestationVersionEngagementSignals(
        openDataAttestation.id,
        openDataAttestationVersion.id,
      );
      // console.log({ openDataAttestationEngagements });
      expect(openDataAttestationEngagements.annotations).toBe(2);
      expect(openDataAttestationEngagements.reactions).toBe(1);
      expect(openDataAttestationEngagements.verifications).toBe(1);

      const fairMetadataAttestationEngagements = await attestationService.getAttestationVersionEngagementSignals(
        fairMetadataAttestation.id,
        fairMetadataAttestationVersion.id,
      );
      // console.log({ fairMetadataAttestationEngagements });
      expect(fairMetadataAttestationEngagements.annotations).toBe(1);
      expect(fairMetadataAttestationEngagements.reactions).toBe(1);
      expect(fairMetadataAttestationEngagements.verifications).toBe(1);

      const LocalReproducibilityAttestationEngagements =
        await attestationService.getAttestationVersionEngagementSignals(
          LocalReproducibilityAttestation.id,
          localReproducibilityAttestationVersion.id,
        );
      // console.log({ LocalReproducibilityAttestationEngagements });
      expect(LocalReproducibilityAttestationEngagements.annotations).toBe(1);
      expect(LocalReproducibilityAttestationEngagements.reactions).toBe(1);
      expect(LocalReproducibilityAttestationEngagements.verifications).toBe(3);
    });

    // TESTS FOR showNodeAttestations api
    it('should show DPID 1 node attestations(API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).get(`/v1/attestations/${node.uuid}`).set('authorization', authHeaderVal);
      const attestations: NodeAttestationFragment[] = res.body.data;
      expect(attestations.length).toBe(3);
    });

    // TESTS FOR showNodeAttestations api
    it('should show DPID 2 node attestations(API)', async () => {
      const JwtToken = jwt.sign({ email: users[0].email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      const authHeaderVal = `Bearer ${JwtToken}`;
      const res = await request(app).get(`/v1/attestations/${node2.uuid}`).set('authorization', authHeaderVal);
      const attestations: NodeAttestationFragment[] = res.body.data;
      expect(attestations.length).toBe(4);
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

    beforeAll(async () => {
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
      // console.log(apiResponse[0]);
      // console.log(apiResponse[1]);
      // console.log(apiResponse[2]);
    });

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should return nodes in radar in ASC order of verified engagements sorted by last submission/claim date', async () => {
      expect(res.status).toBe(200);
      expect(apiResponse.length).toBe(3);
      expect(apiResponse[0].nodeUuid).toBe(node2.uuid);
      expect(apiResponse[1].nodeUuid).toBe(node3.uuid);
      expect(apiResponse[2].nodeUuid).toBe(node.uuid);
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

    beforeAll(async () => {
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

      res = await request(app)
        .get(`/v1/communities/${desciCommunity.slug}/attestations`)
        .set('authorization', authHeaderVal);
      communityResponse = res.body.data;
    });

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it.skip('should list all attestation Recommendations', async () => {
      const rawListAll = await attestationService.listAll();

      expect(res.status).toBe(200);
      expect(allResponse.length).toBe(6);
      const desciAttestations = allResponse.filter((att) => att.communityId === desciCommunity.id);
      const desciEngagements = desciAttestations.reduce(
        (total, att) => total + att.annotations + att.reactions + att.verifications,
        0,
      );
      expect(desciAttestations.length).toBe(3);
      expect(desciEngagements).toBe(13);

      const localAttestations = allResponse.filter((att) => att.communityId === localCommunity.id);
      const localEngagements = localAttestations.reduce(
        (total, att) => total + att.annotations + att.reactions + att.verifications,
        0,
      );
      expect(localAttestations.length).toBe(3);
      expect(localEngagements).toBe(5);
    });

    it.skip('should list all community attestations Recommendations', async () => {
      communityResponse = res.body.data;
      expect(res.status).toBe(200);
      expect(communityResponse.length).toBe(3);

      const desciAttestations = communityResponse.filter((att) => att.communityId === desciCommunity.id);
      const desciEngagements = desciAttestations.reduce(
        (total, att) => total + att.annotations + att.reactions + att.verifications,
        0,
      );

      expect(desciAttestations.length).toBe(3);
      expect(desciEngagements).toBe(13);
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

    beforeAll(async () => {
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

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    it('should revoke node attestation', async () => {
      const res = await request(app).post(`/v1/attestations/unclaim`).set('authorization', authHeaderVal).send({
        dpid: '1',
        nodeUuid: node.uuid,
        claimId: claim.id,
      });
      expect(res.status).toBe(200);

      const claims = await attestationService.getAllNodeAttestations(node.uuid!);
      expect(claims.length).toBe(1);
    });

    it('should remove revoked claim engagements from node and community engagement signals', async () => {
      const engagmentSignal = await attestationService.getNodeEngagementSignals('1');
      expect(engagmentSignal.verifications).toBe(1);
      expect(engagmentSignal.annotations).toBe(1);
      expect(engagmentSignal.reactions).toBe(0);

      const communityEngagementSignal = await communityService.getCommunityEngagementSignals(desciCommunity.id);
      expect(communityEngagementSignal.verifications).toBe(3);
      expect(communityEngagementSignal.annotations).toBe(2);
      expect(communityEngagementSignal.reactions).toBe(0);
    });

    it('should remove node from radar and curated if claim is revoked', async () => {
      const res1 = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/radar`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);
      const radar = res1.body.data.data as NodeRadarEntry[];
      expect(res1.status).toBe(200);
      expect(radar.length).toBe(1);
      const radarNode = radar[0];
      // expect(radarNode.nodeDpid10).toBe('2');
      expect(radarNode.nodeUuid).toBe(node2.uuid);

      const res = await request(app)
        .get(`/v1/communities/${desciCommunity.id}/feed`)
        .set('authorization', authHeaderVal)
        .field('communityId', desciCommunity.id);

      const curatedNodes = res.body.data.data as NodeRadarEntry[];
      expect(res.status).toBe(200);
      expect(curatedNodes.length).toBe(0);
    });

    it('should reclaim node attestation', async () => {
      let res = await request(app).post(`/v1/attestations/claim`).set('authorization', authHeaderVal).send({
        nodeDpid: '1',
        nodeUuid: node.uuid,
        nodeVersion,
        claimerId: author.id,
        attestationId: reproducibilityAttestation.id,
      });
      expect(res.status).toBe(200);

      const attestations = await attestationService.getAllNodeAttestations(node.uuid!);
      expect(attestations.length).toBe(2);

      res = await request(app).get(`/v1/attestations/${node.uuid}`).set('authorization', authHeaderVal);
      const claims = res.body.data as NodeClaim[];
      const revoked = claims.find((c) => c.id === claim.id);
      expect(revoked?.revoked).toBe(false);
      // expect(revoked?.revokedAt).toBeUndefined();
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

    beforeAll(async () => {
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

    afterAll(async () => {
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
      expect(res.statusCode).toBe(200);

      res = await request(app).post(`/v1/attestations/verification`).set('authorization', memberAuthHeaderVal2).send({
        claimId: openCodeClaim.id,
      });
      expect(res.statusCode).toBe(200);

      const verifications = await attestationService.getAllClaimVerfications(openCodeClaim.id);
      expect(verifications.length).toBe(2);
      expect(verifications.some((v) => v.userId === members[0].userId)).toBe(true);
      expect(verifications.some((v) => v.userId === members[1].userId)).toBe(true);
    });

    it('should prevent non-authorized users from verifying a protected attestation(claim)', async () => {
      const userVerificationResponse = await request(app)
        .post(`/v1/attestations/verification`)
        .set('authorization', UserAuthHeaderVal)
        .send({
          claimId: openCodeClaim.id,
        });
      expect(userVerificationResponse.statusCode).toBe(401);

      const verifications = await attestationService.getAllClaimVerfications(openCodeClaim.id);
      expect(verifications.length).toBe(2);
      expect(verifications.some((v) => v.userId === members[0].userId)).toBe(true);
      expect(verifications.some((v) => v.userId === members[1].userId)).toBe(true);
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

    beforeAll(async () => {
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

    afterAll(async () => {
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
      expect(res.statusCode).toBe(200);

      body = {
        authorId: members[1].userId,
        claimId: openCodeClaim.id,
        body: 'review 2',
        uuid: openCodeClaim.nodeUuid,
      };
      res = await request(app).post(`/v1/attestations/comments`).set('authorization', memberAuthHeaderVal2).send(body);
      expect(res.statusCode).toBe(200);

      const comments = await attestationService.getAllClaimComments({ nodeAttestationId: openCodeClaim.id });
      expect(comments.length).toBe(2);
      expect(comments.some((v) => v.authorId === members[0].userId && v.body)).toBe(true);
      expect(comments.some((v) => v.authorId === members[1].userId)).toBe(true);
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
      expect(apiResponse.statusCode).toBe(401);

      const comments = await attestationService.getAllClaimComments({ nodeAttestationId: openCodeClaim.id });
      expect(comments.length).toBe(2);
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

    beforeAll(async () => {
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

    afterAll(async () => {
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
      expect(vote.annotationId).toBe(comment.id);
      expect(vote.userId).toBe(voter.id);
      expect(vote.type).toBe(VoteType.Yes);

      const cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).toBe(1);
    });

    it('should downvote comment', async () => {
      vote = await attestationService.downvoteComment({
        userId: voter.id,
        annotationId: comment.id,
        type: VoteType.No,
      });
      expect(vote.annotationId).toBe(comment.id);
      expect(vote.userId).toBe(voter.id);
      expect(vote.type).toBe(VoteType.No);

      let cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).toBe(0);
      cVote = await attestationService.getCommentDownvotes(comment.id);
      expect(cVote).toBe(1);
    });

    it('should delete comment vote', async () => {
      await attestationService.deleteCommentVote(vote.id);
      let cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).toBe(0);
      cVote = await attestationService.getCommentDownvotes(comment.id);
      expect(cVote).toBe(0);
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
      expect(comments.length).toBe(2);
      // const [commentVotes, comment1Votes] = comments;

      expect((await attestationService.getVotesByCommentId(comment.id)).length).toBe(3);
      expect((await attestationService.getVotesByCommentId(comment1.id)).length).toBe(3);
      // expect(comment1Votes.CommentVote.length).toBe(3);

      // verify voter comments
      const voterComment = await attestationService.getUserCommentVote(voter.id, comment.id);
      const voterComment1 = await attestationService.getUserCommentVote(voter.id, comment1.id);
      expect(voterComment).toBeDefined();
      expect(voterComment1).toBeDefined();
      expect(voterComment?.type).toBe(VoteType.Yes);
      expect(voterComment1?.type).toBe(VoteType.No);
      // verify voter1 comments
      const voter1Comment = await attestationService.getUserCommentVote(voter1.id, comment.id);
      const voter1Comment1 = await attestationService.getUserCommentVote(voter1.id, comment1.id);
      expect(voter1Comment).toBeDefined();
      expect(voter1Comment1).toBeDefined();
      expect(voter1Comment?.type).toBe(VoteType.Yes);
      expect(voter1Comment1?.type).toBe(VoteType.No);
      // verify voter2 comments
      const voter2Comment = await attestationService.getUserCommentVote(voter2.id, comment.id);
      const voter2Comment1 = await attestationService.getUserCommentVote(voter2.id, comment1.id);
      expect(voter2Comment).toBeDefined();
      expect(voter2Comment1).toBeDefined();
      expect(voter2Comment?.type).toBe(VoteType.No);
      expect(voter2Comment1?.type).toBe(VoteType.Yes);

      // verify comment upvotes
      let cVote = await attestationService.getCommentUpvotes(comment.id);
      expect(cVote).toBe(2);
      // verify comment downvotes
      cVote = await attestationService.getCommentDownvotes(comment.id);
      expect(cVote).toBe(1);

      // verify comment1 upvotes
      cVote = await attestationService.getCommentUpvotes(comment1.id);
      expect(cVote).toBe(1);
      // verify comment downvotes
      cVote = await attestationService.getCommentDownvotes(comment1.id);
      expect(cVote).toBe(2);

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
      expect(res.statusCode).toBe(200);

      // check upvote
      res = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).toBe(200);
      const data = (await res.body.data) as CommentVote;
      expect(data.userId).toBe(voter.id);
      expect(data.annotationId).toBe(comment.id);
      expect(data.type).toBe(VoteType.Yes);

      // check comment has votes
      const commenterJwtToken = jwt.sign({ email: commenter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', commenterJwtHeader).send();
      expect(res.statusCode).toBe(200);
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
      expect(c1?.meta.upvotes).toBe(1);
      expect(c1?.meta.downvotes).toBe(0);

      const voterRes = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(voterRes.statusCode).toBe(200);
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
      expect(c1?.meta.isUpvoted).toBe(true);
      expect(c1?.meta.isDownVoted).toBe(false);
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
      expect(res.statusCode).toBe(200);

      // check downvote
      res = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).toBe(200);
      const data = (await res.body.data) as CommentVote;
      expect(data.userId).toBe(voter.id);
      expect(data.annotationId).toBe(comment.id);
      expect(data.type).toBe(VoteType.No);

      // check comment has votes
      const commenterJwtToken = jwt.sign({ email: commenter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', commenterJwtHeader).send();
      expect(res.statusCode).toBe(200);
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
      expect(c1?.meta.upvotes).toBe(0);
      expect(c1?.meta.downvotes).toBe(1);

      const voterRes = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(voterRes.statusCode).toBe(200);
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
      expect(c1?.meta.isUpvoted).toBe(false);
      expect(c1?.meta.isDownVoted).toBe(true);
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
      expect(res.statusCode).toBe(200);

      // check upvote
      res = await request(app)
        .get(`/v1/nodes/${node.uuid}/comments/${comment.id}/vote`)
        .set('authorization', voterJwtHeader)
        .send();
      expect(res.statusCode).toBe(200);
      const data = (await res.body.data) as CommentVote;
      expect(data).toBeUndefined();

      // check comment has votes
      const commenterJwtToken = jwt.sign({ email: commenter.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const commenterJwtHeader = `Bearer ${commenterJwtToken}`;
      res = await request(app).get(`/v1/nodes/${node.uuid}/comments`).set('authorization', commenterJwtHeader).send();
      expect(res.statusCode).toBe(200);
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
      expect(c1?.meta.upvotes).toBe(0);
      expect(c1?.meta.downvotes).toBe(0);
      expect(c1?.meta.isUpvoted).toBe(false);
      expect(c1?.meta.isDownVoted).toBe(false);
    });
  });
});
