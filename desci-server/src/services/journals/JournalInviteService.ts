import { EditorRole } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

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

  // sendEmail({journalName, journalDescription, journalIconCid, token})

  return invite;
}

async function acceptJournalInvite({ token }: { token: string }) {
  const invite = await prisma.editorInvite.findUnique({
    where: {
      token,
    },
  });

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

  // TODO: Log event
  // TODO: Notify the inviter

  return updatedInvite;
}

async function declineJournalInvite({ token }: { token: string }) {
  const invite = await prisma.editorInvite.findUnique({
    where: {
      token,
    },
  });

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

  // TODO: Log event
  // TODO: Notify the inviter
  return updatedInvite;
}

export const JournalInviteService = {
  inviteJournalEditor,
  acceptJournalInvite,
  declineJournalInvite,
};
