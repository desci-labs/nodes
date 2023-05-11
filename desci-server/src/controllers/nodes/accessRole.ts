import assert from 'assert';

import { AuthorInviteStatus, ResearchRoles } from '@prisma/client';
import { Response } from 'express';

import prisma from 'client';
import { RequestWithNodeAccess, RequestWithUser } from 'middleware/nodeGuard';
import { grantNodeAccess, sendNodeAccessInvite, transferAdminAccess } from 'services/nodeAccess';

export const getNodeAccessRoles = async (req: RequestWithUser, res: Response) => {
  try {
    const roles = await prisma.nodeCreditRoles.findMany({});
    res.send({ roles });
  } catch (e) {
    res.status(500).send({ message: 'Unknow Error occured' });
  }
};

export const sendAccessInvite = async (req: RequestWithNodeAccess, res: Response) => {
  try {
    const { roleId, email } = req.body;
    const role = await prisma.nodeCreditRoles.findFirst({ where: { id: roleId } });

    if (!(role && email)) {
      throw Error('Invalid role or email');
    }

    const isAdminTransfer = role.role === ResearchRoles.ADMIN;
    const userToInvite = await prisma.user.findFirst({ where: { email } });

    if (req.user.id === userToInvite?.id) {
      res.status(401).send({ ok: false });
      return;
    }

    await sendNodeAccessInvite({
      senderId: req.user.id,
      receiverId: userToInvite?.id,
      nodeId: req.node.id,
      roleId,
      email,
      isAdminTransfer,
    });

    res.send({ ok: true, message: 'Invitation sent' });
  } catch (error) {
    const err = error as any;
    console.log(err);
    res.status(500).send({ message: err.messasge || 'Unknow Error occured' });
  }
};

export const revokeAccess = async (req: RequestWithNodeAccess, res: Response) => {
  try {
    const { accessId } = req.body;
    const uuid = req.params.uuid;

    const accessToRevoke = await prisma.nodeAccess.findFirst({ where: { id: accessId } });
    const senderAccess = await prisma.nodeAccess.findFirst({
      where: { userId: req.user.id, uuid: uuid + '.', role: { role: ResearchRoles.ADMIN } },
    });

    if (!accessToRevoke) {
      res.status(400).send({ ok: true, message: 'Access Revoked!' });
      return;
    }

    assert(accessToRevoke.uuid === senderAccess.uuid);

    if (senderAccess.id === accessToRevoke.id) {
      res.status(400).send({ ok: true, message: 'Transfer Node ownership instead' });
      return;
    }

    await prisma.nodeAccess.delete({ where: { id: accessToRevoke.id } });

    res.send({ ok: true, message: 'Access Revoked!' });
  } catch (error) {
    const err = error as any;
    console.log(err);
    res.status(500).send({ message: err.messasge || 'Unknow Error occured' });
  }
};

export const acceptAuthorInvite = async (req: RequestWithUser, res: Response) => {
  try {
    const { inviteCode } = req.body;

    const invite = await prisma.authorInvite.findFirst({ where: { inviteCode: inviteCode.toString() } });

    const node = await prisma.node.findFirst({ where: { id: invite.nodeId } });

    // check invite belongs to loggedIn user
    const userToInvite = await prisma.user.findFirst({ where: { email: req.user.email } });

    if (!invite) {
      res.status(404).send({ ok: false, message: 'Invitation not found!' });
      return;
    }

    if (!node) {
      res.status(404).send({ ok: false, message: 'Node not found!' });
      return;
    }

    if (!(userToInvite && userToInvite.email)) {
      res.status(404).send({ ok: false, message: 'User or email not found, Update your email validate invitation!' });
      return;
    }

    if (invite.email.toLowerCase() !== userToInvite.email.toLowerCase()) {
      res.status(401).send({ ok: false, message: 'Invitation not yours!' });
      return;
    }

    if (invite.expiresAt.getTime() < Date.now() || invite.status === AuthorInviteStatus.EXPIRED) {
      // Expired invitation
      await prisma.authorInvite.update({ where: { id: invite.id }, data: { expired: true, status: 'EXPIRED' } });
      res.status(400).send({ ok: false, message: 'Invitation expired!' });
      return;
    }

    if (invite.status !== AuthorInviteStatus.PENDING) {
      res.status(404).send({ ok: false, message: 'Invitation invalid!' });
      return;
    }

    const role = await prisma.nodeCreditRoles.findFirst({ where: { id: invite.roleId } });

    if (!role) {
      throw Error('Invalid Access role');
    }

    const isAdminTransfer = role.role === ResearchRoles.ADMIN;

    if (isAdminTransfer) {
      await transferAdminAccess({
        uuid: node.uuid,
        senderId: invite.senderId,
        receiverId: req.user.id,
        receiverRoleId: invite.roleId,
      });
    } else {
      await grantNodeAccess({ userId: req.user.id, uuid: node.uuid, credit: role.credit, role: role.role });
    }

    await prisma.authorInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } });
    res.send({ ok: true });
  } catch (error) {
    const err = error as any;
    console.log('err', err);
    res.status(500).send({ message: err.messasge || 'Unknow Error occured' });
  }
};

export const rejectAuthorInvite = async (req: RequestWithUser, res: Response) => {
  try {
    const { inviteCode } = req.body;

    const invite = await prisma.authorInvite.findFirst({ where: { inviteCode } });

    // check invite belongs to loggedIn user
    const userToInvite = await prisma.user.findFirst({ where: { email: req.user.email } });

    if (!invite) {
      res.status(404).send({ ok: false, message: 'Invitation not found!' });
      return;
    }

    if (!(userToInvite && userToInvite.email)) {
      res.status(404).send({ ok: false, message: 'User or email not found, Update your email validate invitation!' });
      return;
    }

    if (invite.email.toLowerCase() !== userToInvite.email.toLowerCase()) {
      res.status(401).send({ ok: false, message: 'Invitation not yours!' });
      return;
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      // Expired invitation
      await prisma.authorInvite.update({ where: { id: invite.id }, data: { expired: true } });
      res.status(400).send({ ok: false, message: 'Invitation expired!' });
      return;
    }

    await prisma.authorInvite.update({ where: { id: invite.id }, data: { status: 'REJECTED' } });

    res.send({ ok: true });
  } catch (error) {
    const err = error as any;
    res.status(500).send({ message: err.messasge || 'Unknow Error occured' });
  }
};
