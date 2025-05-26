import 'dotenv/config';
import 'mocha';

import { EditorRole, Journal, User } from '@prisma/client';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import supertest from 'supertest';

import { prisma } from '../../../src/client.js';
import { server } from '../../../src/server.js';
import { JournalManagementService } from '../../../src/services/journals/JournalManagementService.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

server.ready().then((_) => {
  console.log('server is ready');
});
export const app = server.app;

// Tests todo:
// - create submission
//  - submission is created with status SUBMITTED
//  - duplicate submission is not created
// Chief Editor:
// - chief editor can view submissions
// - chief editor can assign submission to associate editors
// Associate Editor:
// - associate editor can view submissions (assigned, accepted)
// Author
// - author can view all their submissions
// - author can view public journal submissions (assigned, accepted)
// - authors can create new submissions

describe('Journal Submission Service', () => {
  let user: User;
  let editor: User;
  let associateEditor: User;
  let journal: Journal;
  let request: supertest.SuperTest<supertest.Test>;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEditor" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalEventLog" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "JournalSubmission" CASCADE;`;

    user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });
  });

  describe('createSubmission', () => {
    it('should create a journal submission', async () => {});

    it('should prevent duplicate submissions', async () => {});
  });

  describe('Chief Editor', () => {
    it('can view submissions', async () => {});
    it('can assign submissions to associate editors', async () => {});
  });

  describe('Associate Editor', () => {
    it('can view only public submissions (assigned, accepted)', async () => {});
  });

  describe('Author', async () => {
    it('can view all their submissions', async () => {});
    it('can view public journal submissions (assigned, accepted)', async () => {});
    it('can create new submissions', async () => {});
  });
});
