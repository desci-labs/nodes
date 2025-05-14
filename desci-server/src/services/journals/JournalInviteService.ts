import { EditorRole, JournalEventLogAction } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

import { JournalEventLogService } from './JournalEventLogService.js';

const logger = parentLogger.child({
  module: 'Journals::JournalInviteService',
});

async function inviteJournalEditor({
  journalId,
  inviterId,
  email,
  role,
  inviteTtlDays = 7,
}: {
  journalId: number;
  inviterId: number;
  email?: string;
  role: EditorRole;
  inviteTtlDays?: number;
}) {
  logger.trace(
    { fn: 'inviteJournalEditor', journalId, inviterId, email, role, inviteTtlDays },
    'Inviting journal editor',
  );

  // TODO: Inviter has perms to invite to this journal

  if (!email) {
    throw new Error('Email required');
  }

  if (!journalId) {
    throw new Error('Journal ID required');
  }

  const journal = await prisma.journal.findUnique({
    where: {
      id: journalId,
    },
    select: {
      name: true,
      description: true,
      iconCid: true,
    },
  });

  if (!journal) {
    throw new Error('Journal not found');
  }

  const token = crypto.randomUUID();

  const invite = await prisma.editorInvite.create({
    data: {
      journalId,
      email,
      role,
      inviterId,
      expiresAt: new Date(Date.now() + inviteTtlDays * 24 * 60 * 60 * 1000),
      token,
    },
  });

  // Log event
  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.EDITOR_INVITED,
    userId: inviterId,
    details: {
      email,
      role,
    },
  });

  // sendEmail({journalName, journalDescription, journalIconCid, token})

  logger.info(
    {
      fn: 'inviteJournalEditor',
      invite: {
        ...invite,
        token: invite.token.slice(0, 4) + '...',
      },
    },
    'Invited journal editor',
  );

  return invite;
}

async function acceptJournalInvite({ token, userId }: { token: string; userId: number }) {
  const invite = await prisma.editorInvite.findUnique({
    where: {
      token,
    },
  });

  logger.trace(
    {
      fn: 'acceptJournalInvite',
      token: invite?.token.slice(0, 4) + '...',
      userId,
      invite: {
        ...invite,
        token: invite?.token.slice(0, 4) + '...',
      },
    },
    'Accepting journal invite',
  );

  const isValid = invite && invite.expiresAt > new Date() && invite.accepted === null;

  if (!invite) {
    throw new Error('Invite not found');
  }
  if (!isValid) {
    throw new Error('Invite expired');
  }

  const updatedInvite = await prisma.editorInvite.update({
    where: { id: invite.id },
    data: {
      accepted: true,
      decisionAt: new Date(),
    },
  });

  await JournalEventLogService.log({
    journalId: invite.journalId,
    action: JournalEventLogAction.EDITOR_ACCEPTED_INVITE,
    userId,
    details: {
      email: invite.email,
      role: invite.role,
      inviteId: invite.id,
    },
  });
  logger.info(
    {
      fn: 'acceptJournalInvite',
      userId,
      invite: {
        ...updatedInvite,
        token: updatedInvite.token,
      },
    },
    'Accepted journal invite',
  );
  return updatedInvite;
}

async function declineJournalInvite({ token }: { token: string }) {
  const invite = await prisma.editorInvite.findUnique({
    where: {
      token,
    },
  });

  logger.trace(
    {
      fn: 'declineJournalInvite',
      token: invite?.token.slice(0, 4) + '...',
      invite: {
        ...invite,
        token: invite?.token.slice(0, 4) + '...',
      },
    },
    'Declining journal invite',
  );

  const isValid = invite && invite.expiresAt > new Date() && invite.accepted === null;
  if (!invite) {
    throw new Error('Invite not found');
  }
  if (!isValid) {
    throw new Error('Invite expired');
  }

  const updatedInvite = await prisma.editorInvite.update({
    where: { id: invite.id },
    data: {
      accepted: false,
      decisionAt: new Date(),
    },
  });

  await JournalEventLogService.log({
    journalId: invite.journalId,
    action: JournalEventLogAction.EDITOR_DECLINED_INVITE,
    details: {
      role: invite.role,
      token: invite.token,
      inviteId: invite.id,
      email: invite.email,
    },
  });

  // TODO: Notify the inviter

  logger.info(
    {
      fn: 'declineJournalInvite',
      invite: {
        ...updatedInvite,
        token: updatedInvite.token,
      },
    },
    'Declined journal invite',
  );

  return updatedInvite;
}

export const JournalInviteService = {
  inviteJournalEditor,
  acceptJournalInvite,
  declineJournalInvite,
};
