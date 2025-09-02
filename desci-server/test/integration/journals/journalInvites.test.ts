import { EditorRole, Journal, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, it, beforeEach, expect } from 'vitest';

import { prisma } from '../../../src/client.js';
import { JournalInviteService } from '../../../src/services/journals/JournalInviteService.js';
import { app } from '../../testApp.js';

describe('Journal Invite Service', () => {
  let user: User;
  let journal: Journal;
  let editor: User;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "EditorInvite" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;

    user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });

    editor = await prisma.user.create({
      data: {
        email: 'editor@example.com',
        name: 'Editor User',
      },
    });

    journal = await prisma.journal.create({
      data: {
        name: 'Test Journal',
        description: 'A test journal',
      },
    });

    await prisma.journalEditor.create({
      data: {
        journalId: journal.id,
        userId: user.id,
        role: EditorRole.CHIEF_EDITOR,
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
    });
  });

  describe('inviteJournalEditor', () => {
    it('should create an editor invite', async () => {
      const invite = await JournalInviteService.inviteJournalEditor({
        name: 'New Editor',
        journalId: journal.id,
        inviterId: user.id,
        email: 'neweditor@example.com',
        role: EditorRole.ASSOCIATE_EDITOR,
      });

      expect(invite.journalId).toBe(journal.id);
      expect(invite.email).toBe('neweditor@example.com');
      expect(invite.role).toBe(EditorRole.ASSOCIATE_EDITOR);
      expect(invite.token).toBeTypeOf('string');
      expect(invite.expiresAt).toBeInstanceOf(Date);
    });

    it('should create an event log entry when inviting an editor', async () => {
      await JournalInviteService.inviteJournalEditor({
        name: 'Mr. Journal Editor',
        journalId: journal.id,
        inviterId: user.id,
        email: 'neweditor@example.com',
        role: EditorRole.ASSOCIATE_EDITOR,
      });

      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id, action: 'EDITOR_INVITED' },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).toBe(user.id);
      expect(eventLog?.details).to.deep.include({
        email: 'neweditor@example.com',
        role: EditorRole.ASSOCIATE_EDITOR,
      });
    });

    it('should throw error when journal not found', async () => {
      try {
        await JournalInviteService.inviteJournalEditor({
          name: 'Test Editor',
          journalId: 999,
          inviterId: user.id,
          email: 'neweditor@example.com',
          role: EditorRole.ASSOCIATE_EDITOR,
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Journal not found');
      }
    });

    it('should throw error when email not provided', async () => {
      try {
        await JournalInviteService.inviteJournalEditor({
          journalId: journal.id,
          inviterId: user.id,
          role: EditorRole.ASSOCIATE_EDITOR,
        } as any);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Email required');
      }
    });
  });

  describe('acceptJournalInvite', () => {
    let invite: any;

    beforeEach(async () => {
      invite = await JournalInviteService.inviteJournalEditor({
        name: 'Accept Test Editor',
        journalId: journal.id,
        inviterId: user.id,
        email: editor.email,
        role: EditorRole.ASSOCIATE_EDITOR,
      });
    });

    it('should accept an editor invite', async () => {
      const result = await JournalInviteService.acceptJournalInvite({
        token: invite.token,
        userId: editor.id,
      });

      expect(result.accepted).toBe(true);
      expect(result.decisionAt).toBeInstanceOf(Date);

      const editorRecord = await prisma.journalEditor.findFirst({
        where: { journalId: journal.id, userId: editor.id },
      });

      expect(editorRecord).to.not.be.null;
      expect(editorRecord?.role).toBe(EditorRole.ASSOCIATE_EDITOR);
    });

    it('should create an event log entry when accepting invite', async () => {
      await JournalInviteService.acceptJournalInvite({
        token: invite.token,
        userId: editor.id,
      });

      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id, action: 'EDITOR_ACCEPTED_INVITE' },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).toBe(editor.id);
      expect(eventLog?.details).to.deep.include({
        email: editor.email,
        role: EditorRole.ASSOCIATE_EDITOR,
      });
    });

    it('should throw error when invite not found', async () => {
      try {
        await JournalInviteService.acceptJournalInvite({
          token: 'invalid-token',
          userId: editor.id,
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Invite not found');
      }
    });

    it('should throw error when invite expired', async () => {
      // Update invite to be expired
      await prisma.editorInvite.update({
        where: { id: invite.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      try {
        await JournalInviteService.acceptJournalInvite({
          token: invite.token,
          userId: editor.id,
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Invite expired');
      }
    });
  });

  describe('declineJournalInvite', () => {
    let invite: any;

    beforeEach(async () => {
      invite = await JournalInviteService.inviteJournalEditor({
        name: 'Mr. Journal Editor',
        journalId: journal.id,
        inviterId: user.id,
        email: editor.email,
        role: EditorRole.ASSOCIATE_EDITOR,
      });
    });

    it('should decline an editor invite', async () => {
      const result = await JournalInviteService.declineJournalInvite({
        token: invite.token,
      });

      expect(result.accepted).toBe(false);
      expect(result.decisionAt).toBeInstanceOf(Date);

      const editorRecord = await prisma.journalEditor.findFirst({
        where: { journalId: journal.id, userId: editor.id },
      });

      expect(editorRecord).toBeNull();
    });

    it('should create an event log entry when declining invite', async () => {
      await JournalInviteService.declineJournalInvite({
        token: invite.token,
      });

      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id, action: 'EDITOR_DECLINED_INVITE' },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.details).to.deep.include({
        email: editor.email,
        role: EditorRole.ASSOCIATE_EDITOR,
      });
    });

    it('should throw error when invite not found', async () => {
      try {
        await JournalInviteService.declineJournalInvite({
          token: 'invalid-token',
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Invite not found');
      }
    });

    it('should throw error when invite expired', async () => {
      // Update invite to be expired
      await prisma.editorInvite.update({
        where: { id: invite.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      try {
        await JournalInviteService.declineJournalInvite({
          token: invite.token,
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Invite expired');
      }
    });
  });

  describe('Controller Tests', () => {
    let authToken: string;
    let editorAuthToken: string;
    let userAuthToken: string;

    beforeEach(async () => {
      authToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      editorAuthToken = jwt.sign({ email: editor.email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      userAuthToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
    });

    describe('POST /journals/:journalId/invites/editor', () => {
      it('should create an editor invite', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invites/editor`)
          .set('authorization', `Bearer ${authToken}`)
          .send({
            email: 'neweditor@example.com',
            role: EditorRole.ASSOCIATE_EDITOR,
            name: 'Test Editor',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.invite).to.have.all.keys([
          'id',
          'email',
          'role',
          'expiresAt',
          'createdAt',
          'journalId',
          'inviterId',
        ]);
      });

      it('should return 401 without auth token', async () => {
        const res = await request(app).post(`/v1/journals/${journal.id}/invites/editor`).send({
          email: 'neweditor@example.com',
          role: EditorRole.ASSOCIATE_EDITOR,
        });

        expect(res.status).toBe(401);
      });

      it('should return 403 for non-chief editor', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invites/editor`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            email: 'neweditor@example.com',
            role: EditorRole.ASSOCIATE_EDITOR,
            name: 'Test Editor',
          });

        expect(res.status).toBe(403);
      });
    });

    describe('POST /journals/:journalId/invitation/editor', () => {
      let invite: any;

      beforeEach(async () => {
        invite = await JournalInviteService.inviteJournalEditor({
          name: 'Test Editor',
          journalId: journal.id,
          inviterId: user.id,
          email: editor.email,
          role: EditorRole.ASSOCIATE_EDITOR,
        });
      });

      it('should accept an editor invite', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invitation/editor`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            token: invite.token,
            decision: 'accept',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.invite.accepted).toBe(true);
      });

      it('should decline an editor invite', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invitation/editor`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            token: invite.token,
            decision: 'decline',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.invite.accepted).toBe(false);
      });

      it('should return 401 without auth token', async () => {
        const res = await request(app).post(`/v1/journals/${journal.id}/invitation/editor`).send({
          token: invite.token,
          decision: 'accept',
        });

        expect(res.status).toBe(401);
      });

      it('should return 400 for invalid token', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invitation/editor`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            token: 'invalid-token',
            decision: 'accept',
          });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /journals/:journalId/invites/:inviteId/resend', () => {
      let invite: any;

      beforeEach(async () => {
        invite = await JournalInviteService.inviteJournalEditor({
          name: 'Test Editor',
          journalId: journal.id,
          inviterId: user.id,
          email: 'resend@example.com',
          role: EditorRole.ASSOCIATE_EDITOR,
        });
      });

      it('should resend an editor invite', async () => {
        const originalToken = invite.token;
        const originalExpiresAt = invite.expiresAt;

        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invites/${invite.id}/resend`)
          .set('authorization', `Bearer ${userAuthToken}`)
          .send({
            inviteTtlDays: 14,
          });

        expect(res.status).toBe(200);
        expect(res.body.data.invite.id).toBe(invite.id);
        expect(res.body.data.invite.token).to.not.equal(originalToken);
        expect(res.body.data.invite.expiresAt).to.not.equal(originalExpiresAt);
      });

      it('should return 404 for non-existent invite', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invites/99999/resend`)
          .set('authorization', `Bearer ${userAuthToken}`)
          .send({
            inviteTtlDays: 7,
          });

        expect(res.status).toBe(404);
      });

      it('should return 400 for already responded invite', async () => {
        // First accept the invite
        let res = await request(app)
          .post(`/v1/journals/${journal.id}/invitation/editor`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            token: invite.token,
            decision: 'accept',
          });
        expect(res.status).toBe(200);

        // Then try to resend it
        res = await request(app)
          .post(`/v1/journals/${journal.id}/invites/${invite.id}/resend`)
          .set('authorization', `Bearer ${userAuthToken}`)
          .send({
            inviteTtlDays: 7,
          });
        expect(res.status).toBe(400);
        expect(res.body.message).to.include('Cannot resend invite that has already been responded to');
      });

      it('should return 403 for non-chief editor', async () => {
        const res = await request(app)
          .post(`/v1/journals/${journal.id}/invites/${invite.id}/resend`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            inviteTtlDays: 7,
          });

        expect(res.status).toBe(403);
      });

      it('should return 401 without auth token', async () => {
        const res = await request(app).post(`/v1/journals/${journal.id}/invites/${invite.id}/resend`).send({
          inviteTtlDays: 7,
        });

        expect(res.status).toBe(401);
      });

      it('should create event log entry when resending invite', async () => {
        await request(app)
          .post(`/v1/journals/${journal.id}/invites/${invite.id}/resend`)
          .set('authorization', `Bearer ${userAuthToken}`)
          .send({
            inviteTtlDays: 10,
          });

        const eventLog = await prisma.journalEventLog.findFirst({
          where: {
            journalId: journal.id,
            action: 'EDITOR_INVITED',
            userId: user.id,
          },
          orderBy: { timestamp: 'desc' },
        });

        expect(eventLog).to.not.be.null;
        expect(eventLog?.details).to.deep.include({
          email: 'resend@example.com',
          role: EditorRole.ASSOCIATE_EDITOR,
          resent: true,
        });
      });
    });
  });
});
