import { PrismaClient, EditorRole, JournalEventLogAction } from '@prisma/client';

import { logger } from '../../logger.js';

const prisma = new PrismaClient();

interface CreateJournalInput {
  name: string;
  description?: string;
  iconCid?: string;
  ownerId: number;
}
async function createJournal(data: CreateJournalInput) {
  const journal = await prisma.journal.create({
    data: {
      name: data.name,
      description: data.description,
      iconCid: data.iconCid,
      editors: {
        create: {
          userId: data.ownerId,
          role: EditorRole.CHIEF_EDITOR,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      },
    },
  });
  await prisma.journalEventLog.create({
    data: {
      journalId: journal.id,
      action: JournalEventLogAction.JOURNAL_CREATED,
      userId: data.ownerId,
      details: {
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
      },
    },
  });
  return journal;
}

interface UpdateJournalInput {
  name?: string;
  description?: string;
  iconCid?: string;
}

async function updateJournal(journalId: number, userId: number, data: UpdateJournalInput) {
  logger.trace({ journalId, data }, 'Updating journal');
  const journalBeforeUpdate = await prisma.journal.findUnique({
    where: { id: journalId },
  });

  if (!journalBeforeUpdate) {
    throw new Error(`Journal not found.`);
  }

  const changes: Record<string, { old: string | null; new: string }> = {};
  const fieldsToCompare: (keyof UpdateJournalInput)[] = ['name', 'description', 'iconCid'];

  for (const key of fieldsToCompare) {
    const newValue = data[key];
    const oldValue = journalBeforeUpdate[key];

    if (newValue !== undefined && newValue !== oldValue) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }

  const [updatedJournal] = await prisma.$transaction([
    prisma.journal.update({
      where: { id: journalId },
      data: {
        // Prisma handles undefineds, their fields won't be changed.
        name: data.name,
        description: data.description,
        iconCid: data.iconCid,
      },
    }),
    prisma.journalEventLog.create({
      data: {
        journalId: journalId,
        action: JournalEventLogAction.JOURNAL_UPDATED,
        userId,
        details: changes,
      },
    }),
  ]);

  logger.info({ journalId, userId, changes }, 'Journal updated');

  return updatedJournal;
}

async function getJournalById(journalId: number) {
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
    select: {
      id: true,
      name: true,
      description: true,
      iconCid: true,
      createdAt: true,
      editors: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              orcid: true,
            },
          },
        },
      },
    },
  });
  return journal;
}

async function listJournals() {
  const journals = await prisma.journal.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      iconCid: true,
      createdAt: true,
    },
  });
  return journals;
}

async function removeEditorFromJournal(journalId: number, managerId: number, editorId: number) {
  const editorBeingRemoved = await prisma.journalEditor.findUnique({
    where: { userId_journalId: { userId: editorId, journalId } },
  });

  logger.info({ journalId, managerId, editorId, editorBeingRemoved }, 'Removing editor from journal');

  if (!editorBeingRemoved) {
    throw new Error(`Editor not found.`);
  }

  await prisma.$transaction([
    prisma.journalEventLog.create({
      data: {
        journalId,
        action: JournalEventLogAction.EDITOR_REMOVED,
        userId: managerId,
        details: {
          managerId,
          editorId,
          editorEntry: {
            ...editorBeingRemoved,
            invitedAt: editorBeingRemoved.invitedAt.toISOString(),
            acceptedAt: editorBeingRemoved.acceptedAt ? editorBeingRemoved.acceptedAt.toISOString() : null,
          },
        },
      },
    }),
    prisma.journalEditor.delete({
      where: { id: editorBeingRemoved.id },
    }),
  ]);

  logger.info({ journalId, managerId, editorId, editorEntry: editorBeingRemoved }, 'Editor removed from journal');
}

async function updateEditorRole(journalId: number, managerId: number, editorId: number, role: EditorRole) {
  const editorBeingUpdated = await prisma.journalEditor.findUnique({
    where: { userId_journalId: { userId: editorId, journalId } },
  });

  logger.trace({ journalId, managerId, editorId, editorBeingUpdated }, 'Updating editor role');

  if (managerId === editorBeingUpdated?.userId) {
    throw new Error(`Cannot demote yourself.`);
  }

  if (!editorBeingUpdated) {
    throw new Error(`Editor not found.`);
  }

  await prisma.$transaction([
    prisma.journalEditor.update({
      where: { id: editorBeingUpdated.id },
      data: { role },
    }),
    prisma.journalEventLog.create({
      data: {
        journalId,
        action: JournalEventLogAction.EDITOR_ROLE_CHANGED,
        userId: managerId,
        details: {
          managerId,
          editorId,
          previousRole: editorBeingUpdated.role,
          newRole: role,
        },
      },
    }),
  ]);

  logger.info({ journalId, managerId, editorId, role }, 'Editor role updated');
}

export const JournalManagementService = {
  createJournal,
  updateJournal,
  getJournalById,
  listJournals,
  removeEditorFromJournal,
  updateEditorRole,
};
