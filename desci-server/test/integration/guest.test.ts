import { User } from '@prisma/client';
import request from 'supertest';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { prisma } from '../../src/client.js';
import { logger } from '../../src/logger.js';
import { app } from '../testApp.js';
import { testingGenerateMagicCode } from '../util.js';

const log = logger.child({ module: 'TEST :: Guest ' });

describe('Guest User Tests', () => {
  let guestUser: User;
  let guestToken: string;

  beforeAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "User" CASCADE`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create a guest user session', async () => {
    const res = await request(app).post('/v1/auth/guest').send({ dev: 'true' }); // Assuming dev=true returns token
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.isGuest).toBe(true);
    expect(res.body.user.token).toBeTypeOf('string');

    guestToken = res.body.user.token; // For subsequent test auth

    const dbUser = await prisma.user.findFirst({ where: { email: res.body.user.email } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.isGuest).toBe(true);
    guestUser = dbUser!;
    log.info({ guestUserId: guestUser.id, email: guestUser.email }, 'Guest user created');
  });

  it('guest user should be able to create a node', async () => {
    expect(guestToken).toBeTypeOf('string');

    const title = 'My Guest Node';
    const res = await request(app)
      .post('/v1/nodes/createDraft')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        title: title,
        defaultLicense: 'CC-BY',
        researchFields: ['Biology'],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.node).toBeDefined();
    expect(res.body.node.ownerId).toBe(guestUser.id);
    expect(res.body.node.title).toBe(title);

    log.info({ nodeId: res.body.node.id, ownerId: res.body.node.ownerId }, 'Node created by guest');
  });

  it('guest user should have access to their created node', async () => {
    const title = 'Guest Node For Access Test';
    const createRes = await request(app)
      .post('/v1/nodes/createDraft')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        title: title,
        defaultLicense: 'CC-BY',
        researchFields: ['Computer Science'],
      });
    expect(createRes.statusCode).toBe(200);
    const nodeUuid = createRes.body.node.uuid;
    expect(nodeUuid).toBeTypeOf('string');

    const accessRes = await request(app)
      .get(`/v1/nodes/access/${nodeUuid}`)
      .set('Authorization', `Bearer ${guestToken}`);

    log.info({ status: accessRes.statusCode, body: accessRes.body }, 'Access check response');
    expect(accessRes.statusCode).toBe(200);
    expect(accessRes.body.ok).toBe(true);
    expect(accessRes.body.hasAccess).toBe(true);
    expect(accessRes.body.isOwner).toBe(true);
  });

  it('should convert a guest user to a NEW regular user', async () => {
    const guestRes = await request(app).post('/v1/auth/guest').send({ dev: 'true' });
    expect(guestRes.statusCode).toBe(200);
    const tempGuestToken = guestRes.body.user.token;
    const tempGuestEmail = guestRes.body.user.email;
    const tempGuestUser = await prisma.user.findUnique({ where: { email: tempGuestEmail } });
    expect(tempGuestUser).toBeDefined();
    const guestId = tempGuestUser!.id;
    log.info({ guestId }, 'Created guest user for conversion test');

    const title = 'Guest Node For Access Test';
    const createRes = await request(app)
      .post('/v1/nodes/createDraft')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .send({
        title: title,
        defaultLicense: 'CC-BY',
        researchFields: ['Computer Science'],
      });
    expect(createRes.statusCode).toBe(200);
    const nodeUuid = createRes.body.node.uuid;
    const nodeId = createRes.body.node.id;

    const fileUploadRes = await request(app)
      .post('/v1/data/update')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .field('uuid', nodeUuid)
      .field('contextPath', 'root')
      .attach('files', Buffer.from('test'), 'test.txt');

    expect(fileUploadRes.statusCode).toBe(200);

    const dataReferences = await prisma.dataReference.findMany({
      where: { nodeId },
    });
    expect(dataReferences.length).toBe(0); // Make sure no data references (guest)

    const guestDataRef = await prisma.guestDataReference.findFirst({
      where: { userId: guestId, path: 'root/test.txt' },
    });
    expect(guestDataRef).toBeDefined();

    const newEmail = `new-user-${Date.now()}@desci.com`;
    const magicCode = await testingGenerateMagicCode(newEmail);
    expect(magicCode).toBeTypeOf('string');

    const convertRes = await request(app)
      .post('/v1/auth/guest/convert/email')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .send({
        email: newEmail,
        magicCode: magicCode,
        name: 'New Converted User',
        dev: 'true',
      });

    log.info({ status: convertRes.statusCode, body: convertRes.body }, 'Conversion response');
    expect(convertRes.statusCode).toBe(200);
    expect(convertRes.body.ok).toBe(true);
    expect(convertRes.body.isNewUser).toBe(true);
    expect(convertRes.body.user.email).toBe(newEmail);
    expect(convertRes.body.user.isGuest).toBe(false);
    expect(convertRes.body.user.name).toBe('New Converted User');
    const newUserId = convertRes.body.user.id;

    const updatedUser = await prisma.user.findUnique({ where: { id: newUserId } });
    expect(updatedUser).not.toBeNull();
    expect(updatedUser?.email).toBe(newEmail);
    expect(updatedUser?.isGuest).toBe(false);
    expect(updatedUser?.convertedGuest).toBe(true);

    const dataRefs = await prisma.dataReference.findMany({ where: { userId: newUserId } });
    const testFileRef = await prisma.dataReference.findFirst({
      where: { userId: guestId, path: 'root/test.txt' },
    });
    expect(dataRefs.length).toBeGreaterThan(0);
    expect(testFileRef).toBeDefined();
    log.info({ newUserId, oldGuestId: guestId }, 'Guest successfully converted to NEW user');
  });

  it('should convert a guest user to an EXISTING user and merge data', async () => {
    const existingEmail = `existing-user-${Date.now()}@desci.com`;
    const existingUser = await prisma.user.create({
      data: {
        email: existingEmail,
        name: 'Existing User',
      },
    });
    log.info({ existingUserId: existingUser.id, email: existingEmail }, 'Created existing user');

    const guestRes = await request(app).post('/v1/auth/guest').send({ dev: 'true' });
    expect(guestRes.statusCode).toBe(200);
    const tempGuestToken = guestRes.body.user.token;
    const tempGuestEmail = guestRes.body.user.email;
    const tempGuestUser = await prisma.user.findUnique({ where: { email: tempGuestEmail } });
    expect(tempGuestUser).toBeDefined();
    const guestId = tempGuestUser!.id;
    log.info({ guestId }, 'Created guest user for merge test');

    const nodeTitle = 'Guest Node to be Merged';
    const createRes = await request(app)
      .post('/v1/nodes/createDraft')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .send({
        title: nodeTitle,
        defaultLicense: 'CC-BY',
        researchFields: ['Physics'],
      });
    expect(createRes.statusCode).toBe(200);
    const nodeUuid = createRes.body.node.uuid;
    const nodeId = createRes.body.node.id;
    expect(createRes.body.node.ownerId).toBe(guestId);

    const fileUploadRes = await request(app)
      .post('/v1/data/update')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .field('uuid', nodeUuid)
      .field('contextPath', 'root')
      .attach('files', Buffer.from('merge-test-data'), 'merge-test.txt');
    expect(fileUploadRes.statusCode).toBe(200);

    const guestDataRef = await prisma.guestDataReference.findFirst({
      where: { userId: guestId, nodeId: nodeId, path: 'root/merge-test.txt' },
    });
    expect(guestDataRef).toBeDefined();

    const existingUserMagicCode = await testingGenerateMagicCode(existingEmail);
    expect(existingUserMagicCode).toBeTypeOf('string');

    const convertRes = await request(app)
      .post('/v1/auth/guest/convert/email')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .send({
        email: existingEmail,
        magicCode: existingUserMagicCode,
        dev: 'true',
      });

    log.info({ status: convertRes.statusCode, body: convertRes.body }, 'Merge Conversion response');
    expect(convertRes.statusCode).toBe(200);
    expect(convertRes.body.ok).toBe(true);
    expect(convertRes.body.isNewUser).toBe(false);
    expect(convertRes.body.user.email).toBe(existingEmail);
    expect(convertRes.body.user.isGuest).toBe(false);
    expect(convertRes.body.user.id).toBe(existingUser.id);

    // Guest user should be deleted
    const deletedGuest = await prisma.user.findUnique({ where: { id: guestId } });
    expect(deletedGuest).toBeNull();

    const finalExistingUser = await prisma.user.findUnique({ where: { id: existingUser.id } });
    expect(finalExistingUser).not.toBeNull();
    expect(finalExistingUser?.email).toBe(existingEmail);
    expect(finalExistingUser?.isGuest).toBe(false);

    // Merging shouldn't mark the existing user as convertedGuest
    expect(finalExistingUser?.convertedGuest).toBe(false);
    expect(finalExistingUser?.mergedIntoAt).toHaveLength(1);

    const mergedNode = await prisma.node.findUnique({ where: { id: nodeId } });
    expect(mergedNode).toBeDefined();
    expect(mergedNode?.ownerId).toBe(existingUser.id);

    // Verify DataReference was created/updated for the existing user
    const mergedDataRef = await prisma.dataReference.findFirst({
      where: {
        userId: existingUser.id,
        nodeId: nodeId,
        path: 'root/merge-test.txt',
      },
    });
    expect(mergedDataRef).toBeDefined();
    expect(mergedDataRef?.userId).toBe(existingUser.id);
    expect(mergedDataRef?.size).toBe(guestDataRef!.size);
    expect(mergedDataRef?.cid).toBe(guestDataRef!.cid);
    expect(mergedDataRef?.rootCid).toBe(guestDataRef!.rootCid);

    log.info({ existingUserId: existingUser.id, oldGuestId: guestId }, 'Guest successfully MERGED into EXISTING user');
  });
});
