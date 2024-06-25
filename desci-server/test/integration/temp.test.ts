import 'mocha';
import { User } from '@prisma/client';
import { expect } from 'chai';
import supertest from 'supertest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { app } from '../../src/index.js';
import { testingGenerateMagicCode } from '../util.js';

describe('failing test', () => {
  let request: supertest.SuperTest<supertest.Test>;

  before(async () => {
    request = supertest(app);
  });

  describe('should fail', () => {
    it('should fail', async () => {
      expect(1).to.equal(2);
    });
  });
});
