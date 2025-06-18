import {
  PrismaClient,
  EditorRole,
  JournalEventLogAction,
  Journal,
  Prisma,
  JournalEditor,
  SubmissionStatus,
} from '@prisma/client';
import _ from 'lodash';
import { ok, err, Result } from 'neverthrow';

import { logger } from '../../logger.js';

const prisma = new PrismaClient();

interface CreateJournalInput {
  name: string;
  description?: string;
  iconCid?: string;
  ownerId: number;
}
async function createJournal(data: CreateJournalInput): Promise<Result<Journal, Error>> {
  try {
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
    return ok(journal);
  } catch (error) {
    logger.error({ error, data }, 'Failed to create journal');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during journal creation'));
  }
}

interface UpdateJournalInput {
  name?: string;
  description?: string;
  iconCid?: string;
}

async function updateJournal(
  journalId: number,
  userId: number,
  data: UpdateJournalInput,
): Promise<Result<Journal, Error>> {
  logger.trace({ journalId, data }, 'Updating journal');
  try {
    const journalBeforeUpdate = await prisma.journal.findUnique({
      where: { id: journalId },
    });

    if (!journalBeforeUpdate) {
      logger.warn({ journalId }, 'Journal not found for update');
      return err(new Error('Journal not found.'));
    }

    const changes: Record<string, { old: string | null; new: string }> = {};
    const fieldsToCompare: (keyof UpdateJournalInput)[] = ['name', 'description', 'iconCid'];

    for (const key of fieldsToCompare) {
      const newValue = data[key];
      const oldValue = journalBeforeUpdate[key];

      if (newValue !== undefined && newValue !== oldValue) {
        changes[key] = { old: oldValue as string | null, new: newValue };
      }
    }

    if (Object.keys(changes).length === 0) {
      logger.info({ journalId, userId, receivedData: data }, 'No changes to update.');
      return ok(journalBeforeUpdate);
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

    logger.info({ journalId, userId, actualChanges: changes }, 'Journal updated successfully');
    return ok(updatedJournal);
  } catch (error) {
    logger.error({ error, journalId, userId, data }, 'Failed to update journal');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during journal update'));
  }
}

export type JournalDetails = Prisma.JournalGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    iconCid: true;
    createdAt: true;
    editors: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            orcid: true;
          };
        };
      };
    };
  };
}> & {
  editors: Array<
    Prisma.JournalEditorGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            orcid: true;
          };
        };
      };
    }> & { currentWorkload: number }
  >;
};

async function getJournalById(journalId: number): Promise<Result<JournalDetails, Error>> {
  try {
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

    if (!journal) {
      logger.warn({ journalId }, 'Journal not found by ID');
      return err(new Error('Journal not found.'));
    }

    // Calculate current workload for each editor
    const editorsWithWorkload = await Promise.all(
      journal.editors.map(async (editor) => {
        const workloadCount = await prisma.journalSubmission.count({
          where: {
            journalId: journal.id,
            assignedEditorId: editor.userId,
            status: {
              notIn: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED],
            },
          },
        });

        return {
          ...editor,
          currentWorkload: workloadCount,
        };
      }),
    );

    const journalWithWorkload = {
      ...journal,
      editors: editorsWithWorkload,
    };

    return ok(journalWithWorkload);
  } catch (error) {
    logger.error({ error, journalId }, 'Failed to get journal by ID');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while fetching journal by ID'));
  }
}

export type ListedJournal = Prisma.JournalGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    iconCid: true;
    createdAt: true;
  };
}>;

/**
 * @param userId - The user ID to filter journals by. If not provided, all journals will be returned.
 */
async function listJournals(userId?: number): Promise<Result<ListedJournal[], Error>> {
  try {
    const whereClause: Prisma.JournalWhereInput = {};

    if (userId) {
      whereClause.editors = { some: { userId } };
    }

    const journals = await prisma.journal.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        iconCid: true,
        createdAt: true,
      },
      where: whereClause,
    });
    return ok(journals);
  } catch (error) {
    logger.error({ error }, 'Failed to list journals in service');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while listing journals'));
  }
}

