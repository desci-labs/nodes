import 'dotenv/config';
import 'mocha';

import {
  EditorRole,
  Journal,
  JournalSubmission,
  JournalSubmissionReview,
  Node,
  RefereeAssignment,
  ReviewDecision,
  SubmissionStatus,
} from '@prisma/client';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import supertest from 'supertest';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../../../src/client.js';
import { server } from '../../../src/server.js';
import { JournalManagementService } from '../../../src/services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../src/services/journals/JournalRefereeManagementService.js';
import { journalSubmissionService } from '../../../src/services/journals/JournalSubmissionService.js';
import { createDraftNode, createMockUsers, MockUser, publishMockNode, sanitizeBigInts } from '../../util.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

server.ready().then((_) => {
  console.log('server is ready');
});
export const app = server.app;

describe('Journal Submission Service', () => {
  let author: MockUser;
  let chiefEditor: MockUser;
  let associateEditor: MockUser;
  let journal: Journal;
  let request: supertest.SuperTest<supertest.Test>;
  let response: supertest.Response;
  let draftNode: Node | null;
  let draftNode2: Node | null;
  let draftNode3: Node | null;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmission" CASCADE;`;

    const mockUsers = await createMockUsers(3, new Date());
    author = mockUsers[0];
    chiefEditor = mockUsers[1];
    associateEditor = mockUsers[2];

    // create a journal
    journal = await prisma.journal.create({
      data: {
        name: 'Test Journal',
        description: 'Test Description',
        iconCid: 'test-icon-cid',
        editors: {
          create: {
            userId: chiefEditor.user.id,
            role: EditorRole.CHIEF_EDITOR,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        },
      },
    });

    request = supertest(app);
  });

  afterEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmission" CASCADE;`;
  });

  describe('createSubmission', () => {
    beforeEach(async () => {
      // create a draft node
      draftNode = await createDraftNode({
        title: 'Test Node',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });

      // publish the draft node
      await publishMockNode(draftNode, new Date());

      draftNode = await prisma.node.findFirst({
        where: {
          id: draftNode.id,
        },
      });

      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode?.dpidAlias,
          version: 1,
        });
    });

    it('should create a journal submission', async () => {
      console.log({ response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const body = response.body as { ok: boolean; data: { submissionId: number } };
      expect(response.status).to.equal(200);
      expect(body.ok).to.be.true;
      expect(body.data.submissionId).to.be.a('number');
    });

    it('should prevent duplicate submissions', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode?.dpidAlias,
          version: 1,
        });

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Submission already exists');
    });

    it('should prevent submitting a version that does not exist', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode?.dpidAlias,
          version: 2,
        });
      console.log({ response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Node version not found');
    });

    it('should prevent submitting a version that is not a positive integer', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode?.dpidAlias,
          version: 0,
        });
      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      const errorResponse = response.body as { ok: boolean; errors: { field: string; message: string }[] };
      expect(response.status).to.equal(400);
      expect(errorResponse.ok).to.be.false;
      expect(errorResponse.errors[0].message).to.equal('Version must be a positive integer greater than zero');
    });

    it('should prevent submitting a dpid that is not a positive integer', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: -1,
          version: 1,
        });
      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const errorResponse = response.body as { ok: boolean; errors: { field: string; message: string }[] };

      expect(response.status).to.equal(400);
      expect(errorResponse.ok).to.be.false;
      expect(errorResponse.errors[0].message).to.equal('DPID must be a positive integer greater than zero');
    });

    it('should prevent submitting a dpid that is not a number', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: 'test-dpid',
          version: 1,
        });
      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const errorResponse = response.body as { ok: boolean; errors: { field: string; message: string }[] };

      expect(response.status).to.equal(400);
      expect(errorResponse.ok).to.be.false;
      expect(errorResponse.errors[0].message).to.equal('DPID must be a positive integer greater than zero');
    });
  });

  describe('Chief Editor', () => {
    beforeEach(async () => {
      // create a draft node
      draftNode = await createDraftNode({
        title: 'Test Node',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });

      // publish the draft node
      await publishMockNode(draftNode, new Date());

      draftNode = await prisma.node.findFirst({
        where: {
          id: draftNode.id,
        },
      });

      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode?.dpidAlias,
          version: 1,
        });
    });

    it('can view submissions', async () => {});
    it('can assign submissions to associate editors', async () => {});
  });

  describe('Associate Editor', () => {
    let submission: JournalSubmission;
    let review: JournalSubmissionReview;

    beforeEach(async () => {
      // Add associate editor to the journal
      await prisma.journalEditor.create({
        data: {
          journalId: journal.id,
          userId: associateEditor.user.id,
          role: EditorRole.ASSOCIATE_EDITOR,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      });

      // Create a draft node
      draftNode = await createDraftNode({
        title: 'Test Node',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });

      // Publish the draft node
      await publishMockNode(draftNode, new Date());

      draftNode = await prisma.node.findFirst({
        where: {
          id: draftNode.id,
        },
      });

      if (!draftNode?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }

      // Create a submission
      response = await request
        .post(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode.dpidAlias,
          version: 1,
        });
    });

    it('can view only public submissions (assigned, accepted)', async () => {
      if (!draftNode?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }

      // Create multiple submissions with different statuses
      await prisma.journalSubmission.create({
        data: {
          journalId: journal.id,
          authorId: author.user.id,
          dpid: draftNode.dpidAlias,
          version: 1,
          status: SubmissionStatus.SUBMITTED,
        },
      });

      let draftNode2: Node | null = await createDraftNode({
        title: 'Test Node 2',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });
      await publishMockNode(draftNode2, new Date());
      draftNode2 = await prisma.node.findFirst({
        where: {
          id: draftNode2.id,
        },
      });

      if (!draftNode2?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }

      await prisma.journalSubmission.create({
        data: {
          journalId: journal.id,
          authorId: author.user.id,
          dpid: draftNode2.dpidAlias,
          version: 1,
          status: SubmissionStatus.UNDER_REVIEW,
          assignedEditorId: associateEditor.user.id,
        },
      });

      let draftNode3: Node | null = await createDraftNode({
        title: 'Test Node 2',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });
      await publishMockNode(draftNode3, new Date());
      draftNode3 = await prisma.node.findFirst({
        where: {
          id: draftNode3.id,
        },
      });
      if (!draftNode3?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }
      await prisma.journalSubmission.create({
        data: {
          journalId: journal.id,
          authorId: author.user.id,
          dpid: draftNode3.dpidAlias,
          version: 1,
          status: SubmissionStatus.ACCEPTED,
        },
      });

      // Get submissions as associate editor
      response = await request
        .get(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${associateEditor.token}`);

      expect(response.status).to.equal(200);
      const submissions = response.body.data.submissions;
      expect(submissions).to.be.an('array');
      expect(submissions.length).to.equal(2);
      expect(submissions.map((s: any) => s.status)).to.include.members([
        SubmissionStatus.UNDER_REVIEW,
        SubmissionStatus.ACCEPTED,
      ]);
    });
  });

  describe('Author', () => {
    beforeEach(async () => {
      // // Create a draft node
      // draftNode = await createDraftNode({
      //   title: 'Test Node',
      //   ownerId: author.user.id,
      //   manifestUrl: 'https://example.com/manifest.json',
      //   replicationFactor: 1,
      //   uuid: uuidv4(),
      // });

      // // Publish the draft node
      // await publishMockNode(draftNode, new Date());

      // draftNode = await prisma.node.findFirst({
      //   where: {
      //     id: draftNode.id,
      //   },
      // });

      // if (!draftNode?.dpidAlias) {
      //   throw new Error('Failed to create draft node with dpidAlias');
      // }

      let draftNode2: Node | null = await createDraftNode({
        title: 'Test Node 2',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });
      await publishMockNode(draftNode2, new Date());
      draftNode2 = await prisma.node.findFirst({
        where: {
          id: draftNode2.id,
        },
      });

      if (!draftNode2?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }

      await prisma.journalSubmission.create({
        data: {
          journalId: journal.id,
          authorId: author.user.id,
          dpid: draftNode2.dpidAlias,
          version: 1,
          status: SubmissionStatus.UNDER_REVIEW,
          assignedEditorId: associateEditor.user.id,
        },
      });

      let draftNode3: Node | null = await createDraftNode({
        title: 'Test Node 2',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });
      await publishMockNode(draftNode3, new Date());
      draftNode3 = await prisma.node.findFirst({
        where: {
          id: draftNode3.id,
        },
      });

      if (!draftNode3?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }
      await prisma.journalSubmission.create({
        data: {
          journalId: journal.id,
          authorId: author.user.id,
          dpid: draftNode3.dpidAlias,
          version: 1,
          status: SubmissionStatus.ACCEPTED,
        },
      });
    });

    it('can view all their submissions', async () => {
      // Get author's submissions
      response = await request
        .get(`/v1/journals/${journal.id}/my-submissions/${author.user.id}`)
        .set('authorization', `Bearer ${author.token}`);
      // console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(200);
      const submissions = response.body.data.submissions;
      expect(submissions).to.be.an('array');
      expect(submissions.length).to.equal(2);
      expect(submissions.every((s: any) => s.authorId === author.user.id)).to.be.true;
    });

    it('can view public journal submissions (accepted)', async () => {
      // Get public submissions
      response = await request
        .get(`/v1/journals/${journal.id}/submissions`)
        .set('authorization', `Bearer ${author.token}`);

      expect(response.status).to.equal(200);
      const submissions = response.body.data.submissions;
      expect(submissions).to.be.an('array');
      expect(submissions.length).to.equal(1);
      expect(submissions.map((s: any) => s.status)).to.include.members([SubmissionStatus.ACCEPTED]);
    });
  });

  describe('Submission review/action', () => {
    let author: MockUser;
    let chiefEditor: MockUser;
    let associateEditor: MockUser;
    let referee: MockUser;
    let unAuthorisedUser: MockUser;
    let journal: Journal;
    let submission: JournalSubmission;
    let request: supertest.SuperTest<supertest.Test>;
    let response: supertest.Response;
    let draftNode: Node | null;
    let publishedNode: Node | null;
    let refereeAssignment: RefereeAssignment;
    let review: JournalSubmissionReview;
    const reviewTemplate = [
      {
        question: 'Is the background and literature section up to date and appropriate for the topic?',
        answer: 'Yes',
      },
    ];

    beforeEach(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmission" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmissionReview" CASCADE;`;

      const mockUsers = await createMockUsers(5, new Date());
      author = mockUsers[0];
      chiefEditor = mockUsers[1];
      associateEditor = mockUsers[2];
      referee = mockUsers[3];
      unAuthorisedUser = mockUsers[4];

      // create a journal
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: chiefEditor.user.id,
      });
      if (result.isErr()) {
        throw new Error('Failed to create journal');
      }
      journal = result._unsafeUnwrap();

      // add associate editor to journal
      await prisma.journalEditor.create({
        data: {
          journalId: journal.id,
          userId: associateEditor.user.id,
          role: EditorRole.ASSOCIATE_EDITOR,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      });

      // create and publish draft node
      draftNode = await createDraftNode({
        title: 'Test Node',
        ownerId: author.user.id,
        manifestUrl: 'https://example.com/manifest.json',
        replicationFactor: 1,
        uuid: uuidv4(),
      });
      await publishMockNode(draftNode, new Date());
      draftNode = await prisma.node.findFirst({
        where: {
          id: draftNode.id,
        },
      });

      if (!draftNode?.dpidAlias) {
        throw new Error('Failed to create draft node with dpidAlias');
      }

      // create submission
      submission = await journalSubmissionService.createSubmission({
        journalId: journal.id,
        authorId: author.user.id,
        dpid: draftNode.dpidAlias,
        version: 1,
      });

      if (!submission) {
        throw new Error('Failed to create submission');
      }

      // assign submission to referee
      await journalSubmissionService.assignSubmissionToEditor({
        assignerId: chiefEditor.user.id,
        submissionId: submission.id,
        editorId: associateEditor.user.id,
      });

      // assign referee to submission
      const refereeAssignmentResult = await JournalRefereeManagementService.assignReferee({
        submissionId: submission.id,
        refereeUserId: referee.user.id,
        dueDateHrs: 24,
        journalId: journal.id,
        managerId: associateEditor.user.id,
      });
      if (refereeAssignmentResult.isErr()) {
        throw new Error('Failed to assign referee to submission');
      }
      refereeAssignment = refereeAssignmentResult._unsafeUnwrap();

      // update submission status to under review
      await journalSubmissionService.updateSubmissionStatus(submission.id, SubmissionStatus.UNDER_REVIEW);

      // create review
      review = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: submission.id,
          refereeAssignmentId: refereeAssignment.id,
          journalId: journal.id,
          review: JSON.stringify(reviewTemplate),
          recommendation: ReviewDecision.ACCEPT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
        },
      });

      request = supertest(app);
    });

    afterEach(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmission" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmissionReview" CASCADE;`;
    });

    it('can request revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/request-revision`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          comment: 'Revision comment',
          revisionType: 'minor',
        });

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
    });

    it('can accept submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/accept`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send();

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
    });

    it('can reject submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reject`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send();

      // console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
    });

    it('should prevent CHIEF EDITOR from accepting submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/accept`)
        .set('authorization', `Bearer ${chiefEditor.token}`)
        .send();

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Insufficient permissions');
    });

    it('should prevent Referee from accepting submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/accept`)
        .set('authorization', `Bearer ${referee.token}`)
        .send();

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });

    it('should prevent Author from accepting submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/accept`)
        .set('authorization', `Bearer ${author.token}`)
        .send();

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });

    it('should prevent unauthorized users from accepting submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/accept`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send();

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });

    it('should prevent unauthorized users from reject submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reject`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send();

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });
    it('should prevent unauthorized users from requesting revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/request-revision`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send({
          comment: 'Revision comment',
          revisionType: 'minor',
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });
  });
});
