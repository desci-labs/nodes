import { AuthTokenSource, User } from '@prisma/client';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import { pinoHttp } from 'pino-http';
import supertest from 'supertest';
import { describe, it, beforeAll, expect, beforeEach } from 'vitest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { OrcIdRecordData } from '../../src/controllers/auth/orcid.js';
import { orcidCheck } from '../../src/controllers/auth/orcidNext.js';
import { logger } from '../../src/logger.js';
import { attachUser } from '../../src/middleware/attachUser.js';
// describe('ORCiD Auth', () => {
//   let user: User;

//   before(async () => {});

//   after(async () => {});

//   beforeEach(async () => {
//     await prisma.$queryRaw`TRUNCATE TABLE "MagicLink" CASCADE;`;
//     await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
//     await prisma.$queryRaw`TRUNCATE TABLE "AuthToken" CASCADE;`;
//     user = await prisma.user.create({
//       data: {
//         email: 'test@desci.com',
//       },
//     });
//   });

//   afterEach(async () => {});

//   describe('Login with orcid', () => {
//     it('should prompt user for email if no email associated', async () => {

//     });

// });

describe('ORCiD Auth Endpoints', () => {
  let app: express.Express;
  let mockUser: User;
  let mockToken: string;
  let request: supertest.SuperTest<supertest.Test>;

  const TEST_ORCID = '0000-0002-1825-0097';
  const ORCID_JSON_PAYLOAD = { access_token: '1234', refresh_token: '5657', expires_in: 322141241, orcid: TEST_ORCID };

  beforeEach(async () => {
    await prisma.authToken.deleteMany({});
    await prisma.user.updateMany({
      data: {
        orcid: null,
      },
    });
  });

  const ensureOrcidAuthInfoSaved = async () => {
    const authToken = await prisma.authToken.findFirst({
      where: {
        userId: mockUser.id,
        source: AuthTokenSource.ORCID,
      },
    });
    expect(authToken).not.toBeNull();
    expect(authToken?.accessToken).toBe(ORCID_JSON_PAYLOAD.access_token);
    expect(authToken?.refreshToken).toBe(ORCID_JSON_PAYLOAD.refresh_token);
    expect(authToken?.expiresIn).toBe(ORCID_JSON_PAYLOAD.expires_in);
  };

  const ensureOrcidAuthInfo_NOT_Saved = async () => {
    const authToken = await prisma.authToken.findFirst({
      where: {
        userId: mockUser.id,
        source: AuthTokenSource.ORCID,
      },
    });
    expect(authToken).toBeNull();
  };
  beforeAll(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    app = express();
    app.use(
      pinoHttp({
        logger,
        serializers: {
          res: (res) => {
            return {
              responseTime: res.responseTime,
              status: res.statusCode,
            };
          },
          req: (req) => {
            return {
              query: req.query,
              params: req.params,
              method: req.method,
              url: req.url,
            };
          },
        },
      }),
    );
    app.use(cookieParser());
    app.use(bodyParser.json());

    const mockOrcidLookup = async (orcid: string, accessToken: string): Promise<OrcIdRecordData> => {
      return new Promise((resolve) =>
        resolve({
          'orcid-identifier': {
            path: TEST_ORCID,
          },
          person: {
            name: {
              'given-names': { value: 'Test' },
              'family-name': { value: 'User' },
            },
            emails: { email: [] },
          },
        }),
      );
    };

    // Mock route that uses the auth middleware
    app.post('/orcid/next', attachUser, orcidCheck(mockOrcidLookup));

    mockUser = await prisma.user.create({
      data: {
        email: 'test@desci.com',
      },
    });

    mockToken = generateAccessToken({ email: mockUser.email });

    request = supertest(app);
  });

  describe('POST orcid/next', () => {
    it('should prompt user for email if no email associated to the orcid', async () => {
      const response = await request
        .post('/orcid/next')
        // .set('authorization', `Bearer ${mockToken}`)
        .send(ORCID_JSON_PAYLOAD);

      expect(response.status).toBe(200);
      expect(response.body.userFound).toBe(false);
      expect(response.body.error).toBe('need to attach email');

      await ensureOrcidAuthInfo_NOT_Saved();
    });

    it('should succeed and issue Nodes JWT if there is email associated to the orcid', async () => {
      await prisma.user.update({
        where: { id: mockUser.id },
        data: {
          orcid: TEST_ORCID,
        },
      });
      const response = await request
        .post('/orcid/next')
        // .set('authorization', `Bearer ${mockToken}`)
        .send(ORCID_JSON_PAYLOAD);

      expect(response.status).toBe(200);
      expect(response.body.userFound).toBe(true);

      await ensureOrcidAuthInfoSaved();
    });

    describe('when user is already logged in via email', () => {
      it('should succeed connecting the orcid and issue Nodes JWT if there is no orcid associated to logged in email', async () => {
        const response = await request
          .post('/orcid/next')
          .set('authorization', `Bearer ${mockToken}`)
          .send(ORCID_JSON_PAYLOAD);

        expect(response.status).toBe(200);
        expect(response.body.userFound).toBe(true);

        await ensureOrcidAuthInfoSaved();
      });

      it('should fail connecting the orcid if there is another orcid associated to logged in email', async () => {
        await prisma.user.update({
          where: { id: mockUser.id },
          data: {
            orcid: TEST_ORCID + '1',
          },
        });
        const response = await request
          .post('/orcid/next')
          .set('authorization', `Bearer ${mockToken}`)
          .send(ORCID_JSON_PAYLOAD);

        expect(response.status).toBe(200);
        expect(response.body.userFound).toBe(true);

        await ensureOrcidAuthInfo_NOT_Saved();
      });
    });
  });
});
