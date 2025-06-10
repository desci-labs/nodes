import { User } from '@prisma/client';
import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';

import { prisma } from '../../src/client.js';
import { app } from '../../src/index.js';
import { logger } from '../../src/logger.js';
import { testingGenerateMagicCode } from '../util.js';

const log = logger.child({ module: 'TEST :: Guest ' });

describe('Guest User Tests', () => {
  let guestUser: User;
  let guestToken: string;

  before(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "User" CASCADE`;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('should create a guest user session', async () => {
    const res = await request(app).post('/v1/auth/guest').send({ dev: 'true' }); // Assuming dev=true returns token
    expect(res.statusCode).to.equal(200);
    expect(res.body.ok).to.equal(true);
    expect(res.body.user.isGuest).to.equal(true);
    expect(res.body.user.token).to.be.a('string');

    guestToken = res.body.user.token; // For subsequent test auth

    const dbUser = await prisma.user.findFirst({ where: { email: res.body.user.email } });
    expect(dbUser).to.not.be.null;
    expect(dbUser?.isGuest).to.equal(true);
    guestUser = dbUser!;
    log.info({ guestUserId: guestUser.id, email: guestUser.email }, 'Guest user created');
  });

  it('guest user should be able to create a node', async () => {
    expect(guestToken).to.be.a('string');

    const title = 'My Guest Node';
    const res = await request(app)
      .post('/v1/nodes/createDraft')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        title: title,
        defaultLicense: 'CC-BY',
        researchFields: ['Biology'],
      });

    expect(res.statusCode).to.equal(200);
    expect(res.body.ok).to.equal(true);
    expect(res.body.node).to.exist;
    expect(res.body.node.ownerId).to.equal(guestUser.id);
    expect(res.body.node.title).to.equal(title);

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
    expect(createRes.statusCode).to.equal(200);
    const nodeUuid = createRes.body.node.uuid;
    expect(nodeUuid).to.be.a('string');

    const accessRes = await request(app)
      .get(`/v1/nodes/access/${nodeUuid}`)
      .set('Authorization', `Bearer ${guestToken}`);

    log.info({ status: accessRes.statusCode, body: accessRes.body }, 'Access check response');
    expect(accessRes.statusCode).to.equal(200);
    expect(accessRes.body.ok).to.equal(true);
    expect(accessRes.body.hasAccess).to.equal(true);
    expect(accessRes.body.isOwner).to.equal(true);
  });

  it('should convert a guest user to a NEW regular user', async () => {
    const guestRes = await request(app).post('/v1/auth/guest').send({ dev: 'true' });
    expect(guestRes.statusCode).to.equal(200);
    const tempGuestToken = guestRes.body.user.token;
    const tempGuestEmail = guestRes.body.user.email;
    const tempGuestUser = await prisma.user.findUnique({ where: { email: tempGuestEmail } });
    expect(tempGuestUser).to.exist;
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
    expect(createRes.statusCode).to.equal(200);
    const nodeUuid = createRes.body.node.uuid;
    const nodeId = createRes.body.node.id;

    const fileUploadRes = await request(app)
      .post('/v1/data/update')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .field('uuid', nodeUuid)
      .field('contextPath', 'root')
      .attach('files', Buffer.from('test'), 'test.txt');

    expect(fileUploadRes.statusCode).to.equal(200);

    const dataReferences = await prisma.dataReference.findMany({
      where: { nodeId },
    });
    expect(dataReferences.length).to.equal(0); // Make sure no data references (guest)

    const guestDataRef = await prisma.guestDataReference.findFirst({
      where: { userId: guestId, path: 'root/test.txt' },
    });
    expect(guestDataRef).to.exist;

    const newEmail = `new-user-${Date.now()}@desci.com`;
    const magicCode = await testingGenerateMagicCode(newEmail);
    expect(magicCode).to.be.a('string');

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
    expect(convertRes.statusCode).to.equal(200);
    expect(convertRes.body.ok).to.equal(true);
    expect(convertRes.body.isNewUser).to.equal(true);
    expect(convertRes.body.user.email).to.equal(newEmail);
    expect(convertRes.body.user.isGuest).to.equal(false);
    expect(convertRes.body.user.name).to.equal('New Converted User');
    const newUserId = convertRes.body.user.id;

    const updatedUser = await prisma.user.findUnique({ where: { id: newUserId } });
    expect(updatedUser).to.not.be.null;
    expect(updatedUser?.email).to.equal(newEmail);
    expect(updatedUser?.isGuest).to.equal(false);
    expect(updatedUser?.convertedGuest).to.equal(true);

    const dataRefs = await prisma.dataReference.findMany({ where: { userId: newUserId } });
    const testFileRef = await prisma.dataReference.findFirst({
      where: { userId: guestId, path: 'root/test.txt' },
    });
    expect(dataRefs.length).to.be.greaterThan(0);
    expect(testFileRef).to.exist;
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
    expect(guestRes.statusCode).to.equal(200);
    const tempGuestToken = guestRes.body.user.token;
    const tempGuestEmail = guestRes.body.user.email;
    const tempGuestUser = await prisma.user.findUnique({ where: { email: tempGuestEmail } });
    expect(tempGuestUser).to.exist;
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
    expect(createRes.statusCode).to.equal(200);
    const nodeUuid = createRes.body.node.uuid;
    const nodeId = createRes.body.node.id;
    expect(createRes.body.node.ownerId).to.equal(guestId);

    const fileUploadRes = await request(app)
      .post('/v1/data/update')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .field('uuid', nodeUuid)
      .field('contextPath', 'root')
      .attach('files', Buffer.from('merge-test-data'), 'merge-test.txt');
    expect(fileUploadRes.statusCode).to.equal(200);

    const guestDataRef = await prisma.guestDataReference.findFirst({
      where: { userId: guestId, nodeId: nodeId, path: 'root/merge-test.txt' },
    });
    expect(guestDataRef).to.exist;

    const existingUserMagicCode = await testingGenerateMagicCode(existingEmail);
    expect(existingUserMagicCode).to.be.a('string');

    const convertRes = await request(app)
      .post('/v1/auth/guest/convert/email')
      .set('Authorization', `Bearer ${tempGuestToken}`)
      .send({
        email: existingEmail,
        magicCode: existingUserMagicCode,
        dev: 'true',
      });

    log.info({ status: convertRes.statusCode, body: convertRes.body }, 'Merge Conversion response');
    expect(convertRes.statusCode).to.equal(200);
    expect(convertRes.body.ok).to.equal(true);
    expect(convertRes.body.isNewUser).to.equal(false);
    expect(convertRes.body.user.email).to.equal(existingEmail);
    expect(convertRes.body.user.isGuest).to.equal(false);
    expect(convertRes.body.user.id).to.equal(existingUser.id);

    // Guest user should be deleted
    const deletedGuest = await prisma.user.findUnique({ where: { id: guestId } });
    expect(deletedGuest).to.be.null;

    const finalExistingUser = await prisma.user.findUnique({ where: { id: existingUser.id } });
    expect(finalExistingUser).to.not.be.null;
    expect(finalExistingUser?.email).to.equal(existingEmail);
    expect(finalExistingUser?.isGuest).to.equal(false);

    // Merging shouldn't mark the existing user as convertedGuest
    expect(finalExistingUser?.convertedGuest).to.equal(false);
    expect(finalExistingUser?.mergedIntoAt).to.have.length(1);

    const mergedNode = await prisma.node.findUnique({ where: { id: nodeId } });
    expect(mergedNode).to.exist;
    expect(mergedNode?.ownerId).to.equal(existingUser.id);

    // Verify DataReference was created/updated for the existing user
    const mergedDataRef = await prisma.dataReference.findFirst({
      where: {
        userId: existingUser.id,
        nodeId: nodeId,
        path: 'root/merge-test.txt',
      },
    });
    expect(mergedDataRef).to.exist;
    expect(mergedDataRef?.userId).to.equal(existingUser.id);
    expect(mergedDataRef?.size).to.equal(guestDataRef!.size);
    expect(mergedDataRef?.cid).to.equal(guestDataRef!.cid);
    expect(mergedDataRef?.rootCid).to.equal(guestDataRef!.rootCid);

    log.info({ existingUserId: existingUser.id, oldGuestId: guestId }, 'Guest successfully MERGED into EXISTING user');
  });
});
