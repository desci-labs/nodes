/**
 * Functions to assist with managing node access controls
 */

import assert from 'assert';
import { env } from 'process';

import { AuthorInviteStatus, ResearchCredits, ResearchRoles } from '@prisma/client';
import sgMail, { MailDataRequired } from '@sendgrid/mail';

import prisma from 'client';
import { AuthorInviteOptions, GrandAccessParams, TransferAccessParams } from 'controllers/nodes/types';
import createRandomCode from 'utils/createRandomCode';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const setNodeAdmin = async (userId: number, uuid: string, credit: ResearchCredits) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { role: ResearchRoles.ADMIN, credit } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  const result = await prisma.nodeAccess.create({ data: { uuid, userId, roleId: creditRole.id } });
  return result;
};

//* if user has access already, update roleId to new access role
export const grantNodeAccess = async ({ userId, uuid, credit, role }: GrandAccessParams) => {
  const prevAccess = await prisma.nodeAccess.findFirst({ where: { userId, uuid } });

  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { role, credit } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  if (prevAccess) {
    if (prevAccess.roleId === creditRole.id) return true;

    return await prisma.nodeAccess.update({ where: { id: prevAccess.id }, data: { roleId: creditRole.id } });
  }

  return await prisma.nodeAccess.create({ data: { uuid, userId, roleId: creditRole.id } });
};

export const revokeNodeAccess = async ({ userId, uuid, credit, role }: GrandAccessParams) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { role, credit } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  const nodeAccess = await prisma.nodeAccess.findFirst({ where: { uuid, userId } });

  if (!nodeAccess) return true;

  const result = await prisma.nodeAccess.delete({ where: { id: nodeAccess.id } });
  return result;
};

export const transferAdminAccess = async ({ senderId, receiverId, uuid, receiverRoleId }: TransferAccessParams) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { id: receiverRoleId } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  // revoke current admin access
  const senderAccess = await prisma.nodeAccess.findFirst({
    where: { userId: senderId, uuid, role: { role: ResearchRoles.ADMIN } },
  });

  const receiverAccess = await prisma.nodeAccess.findFirst({
    where: { userId: receiverId, uuid },
  });

  const [deletedAdmin, deletedReceiver, createResult] = await prisma.$transaction([
    prisma.nodeAccess.delete({ where: { id: senderAccess.id } }),
    prisma.nodeAccess.delete({ where: { id: receiverAccess.id } }),
    prisma.nodeAccess.createMany({
      data: [{ userId: receiverId, uuid, roleId: receiverRoleId }],
    }),
  ]);

  assert(deletedAdmin.id === senderAccess.id);
  assert(deletedReceiver.id === receiverAccess.id);
  assert(createResult.count === 1);
  return createResult;
};

export const grantNodeAccessByRoleId = async (userId: number, uuid: string, roleId: number) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { id: roleId } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  const result = await prisma.nodeAccess.create({ data: { uuid, userId, roleId: creditRole.id } });
  return result;
};

const sendAuthorInviteEmail = async (msg: MailDataRequired, data: AuthorInviteOptions & { token: string }) => {
  const { senderId, roleId, nodeId, token } = data;

  const email = data.email.toLowerCase();
  // const token = createRandomCode();

  const expiresAt = new Date('1980-01-01');
  await prisma.authorInvite.updateMany({
    where: { email, status: AuthorInviteStatus.PENDING },
    data: {
      expiresAt,
      expired: true,
      status: 'EXPIRED',
    },
  });

  const today = new Date();
  const In7Days = new Date();
  In7Days.setDate(today.getDate() + 7);

  console.log('Create author Invite', In7Days, data, msg);

  await prisma.authorInvite.create({
    data: {
      email,
      inviteCode: token,
      senderId,
      roleId,
      nodeId,
      expiresAt: In7Days,
    },
  });

  if (env.SHOULD_SEND_EMAIL) {
    console.log(`Sending actual email to ${email} token: ${token}`);

    // const url = `${env.DAPP_URL}/web/login?e=${email}&c=${token}`;
    // const msg = {
    //   to: email, // Change to your recipient
    //   from: 'no-reply@desci.com', // Change to your verified sender
    //   subject: `[nodes.desci.com] Verification: ${token}`,
    //   text: `Login with: ${token} ${url}`,
    //   html: `Welcome to DeSci Nodes, to access your account use the following code<br/><br/><a href="${url}" target="_blank">Login Now</a><br/><br/>Verification Code: ${token}`,
    // };

    try {
      await sgMail.send(msg);
      console.log('Email sent', msg);
    } catch (err) {
      console.error('Mail error', err);
    }
    return true;
  } else {
    const Reset = '\x1b[0m';
    const BgGreen = '\x1b[42m';
    const BgYellow = '\x1b[43m';
    const BIG_SIGNAL = `\n\n${BgYellow}$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$${Reset}\n\n`;
    console.log(
      `${BIG_SIGNAL}Simulating AuthorInvite email to ${email}\n\nToken: ${BgGreen}${token}${Reset}${BIG_SIGNAL}`,
    );
    return true;
  }
};

export const sendNodeAccessInvite = async (
  params: AuthorInviteOptions & {
    isAdminTransfer: boolean;
  },
) => {
  const email = params.email.toLowerCase();
  const token = createRandomCode();
  // const node = await prisma.node.findFirst({ where: { id: params.nodeId } });

  const url = `${env.DAPP_URL}/web/authorInvite?e=${email}&c=${token}`;
  const rejectUrl = `${env.DAPP_URL}/web/authorInvite?a=reject?e=${email}&c=${token}`;
  const msg = {
    to: email, // Change to your recipient
    from: 'no-reply@desci.com', // Change to your verified sender
    subject: `[nodes.desci.com] Node ${params.isAdminTransfer ? 'Admin' : ''} Access Invitation: ${token}`,
    text: `Accept or Reject Invitation with: ${token} ${url}`,
    html: `To accept the invitation click <br/><br/><a href="${url}" target="_blank">Accept</a><br/><br/>
    To reject the invitation click <br/><br/><a href="${rejectUrl}" target="_blank">Reject</a><br/><br/>        
    Invite Code: ${token}`,
  };

  delete params.isAdminTransfer;
  return sendAuthorInviteEmail(msg, { ...params, token });
};
