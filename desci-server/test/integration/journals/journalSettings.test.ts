import 'mocha';
import { EditorRole, Journal, User } from '@prisma/client';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../../src/client.js';
import { server } from '../../../src/server.js';
import {
  DEFAULT_JOURNAL_SETTINGS,
  JournalManagementService,
  getJournalSettingsWithDefaults,
  getJournalSettingsByIdWithDefaults,
} from '../../../src/services/journals/JournalManagementService.js';

server.ready().then((_) => {
  console.log('Journal Settings Test Server is ready');
});

const app = server.server;

describe('Journal Settings', () => {
  let chiefEditor: User;
  let associateEditor: User;
  let regularUser: User;
  let journal: Journal;

  let chiefEditorAuthToken: string;
  let associateEditorAuthToken: string;
  let regularUserAuthToken: string;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;

    // Create users
    chiefEditor = await prisma.user.create({
      data: { email: 'chief@example.com', name: 'Chief Editor' },
    });
    associateEditor = await prisma.user.create({
      data: { email: 'associate@example.com', name: 'Associate Editor' },
    });
    regularUser = await prisma.user.create({
      data: { email: 'user@example.com', name: 'Regular User' },
    });

    // Create auth tokens
    chiefEditorAuthToken = jwt.sign({ email: chiefEditor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    associateEditorAuthToken = jwt.sign({ email: associateEditor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    regularUserAuthToken = jwt.sign({ email: regularUser.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    // Create a journal with the chief editor
    const journalResult = await JournalManagementService.createJournal({
      name: 'Test Journal',
      description: 'A test journal for settings',
      ownerId: chiefEditor.id,
    });
    // Use match to handle the Result properly
    journal = journalResult.match(
      (j) => j,
      (error) => {
        throw error;
      },
    );

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
  });

  describe('Helper Functions', () => {
    describe('getJournalSettingsWithDefaults', () => {
      it('should return default settings when no custom settings provided', () => {
        const settings = getJournalSettingsWithDefaults(null);

        expect(settings).to.deep.equal(DEFAULT_JOURNAL_SETTINGS);
      });

      it('should merge custom settings with defaults', () => {
        const customSettings = {
          reviewDueHours: {
            min: 48,
            max: 240,
            default: 96,
          },
          // refereeInviteExpiryHours and refereeCount should use defaults
        };

        const settings = getJournalSettingsWithDefaults(customSettings);

        expect(settings.reviewDueHours).to.deep.equal(customSettings.reviewDueHours);
        expect(settings.refereeInviteExpiryHours).to.deep.equal(DEFAULT_JOURNAL_SETTINGS.refereeInviteExpiryHours);
        expect(settings.refereeCount).to.deep.equal(DEFAULT_JOURNAL_SETTINGS.refereeCount);
      });

      it('should handle partial custom settings', () => {
        const customSettings = {
          reviewDueHours: {
            min: 48, // Custom
            // max and default should use defaults
          },
          refereeCount: {
            value: 3, // Custom
          },
        };

        const settings = getJournalSettingsWithDefaults(customSettings);

        expect(settings.reviewDueHours.min).to.equal(48);
        expect(settings.reviewDueHours.max).to.equal(DEFAULT_JOURNAL_SETTINGS.reviewDueHours.max);
        expect(settings.reviewDueHours.default).to.equal(DEFAULT_JOURNAL_SETTINGS.reviewDueHours.default);
        expect(settings.refereeCount.value).to.equal(3);
      });
    });

    describe('getJournalSettingsByIdWithDefaults', () => {
      it('should return default settings for journal with no custom settings', async () => {
        const result = await getJournalSettingsByIdWithDefaults(journal.id);

        expect(result.isOk()).to.be.true;
        // Use match to properly handle the Result
        result.match(
          (settings) => expect(settings).to.deep.equal(DEFAULT_JOURNAL_SETTINGS),
          (error) => {
            throw error;
          },
        );
      });

      it('should return error for non-existent journal', async () => {
        const result = await getJournalSettingsByIdWithDefaults(999999);

        expect(result.isErr()).to.be.true;
        // Use match to properly handle the error
        result.match(
          (settings) => {
            throw new Error('Expected error but got success');
          },
          (error) => expect(error.message).to.equal('Journal not found'),
        );
      });

      it('should return merged settings when journal has custom settings', async () => {
        const customSettings = {
          reviewDueHours: {
            min: 48,
            max: 240,
            default: 96,
          },
          refereeCount: {
            value: 3,
          },
        };

        // Update journal with custom settings
        await prisma.journal.update({
          where: { id: journal.id },
          data: { settings: customSettings },
        });

        const result = await getJournalSettingsByIdWithDefaults(journal.id);

        expect(result.isOk()).to.be.true;
        // Use match to properly handle the Result
        result.match(
          (settings) => {
            expect(settings.reviewDueHours).to.deep.equal(customSettings.reviewDueHours);
            expect(settings.refereeInviteExpiryHours).to.deep.equal(DEFAULT_JOURNAL_SETTINGS.refereeInviteExpiryHours);
            expect(settings.refereeCount).to.deep.equal(customSettings.refereeCount);
          },
          (error) => {
            throw error;
          },
        );
      });
    });
  });

  describe('Journal Settings API Endpoints', () => {
    describe('GET /journals/:journalId/settings', () => {
      it('should return default settings for new journal', async () => {
        const res = await request(app)
          .get(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`);

        expect(res.status).to.equal(200);
        expect(res.body.data.description).to.equal('A test journal for settings');
        expect(res.body.data.settings).to.deep.equal(DEFAULT_JOURNAL_SETTINGS);
      });

      it('should allow associate editors to view settings', async () => {
        const res = await request(app)
          .get(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`);

        expect(res.status).to.equal(200);
        expect(res.body.data.settings).to.exist;
      });

      it('should deny access to non-editors', async () => {
        const res = await request(app)
          .get(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${regularUserAuthToken}`);

        expect(res.status).to.equal(403);
      });

      it('should return 403 for non-existent journal', async () => {
        const res = await request(app)
          .get(`/v1/journals/999999/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`);

        expect(res.status).to.equal(403);
      });

      it('should return custom settings when they exist', async () => {
        const customSettings = {
          reviewDueHours: {
            min: 48,
            max: 240,
            default: 96,
          },
          refereeInviteExpiryHours: {
            min: 48,
            max: 120,
            default: 72,
          },
          refereeCount: {
            value: 3,
          },
        };

        // Update journal with custom settings
        await prisma.journal.update({
          where: { id: journal.id },
          data: {
            settings: customSettings,
            description: 'Updated description',
          },
        });

        const res = await request(app)
          .get(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`);

        expect(res.status).to.equal(200);
        expect(res.body.data.description).to.equal('Updated description');
        expect(res.body.data.settings).to.deep.equal(customSettings);
      });
    });

    describe('PATCH /journals/:journalId/settings', () => {
      it('should update journal settings as chief editor', async () => {
        const updateData = {
          description: 'Updated journal description',
          settings: {
            reviewDueHours: {
              min: 48,
              max: 240,
              default: 96,
            },
            refereeInviteExpiryHours: {
              min: 48,
              max: 120,
              default: 72,
            },
            refereeCount: {
              value: 3,
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(updateData);

        expect(res.status).to.equal(200);
        expect(res.body.data.description).to.equal(updateData.description);
        expect(res.body.data.settings).to.deep.equal(updateData.settings);

        // Verify the update persisted in database
        const updatedJournal = await prisma.journal.findUnique({
          where: { id: journal.id },
        });
        expect(updatedJournal?.description).to.equal(updateData.description);
        expect(updatedJournal?.settings).to.deep.equal(updateData.settings);
      });

      it('should deny access to associate editors', async () => {
        const updateData = {
          settings: {
            refereeCount: {
              value: 3,
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${associateEditorAuthToken}`)
          .send(updateData);

        expect(res.status).to.equal(403);
      });

      it('should deny access to non-editors', async () => {
        const updateData = {
          settings: {
            refereeCount: {
              value: 3,
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${regularUserAuthToken}`)
          .send(updateData);

        expect(res.status).to.equal(403);
      });

      it('should validate settings constraints', async () => {
        const invalidSettings = {
          settings: {
            reviewDueHours: {
              min: 100,
              max: 50, // max < min should fail
              default: 75,
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(invalidSettings);

        expect(res.status).to.equal(400);
        expect(res.body.message).to.equal('Invalid inputs');
        expect(res.body.errors).to.be.an('array');
        expect(res.body.errors.some((err: any) => err.message === 'Max must be greater than min')).to.be.true;
      });

      it('should validate that default falls within min/max range', async () => {
        const invalidSettings = {
          settings: {
            reviewDueHours: {
              min: 48,
              max: 120,
              default: 200, // default > max should fail
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(invalidSettings);

        expect(res.status).to.equal(400);
        expect(res.body.message).to.equal('Invalid inputs');
        expect(res.body.errors).to.be.an('array');
        expect(res.body.errors.some((err: any) => err.message === 'Default must be between min and max')).to.be.true;
      });

      it('should validate referee count range', async () => {
        const invalidSettings = {
          settings: {
            refereeCount: {
              value: 15, // > 10 should fail
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(invalidSettings);

        expect(res.status).to.equal(400);
      });

      it('should update only description when no settings provided', async () => {
        const updateData = {
          description: 'Only description update',
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(updateData);

        expect(res.status).to.equal(200);
        expect(res.body.data.description).to.equal(updateData.description);
        expect(res.body.data.settings).to.deep.equal(DEFAULT_JOURNAL_SETTINGS);
      });

      it('should update only settings when no description provided', async () => {
        const updateData = {
          settings: {
            refereeCount: {
              value: 4,
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/${journal.id}/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(updateData);

        expect(res.status).to.equal(200);
        expect(res.body.data.description).to.equal('A test journal for settings');
        expect(res.body.data.settings.refereeCount.value).to.equal(4);
        expect(res.body.data.settings.reviewDueHours).to.deep.equal(DEFAULT_JOURNAL_SETTINGS.reviewDueHours);
      });

      it('should return 403 for non-existent journal', async () => {
        const updateData = {
          settings: {
            refereeCount: {
              value: 3,
            },
          },
        };

        const res = await request(app)
          .patch(`/v1/journals/999999/settings`)
          .set('authorization', `Bearer ${chiefEditorAuthToken}`)
          .send(updateData);

        expect(res.status).to.equal(403);
      });
    });
  });

  describe('Journal Creation with Default Settings', () => {
    it('should initialize new journals with default settings', async () => {
      const newJournalResult = await JournalManagementService.createJournal({
        name: 'New Test Journal',
        description: 'Testing default settings',
        ownerId: chiefEditor.id,
      });

      expect(newJournalResult.isOk()).to.be.true;
      const newJournal = newJournalResult.match(
        (j) => j,
        (error) => {
          throw error;
        },
      );

      const settings = await getJournalSettingsByIdWithDefaults(newJournal.id);
      expect(settings.isOk()).to.be.true;
      settings.match(
        (s) => expect(s).to.deep.equal(DEFAULT_JOURNAL_SETTINGS),
        (error) => {
          throw error;
        },
      );
    });
  });
});