async function removeEditorFromJournal(
  journalId: number,
  managerId: number,
  editorUserId: number,
): Promise<Result<void, Error>> {
  try {
    const editorBeingRemoved = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: editorUserId, journalId } },
    });

    logger.info(
      { journalId, managerId, editorUserId, editorBeingRemovedId: editorBeingRemoved?.id },
      'Attempting to remove editor from journal',
    );

    if (!editorBeingRemoved) {
      logger.warn({ journalId, managerId, editorUserId }, 'Editor not found for removal');
      return err(new Error('Editor not found.'));
    }

    if (editorBeingRemoved.userId === managerId) {
      logger.info({ journalId, managerId, editorUserId }, 'CHIEF_EDITOR attempted to remove themselves');
      return err(new Error('Cannot remove yourself as a CHIEF_EDITOR.'));
    }

    await prisma.$transaction([
      prisma.journalEventLog.create({
        data: {
          journalId,
          action: JournalEventLogAction.EDITOR_REMOVED,
          userId: managerId,
          details: {
            managerId,
            editorUserId,
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

    logger.info(
      { journalId, managerId, editorUserId, removedEditorId: editorBeingRemoved.id },
      'Editor removed successfully from journal',
    );
    return ok(undefined);
  } catch (error) {
    logger.error({ error, journalId, managerId, editorUserId }, 'Failed to remove editor from journal');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while removing editor'));
  }
}

async function updateEditorRole(
  journalId: number,
  managerId: number,
  editorUserId: number,
  role: EditorRole,
): Promise<Result<JournalEditor, Error>> {
  logger.trace({ journalId, managerId, editorUserId, role }, 'Attempting to update editor role');
  try {
    const editorBeingUpdated = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: editorUserId, journalId } },
    });

    if (!editorBeingUpdated) {
      logger.warn({ journalId, managerId, editorUserId, role }, 'Editor not found for role update');
      return err(new Error('Editor not found.'));
    }

    if (managerId === editorBeingUpdated.userId) {
      logger.warn({ journalId, managerId, editorUserId, role }, 'CHIEF_EDITOR attempted to change their own role');
      return err(new Error('Cannot demote yourself.'));
    }

    if (editorBeingUpdated.role === role) {
      logger.info(
        { journalId, managerId, editorUserId, role },
        'Editor role is already set to the target role. No update needed.',
      );
      return ok(undefined);
    }

    const [updatedEditor] = await prisma.$transaction([
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
            editorUserId,
            previousRole: editorBeingUpdated.role,
            newRole: role,
          },
        },
      }),
    ]);

    logger.info(
      { journalId, managerId, editorUserId, newRole: role, previousRole: editorBeingUpdated.role },
      'Editor role updated',
    );
    return ok(updatedEditor);
  } catch (error) {
    logger.error({ error, journalId, managerId, editorUserId, role }, 'Failed to update editor role');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while updating editor role'));
  }
}

/**
 * Update editor settings, configurable by the editor themselves.
 * @example expertise, workload.
 */
async function updateEditor(
  journalId: number,
  editorUserId: number,
  data: Prisma.JournalEditorUpdateInput,
): Promise<Result<JournalEditor, Error>> {
  logger.trace({ journalId, editorUserId }, 'Attempting to update editor role');
  try {
    const editorBeingUpdated = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: editorUserId, journalId } },
    });

    if (!editorBeingUpdated) {
      logger.warn({ journalId, editorUserId }, 'Editor not found for update');
      return err(new Error('Editor not found.'));
    }

    const filteredFields = ['expertise', 'maxWorkload'];
    const filteredInputs = _.pick(data, filteredFields);
    const previousData = _.pick(editorBeingUpdated, filteredFields);

    const [updatedEditor] = await prisma.$transaction([
      prisma.journalEditor.update({
        where: { id: editorBeingUpdated.id },
        data: filteredInputs,
      }),
      prisma.journalEventLog.create({
        data: {
          journalId,
          action: JournalEventLogAction.EDITOR_UPDATED,
          userId: editorUserId,
          details: {
            editorUserId,
            previousData: previousData as Prisma.InputJsonValue,
            newData: filteredInputs as Prisma.InputJsonValue,
          },
        },
      }),
    ]);

    logger.info(
      {
        journalId,
        editorUserId,
        newData: filteredInputs,
        previousData,
      },
      'Editor updated',
    );
    return ok(updatedEditor);
  } catch (error) {
    logger.error({ error, journalId, editorUserId }, 'Failed to update editor');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while updating editor'));
  }
}

async function getUserJournalRole(journalId: number, userId: number): Promise<Result<EditorRole, Error>> {
  const editor = await prisma.journalEditor.findUnique({
    where: { userId_journalId: { userId, journalId } },
  });

  if (!editor) {
    return err(new Error('Editor not found.'));
  }

  return ok(editor.role);
}

export const JournalManagementService = {
  createJournal,
  updateJournal,
  getJournalById,
  listJournals,
  removeEditorFromJournal,
  updateEditorRole,
  updateEditor,
  getUserJournalRole,
};
