import 'mocha';
import { User, MagicLink } from '@prisma/client';
import { expect } from 'chai';

import prisma from '../../src/client';
import * as auth from '../../src/services/auth';
import { expectThrowsAsync } from '../util';

describe('Magic Link Authentication', () => {
  let user: User;

  before(async () => {});

  after(async () => {});

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "MagicLink" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    user = await prisma.user.create({
      data: {
        email: 'test@desci.com',
      },
    });
  });

  afterEach(async () => {});

  describe('Magic Link Creation', () => {
    it('should create a magic link for an existing user', async () => {
      const result = await auth.sendMagicLink(user.email);
      expect(result).to.be.true;
    });

    describe('Magic Link Rate Limiting', () => {
      it('should not allow generating a magic link within 30 seconds of the last one', async () => {
        await auth.sendMagicLink(user.email);
        await expectThrowsAsync(
          () => auth.sendMagicLink(user.email),
          'A magic link was recently generated. Please wait 30 seconds before requesting another.',
        );
      });

      it('should allow generating a magic link after 30 seconds of the last one', async () => {
        await auth.sendMagicLink(user.email);
        const latestMagicLink = await prisma.magicLink.findFirst({
          where: {
            email: user.email,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        if (latestMagicLink) {
          await prisma.magicLink.update({
            where: { id: latestMagicLink.id },
            data: { createdAt: new Date(Date.now() - 31 * 1000) }, // Set to 31 seconds ago
          });
        }
        const result = await auth.sendMagicLink(user.email);
        expect(result).to.be.true;
      });
    });
  });

  describe('Magic Link Redemption', () => {
    it('should redeem a valid magic link', async () => {
      await auth.sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      const redeemedUser = await auth.magicLinkRedeem(user.email, magicLink!.token);
      expect(redeemedUser.email).to.equal(user.email);
    });

    it('should not redeem an expired magic link', async () => {
      await auth.sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      await prisma.magicLink.update({
        where: { id: magicLink!.id },
        data: { expiresAt: new Date('1980-01-01') },
      });
      await expectThrowsAsync(() => auth.magicLinkRedeem(user.email, magicLink!.token), 'Invalid token.');
    });

    it('should not redeem a magic link more than once', async () => {
      await auth.sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      await auth.magicLinkRedeem(user.email, magicLink!.token);
      await expectThrowsAsync(() => auth.magicLinkRedeem(user.email, magicLink!.token), 'Invalid token.');
    });

    it('should invalidate a magic link after 5 failed attempts', async () => {
      await auth.sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      for (let i = 0; i < 5; i++) {
        await expectThrowsAsync(() => auth.magicLinkRedeem(user.email, 'invalidToken'), 'Invalid token.');
      }
      await expectThrowsAsync(
        () => auth.magicLinkRedeem(user.email, magicLink!.token),
        'Too many failed attempts. Token invalidated.',
      );
    });

    it('should not redeem a magic link with an invalid token', async () => {
      await auth.sendMagicLink(user.email);
      await expectThrowsAsync(() => auth.magicLinkRedeem(user.email, 'invalidToken'), 'Invalid token.');
    });
  });
});
