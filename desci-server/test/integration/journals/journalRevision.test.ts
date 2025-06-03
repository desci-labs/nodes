import 'dotenv/config';
import 'mocha';

import {
  EditorRole,
  Journal,
  JournalRevisionStatus,
  JournalSubmission,
  JournalSubmissionRevision,
  JournalSubmissionReview,
  Node,
  RefereeAssignment,
  ReviewDecision,
  SubmissionStatus,
} from '@prisma/client';
import chai, { assert } from 'chai';
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

describe('Journal Revisions', () => {
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
  let refereeAssignment: RefereeAssignment;
  let review: JournalSubmissionReview;

  const reviewTemplate = [
    {
      question: 'Is the background and literature section up to date and appropriate for the topic?',
      answer: 'Yes',
    },
  ];

  const getReviewById = async (reviewId: number, user: MockUser) => {
    return await request
      .get(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${reviewId}`)
      .set('authorization', `Bearer ${user.token}`);
  };

  const getSubmissionReviews = async (submissionId: number, user: MockUser) => {
    return await request
      .get(`/v1/journals/${journal.id}/submissions/${submissionId}/reviews`)
      .set('authorization', `Bearer ${user.token}`);
  };

  const setUpSubmission = async (status: SubmissionStatus) => {
    // create and publish draft node
    const draftNode = await createDraftNode({
      title: 'Test Node',
      ownerId: author.user.id,
      manifestUrl: 'https://example.com/manifest.json',
      replicationFactor: 1,
      uuid: uuidv4(),
    });
    await publishMockNode(draftNode, new Date());
    const node = await prisma.node.findFirst({
      where: {
        id: draftNode.id,
      },
    });

    assert(node?.dpidAlias, 'Failed to create draft node with dpidAlias');
    if (!node) {
      throw new Error('Node is not published');
    }

    const submission = await journalSubmissionService.createSubmission({
      journalId: journal.id,
      authorId: author.user.id,
      dpid: node.dpidAlias!,
      version: 1,
    });

    assert(submission, 'Failed to create submission');

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
    const updatedSubmission = await journalSubmissionService.updateSubmissionStatus(submission.id, status);
    assert(updatedSubmission, 'Failed to update submission status');

    return { submission: { ...submission, ...updatedSubmission }, refereeAssignment, node };
  };

  const submitReview = async (review: JournalSubmissionReview, update: Partial<JournalSubmissionReview>) => {
    return await request
      .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}/submit`)
      .set('authorization', `Bearer ${referee.token}`)
      .send(update);
  };

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

    assert(draftNode?.dpidAlias, 'Failed to create draft node with dpidAlias');

    // create submission
    submission = await journalSubmissionService.createSubmission({
      journalId: journal.id,
      authorId: author.user.id,
      dpid: draftNode.dpidAlias,
      version: 1,
    });

    assert(submission, 'Failed to create submission');

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

    // submit review
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

  describe('Request Revision', () => {
    it('should allow associate editor to request revision', async () => {
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
  });

  describe('Submit Revision', () => {
    beforeEach(async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/request-revision`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          comment: 'Revision comment',
          revisionType: 'minor',
        });

      assert(response.ok, 'Failed to request revision');
    });

    it('should allow author to submit revision', async () => {
      // publish new node version
      await publishMockNode(draftNode!, new Date());

      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 2,
        });

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
    });

    it('should prevent referee from submitting revision', async () => {
      // publish new node version
      await publishMockNode(draftNode!, new Date());

      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${referee.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 2,
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not the author of the submission');
    });

    it('should prevent chief editor from submitting revision', async () => {
      // publish new node version
      await publishMockNode(draftNode!, new Date());

      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${chiefEditor.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 2,
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not the author of the submission');
    });

    it('should prevent unauthorized users from submitting revision', async () => {
      // publish new node version
      await publishMockNode(draftNode!, new Date());

      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 2,
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not the author of the submission');
    });

    it('should prevent submitting revision with invalid dpid', async () => {
      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: 1000000000,
          version: 2,
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('DPID does not match with submission');
    });

    it('should prevent submitting revision with invalid version', async () => {
      // submit revision with less than submission version
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 1,
        });
      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Revision version should be greater than initial submission version');

      // submit revision with greater version number than node version
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 3,
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Invalid node version');
    });
  });

  describe('Revision Decision', () => {
    let revision: JournalSubmissionRevision;

    beforeEach(async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/request-revision`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          comment: 'Revision comment',
          revisionType: 'minor',
        });

      assert(response.ok, 'Failed to request revision');

      // publish new node version
      await publishMockNode(draftNode!, new Date());

      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 2,
        });

      assert(response.ok, 'Failed to submit revision');
      revision = response.body.data;
      assert(revision, 'Failed to get revision');
    });

    it('should allow associate editor to accept revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          decision: 'accept',
        });

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;

      const updatedRevision = await prisma.journalSubmissionRevision.findUnique({
        where: {
          id: revision.id,
        },
      });

      expect(updatedRevision?.status).to.equal(JournalRevisionStatus.ACCEPTED);

      // check submission status is updated to under review
      const updatedSubmission = await prisma.journalSubmission.findUnique({
        where: {
          id: submission.id,
        },
      });
      expect(updatedSubmission?.status).to.equal(SubmissionStatus.UNDER_REVIEW);
    });

    it('should allow associate editor to reject revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          decision: 'reject',
        });

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;

      const updatedRevision = await prisma.journalSubmissionRevision.findUnique({
        where: {
          id: revision.id,
        },
      });

      expect(updatedRevision?.status).to.equal(JournalRevisionStatus.REJECTED);
    });
    it('should prevent chief editor from accepting/rejecting revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${chiefEditor.token}`)
        .send({
          decision: 'accept',
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Insufficient permissions');

      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${chiefEditor.token}`)
        .send({
          decision: 'reject',
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Insufficient permissions');
    });

    it('should prevent referee from accepting/rejecting revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${referee.token}`)
        .send({
          decision: 'accept',
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });
    it('should prevent unauthorized users from accepting/rejecting revision', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send({
          decision: 'accept',
        });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Forbidden - Not a journal editor');
    });
  });

  describe('View Revision', () => {
    let revision: JournalSubmissionRevision;

    beforeEach(async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/request-revision`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          comment: 'Revision comment',
          revisionType: 'minor',
        });

      assert(response.ok, 'Failed to request revision');

      // publish new node version
      await publishMockNode(draftNode!, new Date());

      // submit revision with new version number
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions`)
        .set('authorization', `Bearer ${author.token}`)
        .send({
          dpid: draftNode!.dpidAlias,
          version: 2,
        });

      assert(response.ok, 'Failed to submit revision');
      revision = response.body.data;
      assert(revision, 'Failed to get revision');

      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}/action`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          decision: 'accept',
        });

      assert(response.ok, 'Failed to accept revision');
    });

    it('should allow author to view submitted revision', async () => {
      response = await request
        .get(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}`)
        .set('authorization', `Bearer ${author.token}`)
        .send();

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
      expect(response.body.data.status).to.equal(JournalRevisionStatus.ACCEPTED);
    });

    it('should allow referee to view submitted revision', async () => {
      response = await request
        .get(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}`)
        .set('authorization', `Bearer ${referee.token}`)
        .send();

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
      expect(response.body.data.status).to.equal(JournalRevisionStatus.ACCEPTED);
    });
    it('should allow editors to view submitted revision', async () => {
      response = await request
        .get(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send();

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
      expect(response.body.data.status).to.equal(JournalRevisionStatus.ACCEPTED);
    });

    it('should prevent unauthorised users from viewing revision', async () => {
      response = await request
        .get(`/v1/journals/${journal.id}/submissions/${submission.id}/revisions/${revision.id}`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send();
      expect(response.status).to.equal(404);
      expect(response.body.message).to.equal('Revision not found');
    });
  });
});
