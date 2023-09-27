import 'mocha';
import { User } from '@prisma/client';
import { expect } from 'chai';
import cookieParser from 'cookie-parser';
import express from 'express';
import supertest from 'supertest';

import prisma from '../../src/client';
import { generateAccessToken } from '../../src/controllers/auth/magic';
import { ensureUser, retrieveUser } from '../../src/middleware/ensureUser';
import { magicLinkRedeem, sendMagicLink } from '../../src/services/auth';
import { expectThrowsAsync } from '../util';

describe('Magic Link Authentication', () => {
  let user: User;

  // before(async () => {});

  // after(async () => {});

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "MagicLink" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    user = await prisma.user.create({
      data: {
        email: 'test@desci.com',
      },
    });
  });

  // afterEach(async () => {});

  describe('Magic Link Creation', () => {
    it('should create a magic link for an existing user', async () => {
      const result = await sendMagicLink(user.email);
      expect(result).to.be.true;
    });

    describe('Magic Link Rate Limiting', () => {
      it('should not allow generating a magic link within 30 seconds of the last one', async () => {
        await sendMagicLink(user.email);
        await expectThrowsAsync(
          () => sendMagicLink(user.email),
          'A verification code was recently generated. Please wait 30 seconds before requesting another.',
        );
      });

      it('should allow generating a magic link after 30 seconds of the last one', async () => {
        await sendMagicLink(user.email);
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
        const result = await sendMagicLink(user.email);
        expect(result).to.be.true;
      });
    });
  });

  describe('Magic Link Redemption', () => {
    it('should redeem a valid magic link', async () => {
      await sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      const redeemedUser = await magicLinkRedeem(user.email, magicLink!.token);
      expect(redeemedUser.email).to.equal(user.email);
    });

    it('should not redeem an expired magic link', async () => {
      await sendMagicLink(user.email);
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
      await expectThrowsAsync(() => magicLinkRedeem(user.email, magicLink!.token), 'Invalid token.');
    });

    it('should not redeem a magic link more than once', async () => {
      await sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      await magicLinkRedeem(user.email, magicLink!.token);
      await expectThrowsAsync(() => magicLinkRedeem(user.email, magicLink!.token), 'Invalid token.');
    });

    it('should invalidate a magic link after 5 failed attempts', async () => {
      await sendMagicLink(user.email);
      const magicLink = await prisma.magicLink.findFirst({
        where: {
          email: user.email,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      for (let i = 0; i < 5; i++) {
        await expectThrowsAsync(() => magicLinkRedeem(user.email, 'invalidToken'), 'Invalid token.');
      }
      await expectThrowsAsync(
        () => magicLinkRedeem(user.email, magicLink!.token),
        'Too many failed attempts. Token invalidated.',
      );
    });

    it('should not redeem a magic link with an invalid token', async () => {
      await sendMagicLink(user.email);
      await expectThrowsAsync(() => magicLinkRedeem(user.email, 'invalidToken'), 'Invalid token.');
    });
  });
});

describe('Auth Middleware', () => {
  let app: express.Express;
  let mockUser: User;
  let mockToken: string;
  let request: supertest.SuperTest<supertest.Test>;

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    app = express();
    app.use(cookieParser());

    // Mock route that uses the auth middleware
    app.get('/test', ensureUser, (req, res) => {
      const user = (req as any).user;
      res.send(user);
    });

    mockUser = await prisma.user.create({
      data: {
        email: 'test@desci.com',
      },
    });

    mockToken = generateAccessToken({ email: mockUser.email });

    request = supertest(app);
  });

  describe('retrieveUser', () => {
    it('should retrieve user from auth header', async () => {
      const response = await request.get('/test').set('authorization', `Bearer ${mockToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.email).to.equal(mockUser.email);
    });

    it('should retrieve user from cookies', async () => {
      const response = await request.get('/test').set('Cookie', [`auth=${mockToken}`]);

      expect(response.status).to.equal(200);
      expect(response.body.email).to.equal(mockUser.email);
    });

    it('should return 401 if no token is provided', async () => {
      const response = await request.get('/test');
      expect(response.status).to.equal(401);
    });

    it('should return 401 for invalid token', async () => {
      const response = await request.get('/test').set('authorization', 'Bearer invalidToken');

      expect(response.status).to.equal(401);
    });
  });

  describe('ensureUser', () => {
    it('should set req.user if user is retrieved', async () => {
      const response = await request.get('/test').set('authorization', `Bearer ${mockToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.email).to.equal(mockUser.email);
    });

    it('should send 401 if no user is retrieved', async () => {
      const response = await request.get('/test');
      expect(response.status).to.equal(401);
    });
  });
});
