import { EditorRole, Journal, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, it, beforeEach, expect } from 'vitest';

import { prisma } from '../../../src/client.js';
import { JournalManagementService } from '../../../src/services/journals/JournalManagementService.js';
import { app } from '../../testApp.js';

describe('Journal Management Service', () => {
  let user: User;
  let journal: Journal;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;

    user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });
  });

  describe('createJournal', () => {
    it('should create a journal with the owner as chief editor', async () => {
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });

      expect(result.isOk()).toBe(true);
      const journal = result._unsafeUnwrap();
      expect(journal.name).toBe('Test Journal');
      expect(journal.description).toBe('A test journal');

      const editor = await prisma.journalEditor.findFirst({
        where: { journalId: journal.id },
      });
      expect(editor?.userId).toBe(user.id);
      expect(editor?.role).toBe(EditorRole.CHIEF_EDITOR);
    });

    it('should create an event log entry when creating a journal', async () => {
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });

      const journal = result._unsafeUnwrap();
      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.action).toBe('JOURNAL_CREATED');
      expect(eventLog?.userId).toBe(user.id);
    });
  });

  describe('updateJournal', () => {
    beforeEach(async () => {
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });
      journal = result._unsafeUnwrap();
    });

    it('should update journal details', async () => {
      const result = await JournalManagementService.updateJournal(journal.id, user.id, {
        name: 'Updated Journal',
        description: 'Updated description',
      });

      expect(result.isOk()).toBe(true);
      const updatedJournal = result._unsafeUnwrap();
      expect(updatedJournal.name).toBe('Updated Journal');
      expect(updatedJournal.description).toBe('Updated description');
    });

    it('should create an event log entry when updating a journal', async () => {
      await JournalManagementService.updateJournal(journal.id, user.id, {
        name: 'Updated Journal',
      });

      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id, action: 'JOURNAL_UPDATED' },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).toBe(user.id);
      expect(eventLog?.details).to.deep.include({
        name: { old: 'Test Journal', new: 'Updated Journal' },
      });
    });

    it('should return error when journal not found', async () => {
      const result = await JournalManagementService.updateJournal(999, user.id, {
        name: 'Updated Journal',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toBe('Journal not found.');
    });

    it('should not update when no changes are provided', async () => {
      const result = await JournalManagementService.updateJournal(journal.id, user.id, {
        name: 'Test Journal', // same as original
      });

      expect(result.isOk()).toBe(true);
      const updatedJournal = result._unsafeUnwrap();
      expect(updatedJournal.name).toBe('Test Journal');
      expect(updatedJournal.description).toBe('A test journal');
    });

    it('should update only provided fields', async () => {
      const result = await JournalManagementService.updateJournal(journal.id, user.id, {
        name: 'Updated Journal',
        // description not provided
      });

      expect(result.isOk()).toBe(true);
      const updatedJournal = result._unsafeUnwrap();
      expect(updatedJournal.name).toBe('Updated Journal');
      expect(updatedJournal.description).toBe('A test journal'); // Should remain unchanged
    });
  });

  describe('getJournalById', () => {
    beforeEach(async () => {
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });
      journal = result._unsafeUnwrap();
    });

    it('should get journal details with editors', async () => {
      const result = await JournalManagementService.getJournalById(journal.id);

      expect(result.isOk()).toBe(true);
      const journalDetails = result._unsafeUnwrap();
      expect(journalDetails.name).toBe('Test Journal');
      expect(journalDetails.editors).to.have.lengthOf(1);
      expect(journalDetails.editors[0].user.id).toBe(user.id);
      expect(journalDetails.editors[0].role).toBe(EditorRole.CHIEF_EDITOR);
    });

    it('should return error when journal not found', async () => {
      const result = await JournalManagementService.getJournalById(999);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toBe('Journal not found.');
    });

    it('should include editor details in response', async () => {
      const result = await JournalManagementService.getJournalById(journal.id);

      expect(result.isOk()).toBe(true);
      const journalDetails = result._unsafeUnwrap();
      expect(journalDetails.editors[0].user).to.deep.include({
        id: user.id,
        name: user.name,
        email: user.email,
      });
    });
  });

  describe('listJournals', () => {
    beforeEach(async () => {
      await JournalManagementService.createJournal({
        name: 'Journal 1',
        description: 'First journal',
        ownerId: user.id,
      });
      await JournalManagementService.createJournal({
        name: 'Journal 2',
        description: 'Second journal',
        ownerId: user.id,
      });
    });

    it('should list all journals', async () => {
      const result = await JournalManagementService.listJournals();

      expect(result.isOk()).toBe(true);
      const journals = result._unsafeUnwrap();
      expect(journals).to.have.lengthOf(2);
      expect(journals[0].name).toBe('Journal 1');
      expect(journals[1].name).toBe('Journal 2');
    });

    it('should return journals in correct format', async () => {
      const result = await JournalManagementService.listJournals();

      expect(result.isOk()).toBe(true);
      const journals = result._unsafeUnwrap();
      expect(journals[0]).to.have.all.keys([
        'id',
        'name',
        'description',
        'iconCid',
        'createdAt',
        'submissions',
        'aboutArticle',
        'editorialBoardArticle',
        'authorInstruction',
        'refereeInstruction',
      ]);
    });
  });

  describe('removeEditorFromJournal', () => {
    let editor: User;

    beforeEach(async () => {
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });
      journal = result._unsafeUnwrap();

      editor = await prisma.user.create({
        data: {
          email: 'editor@example.com',
          name: 'Editor User',
        },
      });

      await prisma.journalEditor.create({
        data: {
          journalId: journal.id,
          userId: editor.id,
          role: EditorRole.ASSOCIATE_EDITOR,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      });
    });

    it('should remove an editor from the journal', async () => {
      const result = await JournalManagementService.removeEditorFromJournal(journal.id, user.id, editor.id);

      expect(result.isOk()).toBe(true);
      const editorExists = await prisma.journalEditor.findFirst({
        where: { journalId: journal.id, userId: editor.id },
      });
      expect(editorExists).toBeNull();
    });

    it('should not allow chief editor to remove themselves', async () => {
      const result = await JournalManagementService.removeEditorFromJournal(journal.id, user.id, user.id);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toBe('Cannot remove yourself as a CHIEF_EDITOR.');
    });

    it('should return error when editor not found', async () => {
      const result = await JournalManagementService.removeEditorFromJournal(journal.id, user.id, 999);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toBe('Editor not found.');
    });

    it('should create event log entry when removing editor', async () => {
      await JournalManagementService.removeEditorFromJournal(journal.id, user.id, editor.id);

      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id, action: 'EDITOR_REMOVED' },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).toBe(user.id);
      expect(eventLog?.details).to.deep.include({
        managerId: user.id,
        editorUserId: editor.id,
      });
    });
  });

  describe('updateEditorRole', () => {
    let editor: User;

    beforeEach(async () => {
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });
      journal = result._unsafeUnwrap();

      editor = await prisma.user.create({
        data: {
          email: 'editor@example.com',
          name: 'Editor User',
        },
      });

      await prisma.journalEditor.create({
        data: {
          journalId: journal.id,
          userId: editor.id,
          role: EditorRole.ASSOCIATE_EDITOR,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      });
    });

    it('should update editor role', async () => {
      const result = await JournalManagementService.updateEditorRole(
        journal.id,
        user.id,
        editor.id,
        EditorRole.CHIEF_EDITOR,
      );

      expect(result.isOk()).toBe(true);
      const updatedEditor = await prisma.journalEditor.findFirst({
        where: { journalId: journal.id, userId: editor.id },
      });
      expect(updatedEditor?.role).toBe(EditorRole.CHIEF_EDITOR);
    });

    it('should create an event log entry when updating editor role', async () => {
      await JournalManagementService.updateEditorRole(journal.id, user.id, editor.id, EditorRole.CHIEF_EDITOR);

      const eventLog = await prisma.journalEventLog.findFirst({
        where: { journalId: journal.id, action: 'EDITOR_ROLE_CHANGED' },
      });

      expect(eventLog).to.not.be.null;
      expect(eventLog?.userId).toBe(user.id);
      expect(eventLog?.details).to.deep.include({
        managerId: user.id,
        editorUserId: editor.id,
        previousRole: EditorRole.ASSOCIATE_EDITOR,
        newRole: EditorRole.CHIEF_EDITOR,
      });
    });

    it('should not update role if already set to target role', async () => {
      await JournalManagementService.updateEditorRole(journal.id, user.id, editor.id, EditorRole.ASSOCIATE_EDITOR);

      const result = await JournalManagementService.updateEditorRole(
        journal.id,
        user.id,
        editor.id,
        EditorRole.ASSOCIATE_EDITOR,
      );

      expect(result.isOk()).toBe(true);
      const updatedEditor = await prisma.journalEditor.findFirst({
        where: { journalId: journal.id, userId: editor.id },
      });
      expect(updatedEditor?.role).toBe(EditorRole.ASSOCIATE_EDITOR);
    });

    it('should not allow editor to change their own role', async () => {
      const result = await JournalManagementService.updateEditorRole(
        journal.id,
        editor.id, // editor trying to change their own role
        editor.id,
        EditorRole.CHIEF_EDITOR,
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toBe('Cannot demote yourself.');
    });
  });

  describe('Controller Tests', () => {
    let authToken: string;
    let editorAuthToken: string;
    let editor: User;

    beforeEach(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;

      // Create test users
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

      // Create auth tokens
      authToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
      editorAuthToken = jwt.sign({ email: editor.email }, process.env.JWT_SECRET!, { expiresIn: '1y' });

      // Create a test journal
      const result = await JournalManagementService.createJournal({
        name: 'Test Journal',
        description: 'A test journal',
        ownerId: user.id,
      });
      journal = result._unsafeUnwrap();
    });

    describe('GET /journals', () => {
      it('should list all journals', async () => {
        const res = await request(app).get('/v1/journals');

        expect(res.status).toBe(200);
        expect(res.body.data.journals).to.be.an('array');
        expect(res.body.data.journals[0]).to.have.all.keys([
          'id',
          'name',
          'description',
          'iconCid',
          'createdAt',
          'publicationCount',
          'aboutArticle',
          'editorialBoardArticle',
          'authorInstruction',
          'refereeInstruction',
        ]);
      });
    });

    describe('GET /journals/:journalId', () => {
      it('should get journal details', async () => {
        const res = await request(app).get(`/v1/journals/${journal.id}`).set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.journal).to.have.all.keys([
          'id',
          'name',
          'description',
          'iconCid',
          'createdAt',
          'editors',
          'aboutArticle',
          'editorialBoardArticle',
          'authorInstruction',
          'refereeInstruction',
        ]);
        expect(res.body.data.journal.editors).to.be.an('array');
      });

      it('should return 403 for a journal you dont have access to', async () => {
        const newJournalResult = await JournalManagementService.createJournal({
          name: 'Test Journal',
          description: 'A test journal',
          ownerId: editor.id, // Different owner to auth token used below
        });
        const newJournal = newJournalResult._unsafeUnwrap();
        const res = await request(app).get(`/v1/journals/${newJournal.id}`).set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(403);
      });

      it('should return 403 for a non existing journal', async () => {
        // 403 Because the user can't be a member of the journal
        const res = await request(app).get(`/v1/journals/999`).set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(403);
      });
    });

    describe('POST /journals', () => {
      it('should create a new journal', async () => {
        const res = await request(app).post('/v1/journals').set('authorization', `Bearer ${authToken}`).send({
          name: 'New Journal',
          description: 'A new test journal',
        });

        expect(res.status).toBe(200);
        expect(res.body.data.journal).to.have.all.keys(['id', 'name', 'description', 'iconCid', 'createdAt']);
        expect(res.body.data.journal.name).toBe('New Journal');
      });

      it('should return 401 without auth token', async () => {
        const res = await request(app).post('/v1/journals').send({
          name: 'New Journal',
          description: 'A new test journal',
        });

        expect(res.status).toBe(401);
      });
    });

    describe('PATCH /journals/:journalId', () => {
      it('should update journal details', async () => {
        const res = await request(app)
          .patch(`/v1/journals/${journal.id}`)
          .set('authorization', `Bearer ${authToken}`)
          .send({
            name: 'Updated Journal',
            description: 'Updated description',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.journal.name).toBe('Updated Journal');
        expect(res.body.data.journal.description).toBe('Updated description');
      });

      it('should return 403 for non-chief editor', async () => {
        const res = await request(app)
          .patch(`/v1/journals/${journal.id}`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            name: 'Updated Journal',
          });

        expect(res.status).toBe(403);
      });
    });

    describe('PATCH /journals/:journalId/editors/:editorUserId/manage', () => {
      beforeEach(async () => {
        // Add editor to journal
        await prisma.journalEditor.create({
          data: {
            journalId: journal.id,
            userId: editor.id,
            role: EditorRole.ASSOCIATE_EDITOR,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        });
      });

      it('should update editor role', async () => {
        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/editors/${editor.id}/manage`)
          .set('authorization', `Bearer ${authToken}`)
          .send({
            role: EditorRole.CHIEF_EDITOR,
          });

        expect(res.status).toBe(200);
      });

      it('should return 403 for non-chief editor', async () => {
        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/editors/${editor.id}/manage`)
          .set('authorization', `Bearer ${editorAuthToken}`)
          .send({
            role: EditorRole.CHIEF_EDITOR,
          });

        expect(res.status).toBe(403);
      });
    });

    describe('DELETE /journals/:journalId/editors/:editorUserId', () => {
      beforeEach(async () => {
        // Add editor to journal
        await prisma.journalEditor.create({
          data: {
            journalId: journal.id,
            userId: editor.id,
            role: EditorRole.ASSOCIATE_EDITOR,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        });
      });

      it('should remove editor from journal', async () => {
        const res = await request(app)
          .delete(`/v1/journals/${journal.id}/editors/${editor.id}`)
          .set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);

        const editorExists = await prisma.journalEditor.findFirst({
          where: { journalId: journal.id, userId: editor.id },
        });
        expect(editorExists).toBeNull();
      });

      it('should return 403 for non-chief editor', async () => {
        const res = await request(app)
          .delete(`/v1/journals/${journal.id}/editors/${editor.id}`)
          .set('authorization', `Bearer ${editorAuthToken}`);

        expect(res.status).toBe(403);
      });

      it('should return 403 when trying to remove chief editor', async () => {
        const res = await request(app)
          .delete(`/v1/journals/${journal.id}/editors/${user.id}`)
          .set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(403);
      });
    });
  });
});
