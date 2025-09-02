import { User } from '@prisma/client';
import supertest from 'supertest';
import { describe, it, beforeAll, expect } from 'vitest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { app } from '../testApp.js';
import { testingGenerateMagicCode } from '../util.js';

describe('API Key Tests', () => {
  let mockUser: User;
  let mockAuthToken: string;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
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
      const magicToken = await testingGenerateMagicCode(mockUser.email);
      const testMemo = 'Test';
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: testMemo, magicToken: magicToken })
        .expect(201);

      expect(response.body.ok).toBe(true);
      expect(response.body.apiKey).toBeTypeOf('string');
    });

    it('should not issue an API key with an invalid magic token', async () => {
      const testMemo = 'Test1';
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: testMemo, magicToken: 'invalidToken' })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('Magic Token invalid');
    });
    it('should not issue an API key if unauthenticated', async () => {
      const testMemo = 'Test2';
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .send({ memo: testMemo, magicToken: 'invalidToken' })
        .expect(401);
    });
    it('should not issue an API key if memo is missing', async () => {
      const magicToken = await testingGenerateMagicCode(mockUser.email);
      const response = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ magicToken: magicToken })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('Unique Memo required');
    });
    it('should not issue an API key if memo is not unique', async () => {
      const sameMemo = 'SameMemo';
      const magicToken1 = await testingGenerateMagicCode(mockUser.email);
      const response1 = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: sameMemo, magicToken: magicToken1 })
        .expect(201);
      const magicToken2 = await testingGenerateMagicCode(mockUser.email);
      const response2 = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: sameMemo, magicToken: magicToken2 })
        .expect(400);
      expect(response2.body.ok).toBe(false);
      expect(response2.body.error).toBe('Failed issuing API Key, ensure the memo is unique and wasnt previously used');
    });
  });

  describe('Revoke API Key', () => {
    it('should successfully revoke an API key', async () => {
      const revokeMemo = 'RevokeMe';
      const magicToken = await testingGenerateMagicCode(mockUser.email);
      const issue = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: revokeMemo, magicToken: magicToken })
        .expect(201);
      const response = await request
        .delete('/v1/auth/apiKey/revoke')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: revokeMemo })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.memo).toBe(revokeMemo);
    });
    it('should fail to revoke an API key if unauthenticated', async () => {
      const keyMemo = 'AuthTestKey';
      const magicToken = await testingGenerateMagicCode(mockUser.email);
      const issue = await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: keyMemo, magicToken: magicToken })
        .expect(201);
      const response = await request.delete('/v1/auth/apiKey/revoke').send({ memo: keyMemo }).expect(401);
      expect(response.body.ok).toBe(false);
    });
    it('should fail to revoke an API key if memo is invalid', async () => {
      const invalidMemo = 'InvalidMemo';
      const response = await request
        .delete('/v1/auth/apiKey/revoke')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: invalidMemo })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('Invalid API Key, ensure the memo is correct.');
    });
  });

  describe('List API Keys', () => {
    it('should successfully list all active API keys', async () => {
      const apiKeyMemo1 = 'ListTest1';
      const apiKeyMemo2 = 'ListTest2';
      const magicToken1 = await testingGenerateMagicCode(mockUser.email);
      await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: apiKeyMemo1, magicToken: magicToken1 })
        .expect(201);
      const magicToken2 = await testingGenerateMagicCode(mockUser.email);
      await request
        .post('/v1/auth/apiKey/issue')
        .set('authorization', `Bearer ${mockAuthToken}`)
        .send({ memo: apiKeyMemo2, magicToken: magicToken2 })
        .expect(201);

      const response = await request.get('/v1/auth/apiKey').set('authorization', `Bearer ${mockAuthToken}`).expect(200);
      const keys = response.body.apiKeys;
      const includesMemo1 = keys.some((key: any) => key.memo === apiKeyMemo1);
      const includesMemo2 = keys.some((key: any) => key.memo === apiKeyMemo2);

      expect(response.body.ok).toBe(true);
      expect(keys).toBeInstanceOf(Array);
      expect(includesMemo1).toBe(true);
      expect(includesMemo2).toBe(true);
    });
    it('should fail to retrieve api keys unauthenticated', async () => {
      const response = await request.get('/v1/auth/apiKey').expect(401);
      expect(response.body.ok).toBe(false);
    });
  });
});
