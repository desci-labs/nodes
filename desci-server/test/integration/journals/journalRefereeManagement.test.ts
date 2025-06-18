import 'mocha';
import {
  Journal,
  User,
  JournalSubmission,
  RefereeInvite,
  RefereeAssignment,
  EditorRole,
  JournalEventLogAction,
  Node,
} from '@prisma/client';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../../src/client.js';
import { server } from '../../../src/server.js';
import { JournalManagementService } from '../../../src/services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../src/services/journals/JournalRefereeManagementService.js';
import { journalSubmissionService } from '../../../src/services/journals/JournalSubmissionService.js';
import { publishMockNode } from '../../util.js';

server.ready().then((_) => {
  console.log('Referee Management Test Server is ready');
});
export const app = server.app;

describe('Journal Referee Management Service', () => {
  let chiefEditor: User;
  let associateEditor: User;
  let refereeUser: User;
  let authorUser: User;
  let journal: Journal;
  let submission: JournalSubmission;
  let testNode: Node;

  let chiefEditorAuthToken: string;
  let associateEditorAuthToken: string;
  let refereeUserAuthToken: string;
  let authorUserAuthToken: string;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmission" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "RefereeInvite" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "RefereeAssignment" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;

    // Create users
    chiefEditor = await prisma.user.create({
      data: { email: 'chief@example.com', name: 'Chief Editor' },
    });
    associateEditor = await prisma.user.create({
      data: { email: 'associate@example.com', name: 'Associate Editor' },
    });
    refereeUser = await prisma.user.create({
      data: { email: 'referee@example.com', name: 'Referee User' },
    });
    authorUser = await prisma.user.create({
      data: { email: 'author@example.com', name: 'Author User' },
    });

    // Create auth tokens
    chiefEditorAuthToken = jwt.sign({ email: chiefEditor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    associateEditorAuthToken = jwt.sign({ email: associateEditor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    refereeUserAuthToken = jwt.sign({ email: refereeUser.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    authorUserAuthToken = jwt.sign({ email: authorUser.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    // Create a journal
    const journalResult = await JournalManagementService.createJournal({
      name: 'Test Journal for Referees',
      description: 'A journal to test referee management',
      ownerId: chiefEditor.id,
    });
    if (journalResult.isErr()) throw journalResult.error;
    journal = journalResult.value;

    // Add associate editor to the journal
    await prisma.journalEditor.create({
      data: {
        journalId: journal.id,
        userId: associateEditor.id,
        role: EditorRole.ASSOCIATE_EDITOR,
        inviterId: chiefEditor.id,
        acceptedAt: new Date(),
      },
    });

    // Create a dummy node and a Dpid record (if necessary for createSubmission)
    const testNodeDraft = await prisma.node.create({
      data: {
        title: 'Test Submission Node',
        uuid: 'test-node-uuid-submission' + Math.random().toString(36).substring(7),
        manifestUrl: 'test-manifest-url',
        replicationFactor: 0,
        ownerId: authorUser.id,
      },
    });
    await publishMockNode(testNodeDraft, new Date());

    testNode = (await prisma.node.findUnique({ where: { id: testNodeDraft.id } })) as Node;

    const submissionPayload = {
      journalId: journal.id,
      authorId: authorUser.id,
      dpid: testNode.dpidAlias!,
      version: 1,
    };
    submission = await journalSubmissionService.createSubmission(submissionPayload);

    // Assign associate editor to the submission
    const updatedSubmission = await journalSubmissionService.assignSubmissionToEditor({
      submissionId: submission.id,
      editorId: associateEditor.id,
      assignerId: chiefEditor.id, // Chief editor assigns
    });
    // submission object now includes assignedEditorId from the update
    submission = { ...submission, ...updatedSubmission };
  });

  afterEach(async () => {});

  describe('inviteReferee', () => {
    it('should successfully invite a referee', async () => {
      const inviteInput = {
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerUserId: associateEditor.id,
        relativeDueDateHrs: 7 * 24, // 7 days
      };
      const result = await JournalRefereeManagementService.inviteReferee(inviteInput);
      expect(result.isOk()).to.be.true;
      const invite = result._unsafeUnwrap();
      expect(invite.submissionId).to.equal(submission.id);
      expect(invite.userId).to.equal(refereeUser.id);
      expect(invite.invitedById).to.equal(associateEditor.id);
      expect(invite.email).to.equal(refereeUser.email);
      expect(invite.token).to.be.a('string');

      const eventLog = await prisma.journalEventLog.findFirst({
        where: {
          action: JournalEventLogAction.REFEREE_INVITED,
          details: { path: ['submissionId'], equals: submission.id },
        },
      });
      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).to.equal(associateEditor.id);
    });

    it('should return error if referee user not found', async () => {
      const inviteInput = {
        submissionId: submission.id,
        refereeUserId: 9999, // Non-existent user
        managerUserId: associateEditor.id,
      };
      const result = await JournalRefereeManagementService.inviteReferee(inviteInput);
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee not found');
    });

    it('should return error if submission not found', async () => {
      const inviteInput = {
        submissionId: 9999, // Non-existent submission
        refereeUserId: refereeUser.id,
        managerUserId: associateEditor.id,
      };
      const result = await JournalRefereeManagementService.inviteReferee(inviteInput);
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Submission not found');
    });
  });

  describe('acceptRefereeInvite', () => {
    let invite: RefereeInvite;

    beforeEach(async () => {
      const inviteInput = {
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerUserId: associateEditor.id,
        relativeDueDateHrs: 72, // 3 days
      };
      const inviteResult = await JournalRefereeManagementService.inviteReferee(inviteInput);
      if (inviteResult.isErr()) throw inviteResult.error;
      invite = inviteResult.value;
    });

    it('should successfully accept a valid referee invite', async () => {
      // debugger;
      const result = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: invite.token,
        userId: refereeUser.id,
      });
      expect(result.isOk()).to.be.true;
      const acceptedInvite = result._unsafeUnwrap();
      expect(acceptedInvite.accepted).to.be.true;
      expect(acceptedInvite.acceptedAt).to.be.instanceOf(Date);

      const assignment = await prisma.refereeAssignment.findFirst({
        where: { submissionId: submission.id, refereeId: refereeUser.id },
      });
      expect(assignment).to.not.be.null;
      expect(assignment?.assignedById).to.equal(associateEditor.id);

      const eventLog = await prisma.journalEventLog.findFirst({
        where: {
          action: JournalEventLogAction.REFEREE_ACCEPTED,
          details: { path: ['submissionId'], equals: submission.id },
        },
      });
      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).to.equal(refereeUser.id);
    });

    it('should return error if invite token is invalid', async () => {
      const result = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: 'invalid-token',
        userId: refereeUser.id,
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee invite not found');
    });

    it('should return error if invite is expired', async () => {
      await prisma.refereeInvite.update({
        where: { id: invite.id },
        data: { expiresAt: new Date(Date.now() - 1000) }, // Expired yesterday
      });
      const result = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: invite.token,
        userId: refereeUser.id,
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee invite not valid');
    });

    it('should return error if invite already accepted', async () => {
      await JournalRefereeManagementService.acceptRefereeInvite({
        // First acceptance
        inviteToken: invite.token,
        userId: refereeUser.id,
      });
      const result = await JournalRefereeManagementService.acceptRefereeInvite({
        // Second attempt
        inviteToken: invite.token,
        userId: refereeUser.id,
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee invite not valid');
    });

    it('should return error if invite already declined', async () => {
      await JournalRefereeManagementService.declineRefereeInvite({ inviteToken: invite.token });
      const result = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: invite.token,
        userId: refereeUser.id,
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee invite not valid');
    });

    it('should return error if max referees already assigned', async () => {
      // Create 3 other referees and accept their invites
      for (let i = 0; i < 3; i++) {
        const otherReferee = await prisma.user.create({ data: { email: `other${i}@ref.com`, name: `Other Ref ${i}` } });
        const otherInviteRes = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: otherReferee.id,
          managerUserId: associateEditor.id,
          relativeDueDateHrs: 24,
        });
        if (otherInviteRes.isErr()) throw otherInviteRes.error;
        const acceptRes = await JournalRefereeManagementService.acceptRefereeInvite({
          inviteToken: otherInviteRes.value.token,
          userId: otherReferee.id,
        });
        if (acceptRes.isErr()) throw acceptRes.error;
      }

      const result = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: invite.token, // Current referee's invite
        userId: refereeUser.id,
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Maximum number of referees already assigned');
      const updatedInvite = await prisma.refereeInvite.findUnique({ where: { id: invite.id } });
      expect(updatedInvite?.declined).to.be.true; // Invite should be marked as declined
    });
  });

  describe('assignReferee', () => {
    it('should successfully assign a referee directly', async () => {
      const assignInput = {
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerId: associateEditor.id,
        dueDateHrs: 7 * 24,
        journalId: journal.id,
      };
      const result = await JournalRefereeManagementService.assignReferee(assignInput);
      expect(result.isOk()).to.be.true;
      const assignment = result._unsafeUnwrap();
      expect(assignment.submissionId).to.equal(submission.id);
      expect(assignment.refereeId).to.equal(refereeUser.id);
      expect(assignment.assignedById).to.equal(associateEditor.id);
      expect(assignment.journalId).to.equal(journal.id);
      expect(assignment.dueDate).to.be.instanceOf(Date);

      const eventLog = await prisma.journalEventLog.findFirst({
        where: {
          action: JournalEventLogAction.REFEREE_ACCEPTED,
          details: { path: ['submissionId'], equals: submission.id },
        },
      });
      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).to.equal(refereeUser.id);
    });

    it('should return error if submission not found for assignment', async () => {
      const assignInput = {
        submissionId: 9999, // Non-existent
        refereeUserId: refereeUser.id,
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      };
      const result = await JournalRefereeManagementService.assignReferee(assignInput);
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Submission not found');
    });

    it('should return error if referee user not found for assignment', async () => {
      const assignInput = {
        submissionId: submission.id,
        refereeUserId: 9999, // Non-existent
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      };
      const result = await JournalRefereeManagementService.assignReferee(assignInput);
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee not found');
    });
  });

  describe('declineRefereeInvite', () => {
    let invite: RefereeInvite;

    beforeEach(async () => {
      const inviteInput = {
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerUserId: associateEditor.id,
      };
      const inviteResult = await JournalRefereeManagementService.inviteReferee(inviteInput);
      if (inviteResult.isErr()) throw inviteResult.error;
      invite = inviteResult.value;
    });

    it('should successfully decline a valid referee invite (authed user)', async () => {
      const result = await JournalRefereeManagementService.declineRefereeInvite({
        inviteToken: invite.token,
        userId: refereeUser.id,
      });
      expect(result.isOk()).to.be.true;
      const declinedInvite = result._unsafeUnwrap();
      expect(declinedInvite.declined).to.be.true;
      expect(declinedInvite.declinedAt).to.be.instanceOf(Date);
      expect(declinedInvite.userId).to.equal(refereeUser.id);
    });

    it('should successfully decline a valid referee invite (unauthed/token only)', async () => {
      const result = await JournalRefereeManagementService.declineRefereeInvite({
        inviteToken: invite.token,
        // No userId provided
      });
      expect(result.isOk()).to.be.true;
      const declinedInvite = result._unsafeUnwrap();
      expect(declinedInvite.declined).to.be.true;
      expect(declinedInvite.declinedAt).to.be.instanceOf(Date);
      expect(declinedInvite.userId).to.equal(refereeUser.id); // Should pick up from invite
    });

    it('should return error if invite token is invalid for decline', async () => {
      const result = await JournalRefereeManagementService.declineRefereeInvite({
        inviteToken: 'invalid-token',
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee invite not found');
    });

    it('should return error if invite is expired for decline', async () => {
      await prisma.refereeInvite.update({
        where: { id: invite.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const result = await JournalRefereeManagementService.declineRefereeInvite({
        inviteToken: invite.token,
      });
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee invite not valid');
    });
  });

  describe('getRefereeAssignments', () => {
    let assignment1: RefereeAssignment;
    let assignment2: RefereeAssignment;

    beforeEach(async () => {
      // Create a second referee for multiple assignments
      const anotherReferee = await prisma.user.create({ data: { email: 'ref2@example.com', name: 'Ref Two' } });

      const assign1Res = await JournalRefereeManagementService.assignReferee({
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      });
      if (assign1Res.isErr()) throw assign1Res.error;
      assignment1 = assign1Res.value;

      const assign2Res = await JournalRefereeManagementService.assignReferee({
        submissionId: submission.id,
        refereeUserId: anotherReferee.id,
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      });
      if (assign2Res.isErr()) throw assign2Res.error;
      assignment2 = assign2Res.value;

      // Create a dropped assignment (should not be returned by getActiveRefereeAssignments)
      const droppedReferee = await prisma.user.create({ data: { email: 'dropped@example.com', name: 'Dropped Ref' } });
      const droppedAssignRes = await JournalRefereeManagementService.assignReferee({
        submissionId: submission.id,
        refereeUserId: droppedReferee.id,
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      });
      if (droppedAssignRes.isErr()) throw droppedAssignRes.error;
      await prisma.refereeAssignment.update({
        where: { id: droppedAssignRes.value.id },
        data: { completedAssignment: false }, // Mark as dropped
      });
    });

    // This tests the internal getActiveRefereeAssignments via its usage in acceptRefereeInvite

    it('should get all active assignments for a specific referee', async () => {
      const result = await JournalRefereeManagementService.getRefereeAssignments(refereeUser.id);
      expect(result.isOk()).to.be.true;
      const assignments = result._unsafeUnwrap();
      expect(assignments).to.be.an('array').with.lengthOf(1);
      expect(assignments[0].id).to.equal(assignment1.id);
      // Ensure no dropped assignments are fetched for this specific referee if they had one
    });

    it('should correctly reflect active assignments count when checking max referees (implicit test of getActiveRefereeAssignments)', async () => {
      // This test case in acceptRefereeInvite ('should return error if max referees already assigned')
      // implicitly tests the behavior of the internal getActiveRefereeAssignments.
      let tempNode = await prisma.node.create({
        data: {
          title: 'Temp Node',
          uuid: 'temp-uuid-' + Date.now(),
          manifestUrl: 'temp',
          ownerId: authorUser.id,
          replicationFactor: 0,
        },
      });
      await publishMockNode(tempNode, new Date());
      tempNode = (await prisma.node.findUnique({ where: { id: tempNode.id } })) as Node;

      const submissionXPayload = {
        journalId: journal.id,
        dpid: tempNode.dpidAlias!,
        authorId: authorUser.id,
        version: 1,
      };
      const submissionX = await journalSubmissionService.createSubmission(submissionXPayload);

      const refereesToInvite = 3;
      for (let i = 0; i < refereesToInvite; i++) {
        const tempReferee = await prisma.user.create({
          data: { email: `temp_ref_${i}@example.com`, name: `Temp Ref ${i}` },
        });
        const inviteRes = await JournalRefereeManagementService.inviteReferee({
          submissionId: submissionX.id,
          refereeUserId: tempReferee.id,
          managerUserId: chiefEditor.id,
          relativeDueDateHrs: 24,
        });
        if (inviteRes.isErr()) throw inviteRes.error;

        const acceptRes = await JournalRefereeManagementService.acceptRefereeInvite({
          inviteToken: inviteRes.value.token,
          userId: tempReferee.id,
        });
        if (acceptRes.isErr()) throw acceptRes.error;
      }

      // Now invite one more, it should fail due to MAX_ASSIGNED_REFEREES (which is 3)
      const extraReferee = await prisma.user.create({ data: { email: 'extra_ref@example.com', name: 'Extra Ref' } });
      const extraInviteRes = await JournalRefereeManagementService.inviteReferee({
        submissionId: submissionX.id,
        refereeUserId: extraReferee.id,
        managerUserId: chiefEditor.id,
        relativeDueDateHrs: 24,
      });
      if (extraInviteRes.isErr()) throw extraInviteRes.error;
      const finalAcceptResult = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: extraInviteRes.value.token,
        userId: extraReferee.id,
      });
      expect(finalAcceptResult.isErr()).to.be.true;
      expect(finalAcceptResult._unsafeUnwrapErr().message).to.equal('Maximum number of referees already assigned');

      // Verify the invite for extraReferee was marked as declined
      const declinedInvite = await prisma.refereeInvite.findUnique({ where: { token: extraInviteRes.value.token } });
      expect(declinedInvite?.declined).to.be.true;
    });
  });

  describe('isRefereeAssignedToSubmission', () => {
    beforeEach(async () => {
      await JournalRefereeManagementService.assignReferee({
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      });
    });

    it('should return true if referee is assigned', async () => {
      const result = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
        submission.id,
        refereeUser.id,
        journal.id,
      );
      expect(result.isOk()).to.be.true;
      expect(result._unsafeUnwrap()).to.be.true;
    });

    it('should return false if referee is not assigned', async () => {
      const anotherReferee = await prisma.user.create({ data: { email: 'another@ref.com', name: 'Another Ref' } });
      const result = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
        submission.id,
        anotherReferee.id,
        journal.id,
      );
      expect(result.isOk()).to.be.true;
      expect(result._unsafeUnwrap()).to.be.false;
    });

    it('should return false if submission does not exist for the check', async () => {
      const result = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
        9999,
        refereeUser.id,
        journal.id,
      );
      expect(result.isOk()).to.be.true; // The function itself doesn't error on non-existent submission, just returns false
      expect(result._unsafeUnwrap()).to.be.false;
    });
  });

  describe('invalidateRefereeAssignment', () => {
    let assignment: RefereeAssignment;

    beforeEach(async () => {
      const assignResult = await JournalRefereeManagementService.assignReferee({
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerId: associateEditor.id,
        dueDateHrs: 24,
        journalId: journal.id,
      });
      if (assignResult.isErr()) throw assignResult.error;
      assignment = assignResult.value;
    });

    it('should allow referee to invalidate their own assignment (drop out)', async () => {
      const result = await JournalRefereeManagementService.invalidateRefereeAssignment(assignment.id, refereeUser.id);
      expect(result.isOk()).to.be.true;
      const invalidatedAssignment = result._unsafeUnwrap();
      expect(invalidatedAssignment.completedAssignment).to.be.false;

      const eventLog = await prisma.journalEventLog.findFirst({
        where: {
          action: JournalEventLogAction.REFEREE_ASSIGNMENT_DROPPED,
          details: { path: ['submissionId'], equals: submission.id },
        },
      });
      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).to.equal(refereeUser.id);
      expect((eventLog?.details as any)?.authMethod).to.equal('referee');
    });

    it('should allow assigned editor to invalidate an assignment', async () => {
      const result = await JournalRefereeManagementService.invalidateRefereeAssignment(
        assignment.id,
        associateEditor.id,
      ); // associateEditor is assigned to submission
      expect(result.isOk()).to.be.true;
      const invalidatedAssignment = result._unsafeUnwrap();
      expect(invalidatedAssignment.completedAssignment).to.be.false;
      const eventLog = await prisma.journalEventLog.findFirst({
        where: {
          action: JournalEventLogAction.REFEREE_ASSIGNMENT_DROPPED,
          details: { path: ['triggeredByUserId'], equals: associateEditor.id },
        },
      });
      expect(eventLog).to.not.be.null;
      expect((eventLog?.details as any)?.authMethod).to.equal('editor');
    });

    it('should allow chief editor to invalidate an assignment', async () => {
      const result = await JournalRefereeManagementService.invalidateRefereeAssignment(assignment.id, chiefEditor.id);
      expect(result.isOk()).to.be.true;
      const invalidatedAssignment = result._unsafeUnwrap();
      expect(invalidatedAssignment.completedAssignment).to.be.false;
      const eventLog = await prisma.journalEventLog.findFirst({
        where: {
          action: JournalEventLogAction.REFEREE_ASSIGNMENT_DROPPED,
          details: { path: ['triggeredByUserId'], equals: chiefEditor.id },
        },
      });
      expect(eventLog).to.not.be.null;
      expect((eventLog?.details as any)?.authMethod).to.equal('chiefEditor');
    });

    it('should return error if assignment not found', async () => {
      const result = await JournalRefereeManagementService.invalidateRefereeAssignment(9999, chiefEditor.id);
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Referee assignment not found');
    });

    it('should return error if user is not authorized to invalidate', async () => {
      const unauthorizedUser = await prisma.user.create({ data: { email: 'unauth@example.com', name: 'Unauth User' } });
      const result = await JournalRefereeManagementService.invalidateRefereeAssignment(
        assignment.id,
        unauthorizedUser.id,
      );
      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr().message).to.equal('Unauthorized');
    });
  });
});
