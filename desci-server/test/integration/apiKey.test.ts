import 'mocha';
import { User } from '@prisma/client';
import { expect } from 'chai';
import supertest from 'supertest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { app } from '../../src/index.js';
import { testingGenerateMagicCode } from '../util.js';

describe('API Key Tests', () => {
  let mockUser: User;
  let mockAuthToken: string;
  let request: supertest.SuperTest<supertest.Test>;
  const testMemo = 'Test';

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    mockUser = await prisma.user.create({
      data: {
        email: 'test@desci.com',
      },
    });

    mockAuthToken = generateAccessToken({ email: mockUser.email });

    request = supertest(app);
  });

  describe('Issue API Key', () => {
    it('should successfully issue an API key', async () => {
      const magicToken = testingGenerateMagicCode(mockUser.email);
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: testMemo, magicToken: magicToken })
        .expect(201);

      expect(response.body.ok).to.be.true;
      expect(response.body.apiKey).to.be.a('string');
    });

    it('should not issue an API key with an invalid magic token', async () => {
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: testMemo, magicToken: 'invalidToken' })
        .expect(400);

      expect(response.body.ok).to.be.false;
      expect(response.body.error).to.equal('Magic Token invalid');
    });
    it('should not issue an API key if unauthenticated', async () => {
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .send({ memo: testMemo, magicToken: 'invalidToken' })
        .expect(401);
    });
    it('should not issue an API key if memo is missing', async () => {
      const magicToken = testingGenerateMagicCode(mockUser.email);
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ magicToken: magicToken })
        .expect(400);

      expect(response.body.ok).to.be.false;
      expect(response.body.error).to.equal('Magic Token invalid');
    });
    it('should not issue an API key memo is not unique', async () => {
      const magicToken1 = testingGenerateMagicCode(mockUser.email);
      const response1 = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: testMemo, magicToken: magicToken1 })
        .expect(200);
      const magicToken2 = testingGenerateMagicCode(mockUser.email);
      const response2 = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: testMemo, magicToken: magicToken2 })
        .expect(400);
    });
  });

  describe('Revoke API Key', () => {
    it('should successfully revoke an API key', async () => {
      const revokeMemo = 'RevokeMe';
      const magicToken = testingGenerateMagicCode(mockUser.email);
      const issue = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: revokeMemo, magicToken: magicToken })
        .expect(201);
      const response = await request
        .post('/v1/auth/apiKey/revoke')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: revokeMemo })
        .expect(200);

      expect(response.body.ok).to.be.true;
      expect(response.body.memo).to.equal(revokeMemo);
    });
    it('should fail to revoke an API key if unauthenticated', async () => {
      const keyMemo = 'AuthTestKey';
      const magicToken = testingGenerateMagicCode(mockUser.email);
      const issue = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: keyMemo, magicToken: magicToken })
        .expect(201);
      const response = await request.post('/v1/auth/apiKey/revoke').send({ memo: keyMemo }).expect(401);
      expect(response.body.ok).to.be.false;
    });
    it('should fail to revoke an API key if memo is invalid', async () => {
      const invalidMemo = 'InvalidMemo';
      const response = await request
        .post('/v1/auth/apiKey/revoke')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: invalidMemo })
        .expect(400);

      expect(response.body.ok).to.be.false;
      expect(response.body.error).to.equal('Invalid API Key, ensure the memo is correct.');
    });
  });

  describe('List API Keys', () => {
    it('should successfully list all active API keys', async () => {
      const apiKeyMemo1 = 'ListTest1';
      const apiKeyMemo2 = 'ListTest2';
      const magicToken = testingGenerateMagicCode(mockUser.email);
      await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: apiKeyMemo1, magicToken: magicToken })
        .expect(201);
      await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: apiKeyMemo2, magicToken: magicToken })
        .expect(201);

      const response = await request.get('/v1/auth/apiKey').set('authorization', `Bearer ${mockAuthToken}`).expect(200);
      const keys = response.body.apiKeys;
      const includesMemo1 = keys.some((key: any) => key.memo === apiKeyMemo1);
      const includesMemo2 = keys.some((key: any) => key.memo === apiKeyMemo2);

      expect(response.body.ok).to.be.true;
      expect(keys).to.be.an('array');
      expect(includesMemo1).to.be.true;
      expect(includesMemo2).to.be.true;
    });
    it('should fail to retrieve api keys unauthenticated', async () => {
      const response = await request.get('/v1/auth/apiKey').expect(401);
      expect(response.body.ok).to.be.false;
    });
  });
});
