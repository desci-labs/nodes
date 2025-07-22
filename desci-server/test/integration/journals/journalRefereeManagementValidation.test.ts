import 'mocha';
import { Journal, User, JournalSubmission, EditorRole, Node } from '@prisma/client';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../../../src/client.js';
import { server } from '../../../src/server.js';
import { JournalManagementService } from '../../../src/services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../src/services/journals/JournalRefereeManagementService.js';
import { journalSubmissionService } from '../../../src/services/journals/JournalSubmissionService.js';
import { createDraftNode, publishMockNode } from '../../util.js';

server.ready().then((_) => {
  console.log('Referee Management Validation Test Server is ready');
});

const app = server.server;

describe('Journal Referee Management Validation', () => {
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
    await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;

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

    // Create a journal with custom settings for testing boundaries
    const journalResult = await JournalManagementService.createJournal({
      name: 'Test Journal for Validation',
      description: 'Testing validation boundaries',
      ownerId: chiefEditor.id,
    });
    // Use match to handle the Result properly
    journal = journalResult.match(
      (j) => j,
      (error) => {
        throw error;
      },
    );

    // Update journal with specific settings for validation testing
    await prisma.journal.update({
      where: { id: journal.id },
      data: {
        settings: {
          reviewDueHours: {
            min: 48, // 2 days
            max: 240, // 10 days
            default: 96, // 4 days
          },
          refereeInviteExpiryHours: {
            min: 24, // 1 day
            max: 120, // 5 days
            default: 72, // 3 days
          },
          refereeCount: {
            value: 2,
          },
        },
      },
    });

    // Add associate editor
    await prisma.journalEditor.create({
      data: {
        journalId: journal.id,
        userId: associateEditor.id,
        role: EditorRole.ASSOCIATE_EDITOR,
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
    });

    // Create and publish a test node
    testNode = await createDraftNode({
      title: 'Test Validation Node',
      ownerId: authorUser.id,
      manifestUrl: 'https://example.com/manifest.json',
      replicationFactor: 1,
      uuid: uuidv4(),
    });
    await publishMockNode(testNode, new Date());
    testNode = (await prisma.node.findFirst({ where: { id: testNode.id } }))!;

    // Create a submission
    submission = await journalSubmissionService.createSubmission({
      journalId: journal.id,
      authorId: authorUser.id,
      dpid: testNode.dpidAlias!,
      version: 1,
    });

    // Assign submission to associate editor
    await prisma.journalSubmission.update({
      where: { id: submission.id },
      data: { assignedEditorId: associateEditor.id },
    });
  });

  describe('Service Layer Validation', () => {
    describe('inviteReferee - relativeDueDateHrs validation', () => {
      it('should accept valid relativeDueDateHrs within bounds', async () => {
        const validValues = [48, 96, 150, 240]; // min, default, middle, max

        for (const relativeDueDateHrs of validValues) {
          const result = await JournalRefereeManagementService.inviteReferee({
            submissionId: submission.id,
            refereeUserId: refereeUser.id,
            managerUserId: associateEditor.id,
            relativeDueDateHrs,
          });

          expect(result.isOk()).to.be.true;
          if (result.isOk()) {
            result.match(
              (invite) => expect(invite.relativeDueDateHrs).to.equal(relativeDueDateHrs),
              () => {
                throw new Error('Expected success');
              },
            );
          }

          // Clean up for next iteration
          await prisma.refereeInvite.deleteMany({
            where: { submissionId: submission.id },
          });
        }
      });

      it('should reject relativeDueDateHrs below minimum', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          relativeDueDateHrs: 24, // Below min of 48
        });

        expect(result.isErr()).to.be.true;
        if (result.isErr()) {
          result.match(
            () => {
              throw new Error('Expected error');
            },
            (error) => expect(error.message).to.equal('Review due date must be between 48 and 240 hours'),
          );
        }
      });

      it('should reject relativeDueDateHrs above maximum', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          relativeDueDateHrs: 300, // Above max of 240
        });

        expect(result.isErr()).to.be.true;
        if (result.isErr()) {
          result.match(
            () => {
              throw new Error('Expected error');
            },
            (error) => expect(error.message).to.equal('Review due date must be between 48 and 240 hours'),
          );
        }
      });

      it('should use default relativeDueDateHrs when not provided', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          // relativeDueDateHrs not provided
        });

        expect(result.isOk()).to.be.true;
        if (result.isOk()) {
          result.match(
            (invite) => expect(invite.relativeDueDateHrs).to.equal(96), // default from settings
            () => {
              throw new Error('Expected success');
            },
          );
        }
      });
    });

    describe('inviteReferee - inviteExpiryHours validation', () => {
      it('should accept valid inviteExpiryHours within bounds', async () => {
        const validValues = [24, 72, 96, 120]; // min, default, middle, max

        for (const inviteExpiryHours of validValues) {
          const result = await JournalRefereeManagementService.inviteReferee({
            submissionId: submission.id,
            refereeUserId: refereeUser.id,
            managerUserId: associateEditor.id,
            inviteExpiryHours,
          });

          expect(result.isOk()).to.be.true;

          if (result.isOk()) {
            // Check that the invite expires at the correct time
            const now = Date.now();
            const expectedExpiryTime = now + inviteExpiryHours * 60 * 60 * 1000;

            result.match(
              (invite) => {
                const actualExpiryTime = invite.expiresAt.getTime();
                // Allow 1 second tolerance for processing time
                expect(Math.abs(actualExpiryTime - expectedExpiryTime)).to.be.lessThan(1000);
              },
              () => {
                throw new Error('Expected success');
              },
            );
          }

          // Clean up for next iteration
          await prisma.refereeInvite.deleteMany({
            where: { submissionId: submission.id },
          });
        }
      });

      it('should reject inviteExpiryHours below minimum', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          inviteExpiryHours: 12, // Below min of 24
        });

        expect(result.isErr()).to.be.true;
        if (result.isErr()) {
          expect(result._unsafeUnwrapErr().message).to.equal('Invite expiry must be between 24 and 120 hours');
        }
      });

      it('should reject inviteExpiryHours above maximum', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          inviteExpiryHours: 200, // Above max of 120
        });

        expect(result.isErr()).to.be.true;
        if (result.isErr()) {
          expect(result._unsafeUnwrapErr().message).to.equal('Invite expiry must be between 24 and 120 hours');
        }
      });

      it('should use default inviteExpiryHours when not provided', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          // inviteExpiryHours not provided
        });

        expect(result.isOk()).to.be.true;

        if (result.isOk()) {
          // Check that the invite expires at the default time (72 hours)
          const now = Date.now();
          const expectedExpiryTime = now + 72 * 60 * 60 * 1000; // 72 hours in ms
          const actualExpiryTime = result._unsafeUnwrap().expiresAt.getTime();

          // Allow 1 second tolerance for processing time
          expect(Math.abs(actualExpiryTime - expectedExpiryTime)).to.be.lessThan(1000);
        }
      });
    });

    describe('inviteReferee - combined validation', () => {
      it('should validate both relativeDueDateHrs and inviteExpiryHours together', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          relativeDueDateHrs: 144, // 6 days - valid
          inviteExpiryHours: 48, // 2 days - valid
        });

        expect(result.isOk()).to.be.true;
        if (result.isOk()) {
          expect(result._unsafeUnwrap().relativeDueDateHrs).to.equal(144);

          const now = Date.now();
          const expectedExpiryTime = now + 48 * 60 * 60 * 1000;
          const actualExpiryTime = result._unsafeUnwrap().expiresAt.getTime();
          expect(Math.abs(actualExpiryTime - expectedExpiryTime)).to.be.lessThan(1000);
        }
      });

      it('should fail if relativeDueDateHrs is invalid even with valid inviteExpiryHours', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          relativeDueDateHrs: 300, // Invalid - above max
          inviteExpiryHours: 48, // Valid
        });

        expect(result.isErr()).to.be.true;
        if (result.isErr()) {
          expect(result._unsafeUnwrapErr().message).to.equal('Review due date must be between 48 and 240 hours');
        }
      });

      it('should fail if inviteExpiryHours is invalid even with valid relativeDueDateHrs', async () => {
        const result = await JournalRefereeManagementService.inviteReferee({
          submissionId: submission.id,
          refereeUserId: refereeUser.id,
          managerUserId: associateEditor.id,
          relativeDueDateHrs: 144, // Valid
          inviteExpiryHours: 200, // Invalid - above max
        });

        expect(result.isErr()).to.be.true;
        if (result.isErr()) {
          expect(result._unsafeUnwrapErr().message).to.equal('Invite expiry must be between 24 and 120 hours');
        }
      });
    });
  });

  describe('API Endpoint Validation', () => {
    describe('POST /journals/:journalId/submissions/:submissionId/referee/invite', () => {
      it('should accept valid relativeDueDateHrs and inviteExpiryHours', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/submissions/${submission.id}/referee/invite`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`)
          .send({
            refereeUserId: refereeUser.id,
            relativeDueDateHrs: 120, // Valid - 5 days
            inviteExpiryHours: 48, // Valid - 2 days
          });

        expect(res.status).to.equal(200);
        expect(res.body.data.invite.relativeDueDateHrs).to.equal(120);
      });

      it('should return 400 for invalid relativeDueDateHrs', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/submissions/${submission.id}/referee/invite`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`)
          .send({
            refereeUserId: refereeUser.id,
            relativeDueDateHrs: 24, // Invalid - below min of 48
          });

        expect(res.status).to.equal(400);
        expect(res.body.message).to.equal('Review due date must be between 48 and 240 hours');
      });

      it('should return 400 for invalid inviteExpiryHours', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/submissions/${submission.id}/referee/invite`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`)
          .send({
            refereeUserId: refereeUser.id,
            inviteExpiryHours: 12, // Invalid - below min of 24
          });

        expect(res.status).to.equal(400);
        expect(res.body.message).to.equal('Invite expiry must be between 24 and 120 hours');
      });

      it('should use defaults when relativeDueDateHrs and inviteExpiryHours not provided', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/submissions/${submission.id}/referee/invite`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`)
          .send({
            refereeUserId: refereeUser.id,
            // No relativeDueDateHrs or inviteExpiryHours provided
          });

        expect(res.status).to.equal(200);
        expect(res.body.data.invite.relativeDueDateHrs).to.equal(96); // default from settings
      });

      it('should validate against journal-specific settings', async () => {
        // Create another journal with different settings
        const strictJournalResult = await JournalManagementService.createJournal({
          name: 'Strict Journal',
          ownerId: chiefEditor.id,
        });
        if (strictJournalResult.isErr()) throw strictJournalResult.error;
        const strictJournal = strictJournalResult._unsafeUnwrap();

        // Update with very strict settings
        await prisma.journal.update({
          where: { id: strictJournal.id },
          data: {
            settings: {
              reviewDueHours: {
                min: 72, // 3 days min
                max: 168, // 7 days max
                default: 120, // 5 days default
              },
              refereeInviteExpiryHours: {
                min: 48, // 2 days min
                max: 96, // 4 days max
                default: 72, // 3 days default
              },
              refereeCount: {
                value: 1,
              },
            },
          },
        });

        // Add associate editor to strict journal
        await prisma.journalEditor.create({
          data: {
            journalId: strictJournal.id,
            userId: associateEditor.id,
            role: EditorRole.ASSOCIATE_EDITOR,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        });

        // Create submission for strict journal
        const strictSubmission = await journalSubmissionService.createSubmission({
          journalId: strictJournal.id,
          authorId: authorUser.id,
          dpid: testNode.dpidAlias!,
          version: 1,
        });

        // A value that was valid for the first journal should be invalid for the strict journal
        const res = await request(app)
          .post(`/v1/journals/${strictJournal.id}/submissions/${strictSubmission.id}/referee/invite`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`)
          .send({
            refereeUserId: refereeUser.id,
            relativeDueDateHrs: 48, // Valid for first journal, but below min (72) for strict journal
          });

        expect(res.status).to.equal(400);
        expect(res.body.message).to.equal('Review due date must be between 72 and 168 hours');
      });
    });
  });

  describe('Referee Count Validation', () => {
    it('should respect journal-specific referee count limits', async () => {
      // First invite should succeed
      const firstInviteResult = await JournalRefereeManagementService.inviteReferee({
        submissionId: submission.id,
        refereeUserId: refereeUser.id,
        managerUserId: associateEditor.id,
      });
      expect(firstInviteResult.isOk()).to.be.true;

      // Accept first invite
      const acceptResult = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: firstInviteResult._unsafeUnwrap().token,
        userId: refereeUser.id,
      });
      expect(acceptResult.isOk()).to.be.true;

      // Create another referee user
      const secondReferee = await prisma.user.create({
        data: { email: 'referee2@example.com', name: 'Second Referee' },
      });

      // Second invite should succeed (journal allows 2 referees)
      const secondInviteResult = await JournalRefereeManagementService.inviteReferee({
        submissionId: submission.id,
        refereeUserId: secondReferee.id,
        managerUserId: associateEditor.id,
      });
      expect(secondInviteResult.isOk()).to.be.true;

      // Accept second invite
      const secondAcceptResult = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: secondInviteResult._unsafeUnwrap().token,
        userId: secondReferee.id,
      });
      expect(secondAcceptResult.isOk()).to.be.true;

      // Create third referee user
      const thirdReferee = await prisma.user.create({
        data: { email: 'referee3@example.com', name: 'Third Referee' },
      });

      // Third invite should succeed (can always invite)
      const thirdInviteResult = await JournalRefereeManagementService.inviteReferee({
        submissionId: submission.id,
        refereeUserId: thirdReferee.id,
        managerUserId: associateEditor.id,
      });
      expect(thirdInviteResult.isOk()).to.be.true;

      // But accepting third invite should fail (exceeds limit of 2)
      const thirdAcceptResult = await JournalRefereeManagementService.acceptRefereeInvite({
        inviteToken: thirdInviteResult._unsafeUnwrap().token,
        userId: thirdReferee.id,
      });
      expect(thirdAcceptResult.isErr()).to.be.true;
      if (thirdAcceptResult.isErr()) {
        expect(thirdAcceptResult._unsafeUnwrapErr().message).to.equal(
          'Maximum number of referees (2) already assigned',
        );
      }
    });
  });
});
