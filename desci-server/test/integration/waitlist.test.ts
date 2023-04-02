import 'mocha';
import { User } from '@prisma/client';
import { expect } from 'chai';

import prisma from '../../src/client';
import * as auth from '../../src/services/auth';
import * as invites from '../../src/services/invites';
import * as waitlist from '../../src/services/waitlist';
import { expectThrowsAsync } from '../util';

describe('Waitlist', () => {
  let admin: User;
  before(async () => {});

  after(async () => {});

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "Waitlist" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Invite" CASCADE;`;
    admin = await prisma.user.create({
      data: {
        email: 'noreply@desci.com',
        isAdmin: true,
      },
    });
  });

  afterEach(async () => {});

  describe('Adding users', () => {
    it('is possible', async () => {
      await waitlist.addUser('test@test.com');
    });
    it('twice is not possible', async () => {
      await waitlist.addUser('test@test.com');

      await expectThrowsAsync(() => waitlist.addUser('test@test.com'), 'Already on waitlist');
    });
    it('if already registered not possible', async () => {
      await auth.registerUser('test@test.com');

      await expectThrowsAsync(() => waitlist.addUser('test@test.com'), 'User already exists');
    });
    it('if already invited not possible', async () => {
      await invites.inviteUser(admin, 'test@test.com');

      await expectThrowsAsync(() => waitlist.addUser('test@test.com'), 'User already invited');
    });
  });
});
