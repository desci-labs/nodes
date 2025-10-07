import { EditorRole, JournalEventLogAction } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { EmailTypes, sendEmail } from '../email/email.js';
import { NotificationService } from '../Notifications/NotificationService.js';

import { JournalEventLogService } from './JournalEventLogService.js';

const logger = parentLogger.child({
  module: 'Journals::JournalInviteService',
});

async function inviteJournalEditor({
  journalId,
  inviterId,
  email,
  role,
  name,
  inviteTtlDays = 7,
}: {
  journalId: number;
  inviterId: number;
  email?: string;
  role: EditorRole;
  name: string;
  inviteTtlDays?: number;
}) {
  logger.trace(
    { fn: 'inviteJournalEditor', journalId, inviterId, email, role, inviteTtlDays, name },
    'Inviting journal editor',
  );

  const inviter = await prisma.user.findUnique({
    where: {
      id: inviterId,
    },
  });

  if (!email) {
    throw new Error('Email required');
  }

  const inviteeExistingUser = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (!journalId) {
    throw new Error('Journal ID required');
  }

  const journal = await prisma.journal.findUnique({
    where: {
      id: journalId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      iconCid: true,
    },
  });

  if (!journal) {
    throw new Error('Journal not found');
  }

  const token = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.editorInvite.create({
      data: {
        journalId,
        email,
        name,
        role,
        inviterId,
        expiresAt: new Date(Date.now() + inviteTtlDays * 24 * 60 * 60 * 1000),
        token,
      },
    });

    await JournalEventLogService.log({
      journalId,
      action: JournalEventLogAction.EDITOR_INVITED,
      userId: inviterId,
      details: {
        email,
        role,
      },
    });

    return invite;
  });

  try {
    const recipientName = inviteeExistingUser?.name || name;
    await sendEmail({
      type: EmailTypes.EDITOR_INVITE,
      payload: {
        email,
        journal,
        recipientName,
        inviterName: inviter.name,
        role,
        inviteToken: token,
      },
    });

    if (inviteeExistingUser) {
      await NotificationService.emitOnJournalEditorInvite({
        journal,
        editor: inviteeExistingUser,
        inviter,
        role,
      });
    }
  } catch (error) {
    logger.error(
      { fn: 'inviteJournalEditor', error, email, journalId, inviterId, existingUserId: inviteeExistingUser?.id },
      'Notification push failed',
    );
  }

  logger.info(
    {
      fn: 'inviteJournalEditor',
      invite: {
        ...result,
        token: result.token.slice(0, 4) + '...',
      },
    },
    'Invited journal editor',
  );

  return result;
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

  if (invite?.accepted === true && invite.decisionAt !== null) {
    return invite;
  }

  const isValid = invite && invite.expiresAt > new Date() && invite.accepted === null;

  if (!invite) {
    throw new Error('Invite not found');
  }
  if (!isValid) {
    throw new Error('Invite expired');
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updatedInvite = await tx.editorInvite.update({
      where: { id: invite.id },
      data: {
        accepted: true,
        decisionAt: now,
      },
    });

    await tx.journalEditor.create({
      data: {
        journalId: invite.journalId,
        userId,
        role: invite.role,
        invitedAt: invite.createdAt,
        acceptedAt: now,
        inviterId: invite.inviterId,
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

    return updatedInvite;
  });

  logger.info(
    {
      fn: 'acceptJournalInvite',
      userId,
      invite: {
        ...result,
        token: result.token,
      },
    },
    'Accepted journal invite',
  );
  return result;
}

async function declineJournalInvite({ token, userId }: { token: string; userId?: number }) {
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
      userId,
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

  const result = await prisma.$transaction(async (tx) => {
    const updatedInvite = await tx.editorInvite.update({
      where: { id: invite.id },
      data: {
        accepted: false,
        decisionAt: new Date(),
      },
    });

    await tx.journalEventLog.create({
      data: {
        journal: {
          connect: { id: invite.journalId },
        },
        user: userId ? { connect: { id: userId } } : undefined,
        action: JournalEventLogAction.EDITOR_DECLINED_INVITE,
        details: {
          role: invite.role,
          token: invite.token,
          inviteId: invite.id,
          email: invite.email,
        },
      },
    });

    return updatedInvite;
  });

  // TODO: Notify the inviter

  logger.info(
    {
      fn: 'declineJournalInvite',
      invite: {
        ...result,
        token: result.token,
      },
      userId,
    },
    'Declined journal invite',
  );

  return result;
}

async function resendEditorInvite({
  inviteId,
  journalId,
  inviterId,
  inviteTtlDays = 7,
}: {
  inviteId: number;
  journalId: number;
  inviterId: number;
  inviteTtlDays?: number;
}) {
  logger.trace({ fn: 'resendEditorInvite', inviteId, journalId, inviterId, inviteTtlDays }, 'Resending editor invite');

  // Check if invite exists and get current status
  const existingInvite = await prisma.editorInvite.findUnique({
    where: {
      id: inviteId,
    },
  });

  if (!existingInvite) {
    throw new Error('Invite not found');
  }

  // Verify the invite belongs to the specified journal
  if (existingInvite.journalId !== journalId) {
    throw new Error('Invite not found for this journal');
  }

  // Check if invite has already been accepted or declined
  if (existingInvite.accepted !== null) {
    throw new Error('Cannot resend invite that has already been responded to');
  }

  // Check if invite is expired
  const now = new Date();
  if (existingInvite.expiresAt <= now) {
    logger.info(
      { fn: 'resendEditorInvite', inviteId, expiresAt: existingInvite.expiresAt, now },
      'Invite is expired, updating with new expiry',
    );
  }

  // Get journal and inviter details
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
    select: {
      id: true,
      name: true,
      description: true,
      iconCid: true,
    },
  });

  if (!journal) {
    throw new Error('Journal not found');
  }

  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
  });

  if (!inviter) {
    throw new Error('Inviter not found');
  }

  // Get invitee user if they exist
  const inviteeExistingUser = await prisma.user.findUnique({
    where: {
      email: existingInvite.email.toLowerCase(),
    },
  });

  // Generate new token and update expiry
  const newToken = crypto.randomUUID();
  const newExpiresAt = new Date(Date.now() + inviteTtlDays * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const updatedInvite = await tx.editorInvite.update({
      where: { id: inviteId },
      data: {
        token: newToken,
        expiresAt: newExpiresAt,
        // Reset decision status to pending
        accepted: null,
        decisionAt: null,
      },
    });

    await JournalEventLogService.log({
      journalId,
      action: JournalEventLogAction.EDITOR_INVITED,
      userId: inviterId,
      details: {
        email: existingInvite.email,
        role: existingInvite.role,
        originalInviteId: inviteId,
        newExpiresAt,
        resent: true,
      },
    });

    return updatedInvite;
  });

  try {
    const recipientName = inviteeExistingUser?.name || existingInvite.email;
    await sendEmail({
      type: EmailTypes.EDITOR_INVITE,
      payload: {
        email: existingInvite.email,
        journal,
        recipientName,
        inviterName: inviter.name,
        role: existingInvite.role,
        inviteToken: newToken,
      },
    });

    if (inviteeExistingUser) {
      await NotificationService.emitOnJournalEditorInvite({
        journal,
        editor: inviteeExistingUser,
        inviter,
        role: existingInvite.role,
      });
    }
  } catch (error) {
    logger.error(
      { fn: 'resendEditorInvite', error, email: existingInvite.email, journalId, inviterId },
      'Notification push failed',
    );
  }

  logger.info(
    {
      fn: 'resendEditorInvite',
      invite: {
        ...result,
        token: result.token.slice(0, 4) + '...',
      },
    },
    'Resent editor invite',
  );

  return result;
}

export const JournalInviteService = {
  inviteJournalEditor,
  acceptJournalInvite,
  declineJournalInvite,
  resendEditorInvite,
};
