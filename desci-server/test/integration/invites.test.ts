import { User } from '@prisma/client';
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { prisma } from '../../src/client.js';
import * as invites from '../../src/services/invites.js';
import { expectThrowsAsync } from '../util.js';

describe('Invites', () => {
  let admin: User;
  let regular: User;
  beforeAll(async () => {});

  afterAll(async () => {});

  beforeEach(async () => {
    // console.log('TRUNCATE');
    await prisma.$queryRaw`TRUNCATE TABLE "Invite" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    admin = await prisma.user.create({
      data: {
        email: 'noreply@desci.com',
        isAdmin: true,
      },
    });

    regular = await prisma.user.create({
      data: {
        email: 'chris@desci.com',
      },
    });
  });

  afterEach(async () => {});

  describe('Inviting a user', () => {
    it('is possible if admin', async () => {
      await invites.inviteUser(admin, 'philipp@desci.com');
    });
    it('is not possible if not admin', async () => {
      await expectThrowsAsync(() => invites.inviteUser(regular, 'philipp@desci.com'), 'Must be admin');
    });
    it('allows registration with invite code', async () => {
      const code = await invites.inviteUser(admin, 'philipp@desci.com');
      await invites.acceptInvite(code, 'philipp@desci.com');
    });
    it('allows resending invite', async () => {
      const code1 = await invites.inviteUser(admin, 'philipp@desci.com');
      const code2 = await invites.inviteUser(admin, 'philipp@desci.com');

      await expectThrowsAsync(() => invites.acceptInvite(code1, 'philipp@desci.com'), 'Invite code invalid');

      await invites.acceptInvite(code2, 'philipp@desci.com');
    });
    it('denies registration with wrong code', async () => {
      const code = await invites.inviteUser(admin, 'philipp@desci.com');

      await expectThrowsAsync(() => invites.acceptInvite('abc123', 'philipp@desci.com'), 'Invite code invalid');
    });
    it('denies registration for existing user', async () => {
      const code = await invites.inviteUser(admin, 'philipp@desci.com');
      await invites.acceptInvite(code, 'philipp@desci.com');

      await expectThrowsAsync(() => invites.acceptInvite(code, 'philipp@desci.com'), 'User already exists');
    });
  });
});
