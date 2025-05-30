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

      expect(response.status).to.equal(400);
    });

    it('should submit a review', async () => {
      const response = await submitReview(review, {
        review: reviewTemplate,
        recommendation: ReviewDecision.ACCEPT,
        editorFeedback: 'Editor feedback',
        authorFeedback: 'Author feedback',
      });

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

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('User is not an assigned referee to this submission');
    });
  });

  describe('Journal review getter routes', () => {
    let review: JournalSubmissionReview;
    let acceptedSubmissionReview: JournalSubmissionReview;
    let revisedSubmissionReview: JournalSubmissionReview;
    let rejectedSubmissionReview: JournalSubmissionReview;

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
      } = await setUpSubmission(SubmissionStatus.ACCEPTED);
      acceptedSubmissionReview = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: acceptedSubmission.id,
          refereeAssignmentId: acceptedRefereeAssignment.id,
          journalId: journal.id,
          review: reviewTemplate,
          recommendation: ReviewDecision.ACCEPT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
          submittedAt: new Date(),
        },
      });

      // create a revised review
      const {
        submission: revisedSubmission,
        refereeAssignment: revisedRefereeAssignment,
        node: revisedNode,
      } = await setUpSubmission(SubmissionStatus.REVISION_REQUESTED);
      revisedSubmissionReview = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: revisedSubmission.id,
          refereeAssignmentId: revisedRefereeAssignment.id,
          journalId: journal.id,
          review: reviewTemplate,
          recommendation: ReviewDecision.MINOR_REVISION,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
          submittedAt: new Date(),
        },
      });

      // setup rejected submission and review
      const {
        submission: rejectedSubmission,
        refereeAssignment: rejectedRefereeAssignment,
        node: rejectedNode,
      } = await setUpSubmission(SubmissionStatus.REJECTED);
      rejectedSubmissionReview = await prisma.journalSubmissionReview.create({
        data: {
          submissionId: rejectedSubmission.id,
          refereeAssignmentId: rejectedRefereeAssignment.id,
          journalId: journal.id,
          review: reviewTemplate,
          recommendation: ReviewDecision.REJECT,
          editorFeedback: 'Editor feedback',
          authorFeedback: 'Author feedback',
          submittedAt: new Date(),
        },
      });
    });

    it('should restrict author to viewing only completed reviews', async () => {
      const responses = await Promise.all([
        getSubmissionReviews(submission.id, author),
        getSubmissionReviews(acceptedSubmissionReview.submissionId, author),
        getSubmissionReviews(revisedSubmissionReview.submissionId, author),
        getSubmissionReviews(rejectedSubmissionReview.submissionId, author),
      ]);

      // author cannot view reviews for submissions that are not under review
      expect(responses[0].status).to.equal(200);
      expect(responses[0].body.data).to.be.an('array').of.length(0);

      // author can view reviews for submissions that are accepted
      expect(responses[1].status).to.equal(200);
      expect(responses[1].body.data).to.be.an('array').of.length(1);

      // author can view reviews for submissions that are revised
      expect(responses[2].status).to.equal(200);
      expect(responses[2].body.data).to.be.an('array').of.length(1);

      // author can view reviews for submissions that are rejected
      expect(responses[3].status).to.equal(200);
      expect(responses[3].body.data).to.be.an('array').of.length(1);
    });

    it('should restrict author from viewing details of unsubmitted reviews and allowing them to view submitted reviews', async () => {
      // assert author cannot view details of unsubmitted reviews
      let response = await getReviewById(review.id, author);
      expect(response.status).to.equal(200);
      expect(response.body.data).to.be.null;

      // assert author can view details of submitted reviews
      response = await getReviewById(acceptedSubmissionReview.id, author);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(acceptedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert author can view details of submitted reviews
      response = await getReviewById(revisedSubmissionReview.id, author);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(revisedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert author can view details of submitted reviews
      response = await getReviewById(rejectedSubmissionReview.id, author);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(rejectedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;
    });

    it('should prevent unauthorised user from viewing reviews', async () => {
      let response = await getSubmissionReviews(acceptedSubmissionReview.submissionId, unAuthorisedUser);
      expect(response.status).to.equal(200);
      expect(response.body.data).to.be.an('array').that.is.empty;

      response = await getReviewById(acceptedSubmissionReview.id, unAuthorisedUser);
      expect(response.status).to.equal(200);
      expect(response.body.data).to.be.null;
    });

    it('should allow associate editors to view all reviews', async () => {
      const responses = await Promise.all([
        getSubmissionReviews(submission.id, associateEditor),
        getSubmissionReviews(acceptedSubmissionReview.submissionId, associateEditor),
        getSubmissionReviews(revisedSubmissionReview.submissionId, associateEditor),
        getSubmissionReviews(rejectedSubmissionReview.submissionId, associateEditor),
      ]);

      // associate editor can view reviews for submissions that are not under review
      expect(responses[0].status).to.equal(200);
      expect(responses[0].body.data).to.be.an('array').of.length(1);
      expect(responses[0].body.data[0].id).to.be.equal(review.id);

      // associate editor can view reviews for submissions that are accepted
      expect(responses[1].status).to.equal(200);
      expect(responses[1].body.data).to.be.an('array').of.length(1);
      expect(responses[1].body.data[0].id).to.be.equal(acceptedSubmissionReview.id);

      // associate editor can view reviews for submissions that are revised
      expect(responses[2].status).to.equal(200);
      expect(responses[2].body.data).to.be.an('array').of.length(1);
      expect(responses[2].body.data[0].id).to.be.equal(revisedSubmissionReview.id);

      // associate editor can view reviews for submissions that are rejected
      expect(responses[3].status).to.equal(200);
      expect(responses[3].body.data).to.be.an('array').of.length(1);
      expect(responses[3].body.data[0].id).to.be.equal(rejectedSubmissionReview.id);
    });

    it('should allow associate editors to view details of submitted reviews', async () => {
      // assert associate editor cannot view details of unsubmitted reviews
      let response = await getReviewById(review.id, associateEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(review.id);
      expect(response.body.data.submittedAt).to.be.null;

      // assert associate editor can view details of submitted reviews
      response = await getReviewById(acceptedSubmissionReview.id, associateEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(acceptedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert associate editor can view details of submitted reviews
      response = await getReviewById(revisedSubmissionReview.id, associateEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(revisedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert associate editor can view details of submitted reviews
      response = await getReviewById(rejectedSubmissionReview.id, associateEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(rejectedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;
    });

    it('should allow journal chief editor to view all reviews', async () => {
      const responses = await Promise.all([
        getSubmissionReviews(submission.id, chiefEditor),
        getSubmissionReviews(acceptedSubmissionReview.submissionId, chiefEditor),
        getSubmissionReviews(revisedSubmissionReview.submissionId, chiefEditor),
        getSubmissionReviews(rejectedSubmissionReview.submissionId, chiefEditor),
      ]);

      // associate editor can view reviews for submissions that are not under review
      expect(responses[0].status).to.equal(200);
      expect(responses[0].body.data).to.be.an('array').of.length(1);
      expect(responses[0].body.data[0].id).to.be.equal(review.id);

      // associate editor can view reviews for submissions that are accepted
      expect(responses[1].status).to.equal(200);
      expect(responses[1].body.data).to.be.an('array').of.length(1);
      expect(responses[1].body.data[0].id).to.be.equal(acceptedSubmissionReview.id);

      // associate editor can view reviews for submissions that are revised
      expect(responses[2].status).to.equal(200);
      expect(responses[2].body.data).to.be.an('array').of.length(1);
      expect(responses[2].body.data[0].id).to.be.equal(revisedSubmissionReview.id);

      // associate editor can view reviews for submissions that are rejected
      expect(responses[3].status).to.equal(200);
      expect(responses[3].body.data).to.be.an('array').of.length(1);
      expect(responses[3].body.data[0].id).to.be.equal(rejectedSubmissionReview.id);
    });

    it('should allow chief editors to view details of submitted reviews', async () => {
      // assert chief editor cannot view details of unsubmitted reviews
      let response = await getReviewById(review.id, chiefEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(review.id);
      expect(response.body.data.submittedAt).to.be.null;

      // assert chief editor can view details of submitted reviews
      response = await getReviewById(acceptedSubmissionReview.id, chiefEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(acceptedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert chief editor can view details of submitted reviews
      response = await getReviewById(revisedSubmissionReview.id, chiefEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(revisedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert chief editor can view details of submitted reviews
      response = await getReviewById(rejectedSubmissionReview.id, chiefEditor);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(rejectedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;
    });

    it('should allow referees to view their own reviews', async () => {
      const responses = await Promise.all([
        getSubmissionReviews(submission.id, referee),
        getSubmissionReviews(acceptedSubmissionReview.submissionId, referee),
        getSubmissionReviews(revisedSubmissionReview.submissionId, referee),
        getSubmissionReviews(rejectedSubmissionReview.submissionId, referee),
      ]);

      // associate editor can view reviews for submissions that are not under review
      expect(responses[0].status).to.equal(200);
      expect(responses[0].body.data).to.be.an('array').of.length(1);
      expect(responses[0].body.data[0].id).to.be.equal(review.id);

      // associate editor can view reviews for submissions that are accepted
      expect(responses[1].status).to.equal(200);
      expect(responses[1].body.data).to.be.an('array').of.length(1);
      expect(responses[1].body.data[0].id).to.be.equal(acceptedSubmissionReview.id);

      // associate editor can view reviews for submissions that are revised
      expect(responses[2].status).to.equal(200);
      expect(responses[2].body.data).to.be.an('array').of.length(1);
      expect(responses[2].body.data[0].id).to.be.equal(revisedSubmissionReview.id);

      // associate editor can view reviews for submissions that are rejected
      expect(responses[3].status).to.equal(200);
      expect(responses[3].body.data).to.be.an('array').of.length(1);
      expect(responses[3].body.data[0].id).to.be.equal(rejectedSubmissionReview.id);
    });

    it('should allow referees to view details of submitted reviews', async () => {
      // assert referee cannot view details of unsubmitted reviews
      let response = await getReviewById(review.id, referee);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(review.id);
      expect(response.body.data.submittedAt).to.be.null;

      // assert referee can view details of submitted reviews
      response = await getReviewById(acceptedSubmissionReview.id, referee);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(acceptedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert referee can view details of submitted reviews
      response = await getReviewById(revisedSubmissionReview.id, referee);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(revisedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;

      // assert referee can view details of submitted reviews
      response = await getReviewById(rejectedSubmissionReview.id, referee);
      expect(response.status).to.equal(200);
      expect(response.body.data.id).to.be.equal(rejectedSubmissionReview.id);
      expect(response.body.data.submittedAt).to.not.be.null;
    });
  });
});
