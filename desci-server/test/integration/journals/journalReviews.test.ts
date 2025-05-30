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

describe.only('Journal Reviews', () => {
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

  const reviewTemplate = [
    {
      question: 'Is the background and literature section up to date and appropriate for the topic?',
      answer: 'Yes',
    },
  ];

  const submitReview = async (review: JournalSubmissionReview, update: Partial<JournalSubmissionReview>) => {
    return await request
      .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}/submit`)
      .set('authorization', `Bearer ${referee.token}`)
      .send(update);
  };

  const getReviewById = async (reviewId: number, user: MockUser) => {
    return await request
      .get(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${reviewId}`)
      .set('authorization', `Bearer ${user.token}`);
  };

  const getSubmissionReviews = async (submission: JournalSubmission, user: MockUser) => {
    return await request
      .get(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews`)
      .set('authorization', `Bearer ${user.token}`);
  };

  const setUpSubmission = async () => {
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

    assert(draftNode?.dpidAlias, 'Failed to create draft node with dpidAlias');
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
    const updatedSubmission = await journalSubmissionService.updateSubmissionStatus(
      submission.id,
      SubmissionStatus.UNDER_REVIEW,
    );
    assert(updatedSubmission, 'Failed to update submission status');

    return { submission: { ...submission, ...updatedSubmission }, refereeAssignment, node };
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

  describe('Create review', () => {
    beforeEach(async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews`)
        .set('authorization', `Bearer ${referee.token}`)
        .send({
          review: reviewTemplate,
        });
    });

    it('should create a journal submission review', async () => {
      const body = response.body as { ok: boolean; data: JournalSubmissionReview };
      expect(response.status).to.equal(200);
      expect(body.ok).to.be.true;
      expect(body.data.submissionId).to.be.equal(submission.id);
      expect(body.data.refereeAssignmentId).to.be.equal(refereeAssignment.id);
      expect(JSON.stringify(body.data.review)).to.be.equal(JSON.stringify(reviewTemplate));
      expect(body.data.journalId).to.be.equal(journal.id);
      expect(body.data.submittedAt).to.be.null;
      expect(body.data.recommendation).to.be.null;
      expect(body.data.editorFeedback).to.be.null;
      expect(body.data.authorFeedback).to.be.null;
    });

    it('should prevent referee from creating duplicate reviews on the same submission', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews`)
        .set('authorization', `Bearer ${referee.token}`)
        .send({
          review: reviewTemplate,
        });

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('Review already exists');
    });

    it('should prevent unAuthorised user from creating a review', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send({
          review: reviewTemplate,
        });

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not an assigned referee to this submission');
    });
  });

  describe('Update review', () => {
    let review: JournalSubmissionReview;
    beforeEach(async () => {
      review = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: submission.id,
          refereeAssignmentId: refereeAssignment.id,
          journalId: journal.id,
        },
      });

      response = await request
        .put(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}`)
        .set('authorization', `Bearer ${referee.token}`)
        .send({
          review: reviewTemplate,
          recommendation: ReviewDecision.ACCEPT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
        });
    });

    it('should update a journal submission review', async () => {
      // console.log({ response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const body = response.body as { ok: boolean; data: JournalSubmissionReview };
      expect(response.status).to.equal(200);
      expect(body.ok).to.be.true;
      expect(body.data.submissionId).to.be.equal(submission.id);
      expect(body.data.refereeAssignmentId).to.be.equal(refereeAssignment.id);
      expect(JSON.stringify(body.data.review)).to.be.equal(JSON.stringify(reviewTemplate));
      expect(body.data.submittedAt).to.be.null;
      expect(body.data.journalId).to.be.equal(journal.id);
      expect(body.data.recommendation).to.be.equal(ReviewDecision.ACCEPT);
      expect(body.data.editorFeedback).to.be.equal('Editor feedback');
      expect(body.data.authorFeedback).to.be.equal('Author feedback');
    });

    it('should prevent unAuthorised user from updating a review', async () => {
      response = await request
        .put(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send({
          review: reviewTemplate,
          recommendation: ReviewDecision.ACCEPT,
        });

      // console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not an assigned referee to this submission');
    });

    it('should prevent associate editor from updating a review', async () => {
      response = await request
        .put(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}`)
        .set('authorization', `Bearer ${associateEditor.token}`)
        .send({
          review: reviewTemplate,
          recommendation: ReviewDecision.ACCEPT,
        });

      // console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not an assigned referee to this submission');
    });
  });

  describe('Submit review', () => {
    let review: JournalSubmissionReview;

    const submitReview = async (review: JournalSubmissionReview, update: Partial<JournalSubmissionReview>) => {
      return await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}/submit`)
        .set('authorization', `Bearer ${referee.token}`)
        .send(update);
    };

    beforeEach(async () => {
      review = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: submission.id,
          refereeAssignmentId: refereeAssignment.id,
          journalId: journal.id,
        },
      });
    });

    it('should prevent empty review from being submitted', async () => {
      const response = await submitReview(review, { review: '' });

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(400);
    });

    it('should submit a review', async () => {
      const response = await submitReview(review, {
        review: reviewTemplate,
        recommendation: ReviewDecision.ACCEPT,
        editorFeedback: 'Editor feedback',
        authorFeedback: 'Author feedback',
      });

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(200);
      expect(response.body.ok).to.be.true;
      expect(response.body.data.submittedAt).to.not.be.null;
      expect(response.body.data.recommendation).to.be.equal(ReviewDecision.ACCEPT);
      expect(response.body.data.editorFeedback).to.be.equal('Editor feedback');
      expect(response.body.data.authorFeedback).to.be.equal('Author feedback');
      expect(response.body.data.review).to.not.be.null;
    });

    it('should prevent unAuthorised user from submitting a review', async () => {
      response = await request
        .post(`/v1/journals/${journal.id}/submissions/${submission.id}/reviews/${review.id}/submit`)
        .set('authorization', `Bearer ${unAuthorisedUser.token}`)
        .send({
          review: reviewTemplate,
          recommendation: ReviewDecision.ACCEPT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
        });

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not an assigned referee to this submission');
    });
  });

  describe('Journal review getter routes', () => {
    let review: JournalSubmissionReview;
    // let acceptedSubmission: JournalSubmission;
    let acceptedSubmissionReview: JournalSubmissionReview;
    // let revisedSubmission: JournalSubmission;
    // let revisedSubmissionReview: JournalSubmissionReview;
    // let rejectedSubmission: JournalSubmission;
    // let rejectedSubmissionReview: JournalSubmissionReview;

    beforeEach(async () => {
      review = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: submission.id,
          refereeAssignmentId: refereeAssignment.id,
          journalId: journal.id,
        },
      });

      // create an accepted review
      const {
        submission: acceptedSubmission,
        refereeAssignment: acceptedRefereeAssignment,
        node: acceptedNode,
      } = await setUpSubmission();
      acceptedSubmissionReview = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: acceptedSubmission.id,
          refereeAssignmentId: acceptedRefereeAssignment.id,
          journalId: journal.id,
          review: reviewTemplate,
          recommendation: ReviewDecision.ACCEPT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
        },
      });

      // create a revised review
      const {
        submission: revisedSubmission,
        refereeAssignment: revisedRefereeAssignment,
        node: revisedNode,
      } = await setUpSubmission();
      await prisma.journalSubmissionReview.create({
        data: {
          submissionId: revisedSubmission.id,
          refereeAssignmentId: revisedRefereeAssignment.id,
          journalId: journal.id,
          review: reviewTemplate,
          recommendation: ReviewDecision.MINOR_REVISION,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
        },
      });

      // setup rejected submission and review
      const {
        submission: rejectedSubmission,
        refereeAssignment: rejectedRefereeAssignment,
        node: rejectedNode,
      } = await setUpSubmission();
      await prisma.journalSubmissionReview.create({
        data: {
          submissionId: rejectedSubmission.id,
          refereeAssignmentId: rejectedRefereeAssignment.id,
          journalId: journal.id,
          review: reviewTemplate,
          recommendation: ReviewDecision.REJECT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
        },
      });
    });

    it('should restrict author from viewing only completed reviews', async () => {
      const response = await getReviewById(review.id, author);

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });

      expect(response.status).to.equal(400);
    });

    it('should prevent unauthorised user from viewing reviews', async () => {
      let response = await getSubmissionReviews(submission, unAuthorisedUser);
      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      expect(response.status).to.equal(200);
      expect(response.body.data).to.be.an('array').that.is.empty;

      response = await getReviewById(acceptedSubmissionReview.id, unAuthorisedUser);
      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      expect(response.status).to.equal(200);
      expect(response.body).to.be.null;
    });

    it('should allow associate editors to view all reviews', async () => {
      const response = await getSubmissionReviews(submission, associateEditor);

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const reviews = response.body as { ok: boolean; data: JournalSubmissionReview[] };
      expect(response.status).to.equal(200);
      expect(reviews.data.length).to.be.equal(4);
    });

    it('should allow journal chief editor to view all reviews', async () => {
      const response = await getSubmissionReviews(submission, chiefEditor);

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const reviews = response.body as { ok: boolean; data: JournalSubmissionReview[] };
      expect(response.status).to.equal(200);
      expect(reviews.data.length).to.be.equal(4);
    });

    it('should allow referees to view their own reviews', async () => {
      const response = await getSubmissionReviews(submission, referee);

      console.log({ status: response.status, response: JSON.stringify(sanitizeBigInts(response.body), null, 2) });
      const reviews = response.body as { ok: boolean; data: JournalSubmissionReview[] };
    });
  });
});
