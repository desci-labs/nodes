import {
  Attestation,
  // AttestationTemplate,
  AttestationVersion,
  CommunityEntryAttestation,
  DesciCommunity,
  Node,
  User,
} from '@prisma/client';
import { describe, it, beforeAll, afterAll, expect, assert } from 'vitest';

import { prisma } from '../../src/client.js';
import { DuplicateDataError } from '../../src/core/communities/error.js';
import { attestationService } from '../../src/services/Attestation.js';
import { communityService } from '../../src/services/Communities.js';
import { createUsers } from '../util.js';

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
};

describe('Desci Communities', () => {
  const moonDao = {
    name: 'Moon Dao',
    image_url:
      'https://assets-global.website-files.com/634742417f9e1c182c6697d4/634f55796f66af7ee884539f_logo-white.svg',
    description: 'MoonDAO is accelerating our multiplanetary future.',
  };
  let daoCommunity: DesciCommunity | null;

  let admin: User;
  let unauthedUser: User;
  let users: User[];

  const setupCommunity = async () => {
    await communityService.createCommunity(moonDao);
    daoCommunity = await communityService.findCommunityByNameOrSlug(moonDao.name);
  };

  const tearDownCommunity = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
  };

  beforeAll(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    admin = await prisma.user.create({
      data: {
        email: 'admin@desci.com',
        name: 'MoonDAO admin',
      },
    });
    unauthedUser = await prisma.user.create({
      data: {
        email: 'bob@desci.com',
        name: 'Anonymous',
      },
    });
    users = await createUsers(5);
    await setupCommunity();
  });

  afterAll(async () => {
    await clearDatabase();
    await tearDownCommunity();
  });

  describe('Creating a community', async () => {
    // let daoCommunity: DesciCommunity | null;
    // before(async () => {
    //   await communityService.createCommunity(admin.id, moonDao);
    //   daoCommunity = await communityService.findCommunityByNameOrSlug(moonDao.name);
    // });

    it('should create a community', async () => {
      // const [daoCommunity, moonDaoAdmin] =
      assert(daoCommunity, 'Community not created');
      expect(daoCommunity?.name).toBe(moonDao.name);
      expect(daoCommunity?.image_url).toBe(moonDao.image_url);
      expect(daoCommunity?.description).toBe(moonDao.description);
    });

    it.skip('should assign creator as admin', async () => {
      assert(daoCommunity, 'daoCommunity is null');
      const moonDaoAdmin = await communityService.getCommunityAdmin(daoCommunity.id);
      expect(moonDaoAdmin?.userId).toBe(admin.id);
      expect(moonDaoAdmin?.user.name).toBe(admin.name);
    });
  });

  describe('Updating a community', () => {
    let updatedCommunity: DesciCommunity;

    beforeAll(async () => {
      assert(daoCommunity);
      updatedCommunity = await communityService.updateCommunity(daoCommunity.name, {
        description: 'No description',
        image_url: '',
        name: 'Dao community',
      });
      // updatedCommunity = results[0];
    });

    it('should update community', () => {
      expect(updatedCommunity.name).toBe('Dao community');
      expect(updatedCommunity.image_url).toBe('');
      expect(updatedCommunity.description).toBe('No description');
    });
  });

  describe.skip('Community Membership', () => {
    // before()
    it('should add a member', () => {
      expect(true).toBe(true);
    });
    it('should remove a member', () => {
      expect(true).toBe(true);
    });
    it('should restrict updates to admin', async () => {
      expect(true).toBe(true);
    });
    it('should prevent removal of admin', () => {
      expect(true).toBe(true);
    });
  });

  describe('Community Attestation', () => {
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

    let attestation: Attestation;
    let attestation2: Attestation;

    beforeAll(async () => {
      assert(daoCommunity);
      [attestation, attestation2] = await Promise.all(
        attestationData.map((data) => attestationService.create({ communityId: daoCommunity?.id as number, ...data })),
      );
    });

    afterAll(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "Attestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "AttestationVersion" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "AttestationTemplate" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    });

    describe('Create Community Attestation', () => {
      it('should create attestation', async () => {
        assert(attestation);
        expect(attestation.name).toBe(attestationData[0].name);
        expect(attestation.description).toBe(attestationData[0].description);
        expect(attestation.image_url).toBe(attestationData[0].image_url);
        expect(attestation.templateId).toBeNull();
      });

      it('should create attestation version', async () => {
        assert(attestation);
        const versions = await attestationService.getAttestationVersions(attestation.id);
        expect(versions.length).toBe(1);
        const attestationVersion = versions[0];
        assert(attestationVersion);
        expect(attestationVersion.name).toBe(attestationData[0].name);
        expect(attestationVersion.description).toBe(attestationData[0].description);
        expect(attestationVersion.image_url).toBe(attestationData[0].image_url);
      });

      it('should prevent duplicate attestation', async () => {
        try {
          assert(daoCommunity);
          await attestationService.create({ ...attestation });
        } catch (err) {
          expect(err).toBeInstanceOf(DuplicateDataError);
        }
      });
    });

    describe('Create Community Attestation From Template', () => {
      const templateData = {
        name: 'Template Attestation',
        description: 'Template Description',
        image_url: 'http://image_pat.png',
      };

      it('should create attestation from template', async () => {
        assert(daoCommunity);
        const template = await attestationService.createTemplate(templateData);
        const attestationFromTemplate = await attestationService.createAttestationFromTemplate(
          template.name,
          daoCommunity.id,
          {
            name: 'Custom attestation',
          },
        );

        assert(attestationFromTemplate);
        assert(template);
        expect(attestationFromTemplate.name).toBe('Custom attestation');
        expect(attestationFromTemplate.description).toBe(template.description);
        expect(attestationFromTemplate.image_url).toBe(template.image_url);
        expect(attestationFromTemplate.templateId).toBe(template.id);
      });

      it('should prevent duplicate attestation template', async () => {
        try {
          await attestationService.createTemplate(templateData);
        } catch (err) {
          expect(err).toBeInstanceOf(DuplicateDataError);
        }
      });
    });

    describe('Update Community Attestation', async () => {
      beforeAll(async () => {
        await attestationService.updateAttestation(attestation.id, { ...attestation, name: 'Update 1' });
      });

      it.skip('should publish new attestation version(2)', async () => {
        const versions = await attestationService.getAttestationVersions(attestation.id);
        assert(versions);
        // console.log('version 2', versions);
        expect(versions.length).toBe(2);
        expect(versions[1].name).toBe('Update 1');
        expect(versions[1].description).toBe(attestation.description);
        expect(versions[1].image_url).toBe(attestation.image_url);
        expect(versions[1].attestationId).toBe(attestation.id);
      });

      it.skip('should publish attestation version 3', async () => {
        await attestationService.updateAttestation(attestation.id, {
          ...attestation,
          name: 'Update 2',
          image_url: 'http://version3',
        });
        const versions = await attestationService.getAttestationVersions(attestation.id);
        assert(versions);
        // console.log('version 3', versions);
        expect(versions.length).toBe(3);
        expect(versions[2].name).toBe('Update 2');
        expect(versions[2].description).toBe(attestation.description);
        expect(versions[2].image_url).toBe('http://version3');
        expect(versions[2].attestationId).toBe(attestation.id);
      });

      it.skip('should publish attestation version 4', async () => {
        await attestationService.updateAttestation(attestation.id, {
          ...attestation,
          description: 'Version 4 Description',
        });
        const versions = await attestationService.getAttestationVersions(attestation.id);
        // console.log('version 4', versions);
        assert(versions);
        expect(versions.length).toBe(4);
        expect(versions[3].name).toBe(attestation.name);
        expect(versions[3].description).toBe('Version 4 Description');
        expect(versions[3].image_url).toBe(attestation.image_url);
        expect(versions[3].attestationId).toBe(attestation.id);
      });
    });

    describe.skip('Community Selected Attestation', () => {
      let selectedAttestation: CommunityEntryAttestation;
      let version: AttestationVersion;
      let selectedVersion: AttestationVersion;
      let selectedAttestation2: CommunityEntryAttestation;

      beforeAll(async () => {
        assert(daoCommunity);
        assert(attestation);
        const versions = await attestationService.getAttestationVersions(attestation.id);
        version = versions[versions.length - 1];
        selectedAttestation = await attestationService.addCommunityEntryAttestation({
          required: true,
          communityId: daoCommunity.id,
          attestationId: attestation.id,
          attestationVersion: version.id,
        });

        const versions2 = await attestationService.getAttestationVersions(attestation2.id);
        selectedVersion = versions2[versions2.length - 1];
        selectedAttestation2 = await attestationService.addCommunityEntryAttestation({
          required: true,
          communityId: daoCommunity.id,
          attestationId: attestation2.id,
          attestationVersion: selectedVersion.id,
        });
      });

      it('should add attestation to community', () => {
        assert(daoCommunity);
        expect(selectedAttestation.attestationId).toBe(attestation.id);
        expect(selectedAttestation.desciCommunityId).toBe(daoCommunity.id);
        expect(selectedAttestation.required).toBe(true);
        expect(selectedAttestation.attestationVersionId).toBe(version.id);
      });

      it('should prevent duplicate community selected attestation', async () => {
        try {
          assert(daoCommunity);
          await attestationService.addCommunityEntryAttestation({
            required: true,
            communityId: daoCommunity.id,
            attestationId: attestation.id,
            attestationVersion: version.id,
          });
        } catch (err) {
          expect(err).toBeInstanceOf(DuplicateDataError);
        }
      });

      it('should list all community selected attestations', async () => {
        assert(daoCommunity);
        const entryAttestations = await attestationService.getCommunityEntryAttestations(daoCommunity.id);
        expect(entryAttestations.length).toBe(2);

        // check for first attestation properties
        expect(entryAttestations[0].id).toBe(selectedAttestation.id);
        expect(entryAttestations[0].attestationId).toBe(attestation.id);
        expect(entryAttestations[0].attestationVersionId).toBe(version.id);

        // check for first attestation properties
        expect(entryAttestations[1].id).toBe(selectedAttestation2.id);
        expect(entryAttestations[1].attestationId).toBe(attestation2.id);
        expect(entryAttestations[1].attestationVersionId).toBe(selectedVersion.id);
      });

      // it('should only curate nodes who claim entry requirement attestation(s)', () => {
      //   expect(true).toBe(false);
      // });

      // it('should allow member to claim all selected attestation(s)', () => {});
      // it('should allow member claim individual attestation(s)', () => {});
    });
  });

  describe('Community Submission', async () => {
    let submissionId: number;
    const nodeData = {
      title: 'Test Node',
      manifestUrl: 'http://example.com/manifest',
      replicationFactor: 1,
    };
    let testNode: Node;
    let testNode2: Node;

    beforeAll(async () => {
      // Create a test node for submissions
      testNode = await prisma.node.create({
        data: {
          ...nodeData,
          ownerId: unauthedUser.id,
        },
      });
      testNode2 = await prisma.node.create({
        data: {
          ...nodeData,
          ownerId: unauthedUser.id,
        },
      });
    });

    afterAll(async () => {
      // Clean up test data
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySubmission" CASCADE;`;
      await prisma.node.delete({ where: { id: testNode.id } });
    });

    describe('Create Submission', () => {
      it.skip('should create a submission', async () => {
        assert(daoCommunity);
        // Make unauthedUser a community member
        await prisma.communityMember.create({
          data: {
            userId: unauthedUser.id,
            communityId: daoCommunity.id,
            role: 'MEMBER',
          },
        });

        const submission = await communityService.createSubmission({
          nodeId: testNode.uuid!,
          communityId: daoCommunity.id,
          userId: unauthedUser.id,
        });

        expect(submission).not.toBeNull();
        expect(submission.nodeId).toBe(testNode.uuid);
        expect(submission.communityId).toBe(daoCommunity.id);
        expect(submission.status).toBe('PENDING');

        submissionId = submission.id;
      });

      it.skip('should prevent submission when user is not community member', async () => {
        assert(daoCommunity);
        const nonMemberUser = users[0];

        try {
          await communityService.createSubmission({
            nodeId: testNode.uuid!,
            communityId: daoCommunity.id,
            userId: nonMemberUser.id,
          });
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('not a member');
        }
      });

      it.skip('should prevent duplicate submissions', async () => {
        assert(daoCommunity);
        try {
          await communityService.createSubmission({
            nodeId: testNode.uuid!,
            communityId: daoCommunity.id,
            userId: unauthedUser.id,
          });
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Unique constraint failed');
        }
      });
    });

    describe('Get Community Submissions', () => {
      it.skip('should list all submissions for community members', async () => {
        assert(daoCommunity);
        const submissions = await communityService.getCommunitySubmissions({ communityId: daoCommunity.id });

        expect(submissions).toBeInstanceOf(Array);
        expect(submissions.length).toBeGreaterThan(0);
        expect(submissions[0].nodeId).toBe(testNode.uuid);
      });

      it.skip('should filter submissions by status', async () => {
        assert(daoCommunity);
        const pendingSubmissions = await communityService.getCommunitySubmissions({
          communityId: daoCommunity.id,
          status: 'PENDING',
        });

        expect(pendingSubmissions).toBeInstanceOf(Array);
        expect(pendingSubmissions.length).toBeGreaterThan(0);
        expect(pendingSubmissions[0].status).toBe('PENDING');
      });

      it.skip('should prevent non-members from viewing submissions', async () => {
        assert(daoCommunity);
        const nonMemberUser = users[0];

        try {
          await communityService.getCommunitySubmissions({ communityId: daoCommunity.id });
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('not a member');
        }
      });
    });

    describe('Get User Submissions', () => {
      it.skip("should list user's own submissions", async () => {
        const submissions = await communityService.getUserSubmissions(unauthedUser.id);

        expect(submissions).toBeInstanceOf(Array);
        expect(submissions.length).toBeGreaterThan(0);
        expect(submissions[0].node.ownerId).toBe(unauthedUser.id);
      });

      it.skip("should prevent viewing other users' submissions", async () => {
        try {
          await communityService.getUserSubmissions(admin.id);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Unauthorized');
        }
      });
    });

    describe('Update Submission Status', () => {
      it.skip('should allow admin/Member to accept submission', async () => {
        assert(daoCommunity);
        // Make admin a community admin
        await prisma.communityMember.create({
          data: {
            userId: admin.id,
            communityId: daoCommunity.id,
            role: 'ADMIN',
          },
        });

        const updatedSubmission = await communityService.updateSubmissionStatus(submissionId, 'ACCEPTED');

        expect(updatedSubmission.status).toBe('ACCEPTED');
        expect(updatedSubmission.acceptedAt).not.toBeNull();
      });

      it.skip('should allow admin/member to reject submission', async () => {
        const newSubmission = await communityService.createSubmission({
          nodeId: testNode2.uuid!,
          communityId: daoCommunity!.id,
          userId: unauthedUser.id,
        });

        const updatedSubmission = await communityService.updateSubmissionStatus(newSubmission.id, 'REJECTED');

        expect(updatedSubmission.status).toBe('REJECTED');
        expect(updatedSubmission.rejectedAt).not.toBeNull();
      });

      it.skip('should prevent non-admin from updating status', async () => {
        try {
          await communityService.updateSubmissionStatus(submissionId, 'ACCEPTED');
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('admin');
        }
      });
    });

    describe('Get Single Submission', () => {
      it.skip('should allow submitter to view submission', async () => {
        const submission = await communityService.getSubmission(submissionId);

        expect(submission).not.toBeNull();
        expect(submission?.id).toBe(submissionId);
        expect(submission?.nodeId).toBe(testNode.uuid);
      });

      it.skip('should allow community member to view submission', async () => {
        const submission = await communityService.getSubmission(submissionId);

        expect(submission).not.toBeNull();
        expect(submission?.id).toBe(submissionId);
      });

      it.skip('should prevent non-members from viewing submission', async () => {
        const nonMemberUser = users[0];

        try {
          await communityService.getSubmission(submissionId);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Unauthorized');
        }
      });

      it('should return 404 for non-existent submission', async () => {
        try {
          const submission = await communityService.getSubmission(99999);
          expect(submission).toBeNull();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('not found');
        }
      });
    });
  });
});
